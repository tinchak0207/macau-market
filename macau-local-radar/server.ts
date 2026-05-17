import express from "express";
import path from "path";
import axios from "axios";
import { createServer as createViteServer } from "vite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const IAM_BASE_URL = "https://app.iam.gov.mo/marketinfo";
const PORT = Number(process.env.PORT || 3000);
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;
const RECIPE_CACHE_TTL_MS = 5 * 60 * 1000;
const BACKGROUND_PRICE_REFRESH_MS = 15 * 60 * 1000;
const BACKGROUND_RECIPE_REFRESH_MS = 10 * 60 * 1000;
const DAILY_WARM_CHECK_MS = 15 * 60 * 1000;
const DAILY_WARM_HOUR = Number(process.env.PRICE_WARM_HOUR || 6);
const PRICE_WARMUP_CONCURRENCY = Number(process.env.PRICE_WARMUP_CONCURRENCY || 4);
const CRON_SECRET = process.env.APP_CRON_SECRET || "";
const TIME_ZONE = process.env.TZ || "Asia/Hong_Kong";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";
const SUPABASE_CAN_WRITE = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const CATEGORY_CACHE_TTL_MS = 30 * 60 * 1000;
const GOODS_CACHE_TTL_MS = 30 * 60 * 1000;

type JsonRecord = Record<string, any>;

type RecipeIngredient = {
  ingredient_name: string;
  quantity_kg: number | string;
  goods_id?: string | null;
  notes?: string | null;
};

type RecipeRow = {
  id: number;
  name_cn: string;
  description?: string | null;
  servings?: number | null;
  cuisine?: string | null;
  image_emoji?: string | null;
  recipe_ingredient?: RecipeIngredient[];
};

type NormalizedPriceRow = {
  goods_id: string;
  goods_item_id: string | null;
  market_id: string;
  market_name: string;
  unit: number;
  low_price: number | null;
  avg_price: number | null;
  high_price: number | null;
  normalized_price: number;
  snapshot_at: string;
  source: "iam" | "db" | "estimate";
};

type CachedValue<T> = {
  value: T;
  fetchedAt: number;
};

type RecipeSnapshot = {
  recipe_id: number;
  total_cost: number;
  servings: number;
  ingredients_json: any[];
  computed_at: string;
};

const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

if (supabase) {
  console.log("Supabase client initialized.");
}

const priceCache = new Map<string, CachedValue<NormalizedPriceRow[]>>();
const recipeCache = new Map<string, CachedValue<any[]>>();
const goodsCache = new Map<string, CachedValue<any[]>>();
let categoriesCache: CachedValue<any[]> | null = null;
const inFlightPriceRefresh = new Map<string, Promise<NormalizedPriceRow[]>>();
const inFlightGoodsRequests = new Map<string, Promise<any[]>>();
let categoriesRefreshPromise: Promise<any[]> | null = null;
let recipeRefreshPromise: Promise<any[]> | null = null;
let dailyPriceWarmPromise: Promise<void> | null = null;
let lastDailyWarmDate = "";

const FALLBACK_RECIPES: RecipeRow[] = [
  {
    id: 1,
    name_cn: "番茄炒蛋",
    description: "家常快手菜，酸甜開胃，配飯最穩陣。",
    image_emoji: "🍅",
    cuisine: "cantonese",
    servings: 2,
    recipe_ingredient: [
      { ingredient_name: "番茄", quantity_kg: 0.35, notes: "參考 The Woks of Life 的家常做法" },
      { ingredient_name: "雞蛋", quantity_kg: 0.22 },
    ],
  },
  {
    id: 2,
    name_cn: "菜心蒜蓉炒",
    description: "當造蔬菜最快完成，成本低，晚餐好搭配。",
    image_emoji: "🥬",
    cuisine: "cantonese",
    servings: 2,
    recipe_ingredient: [
      { ingredient_name: "菜心", quantity_kg: 0.45, notes: "參考粵式青菜快炒方向" },
      { ingredient_name: "蒜頭", quantity_kg: 0.03 },
    ],
  },
  {
    id: 3,
    name_cn: "番茄蛋花湯",
    description: "十五分鐘內完成，清爽又有飽足感。",
    image_emoji: "🥣",
    cuisine: "cantonese",
    servings: 2,
    recipe_ingredient: [
      { ingredient_name: "番茄", quantity_kg: 0.3, notes: "可加蔥粒提升香氣" },
      { ingredient_name: "雞蛋", quantity_kg: 0.18 },
      { ingredient_name: "薑", quantity_kg: 0.02 },
    ],
  },
  {
    id: 4,
    name_cn: "清蒸魚",
    description: "粵式家常代表，食材簡單，重點在鮮味。",
    image_emoji: "🐟",
    cuisine: "cantonese",
    servings: 2,
    recipe_ingredient: [
      { ingredient_name: "魚", quantity_kg: 0.55, notes: "參考 Made With Lau 粵式蒸魚思路" },
      { ingredient_name: "薑", quantity_kg: 0.03 },
      { ingredient_name: "蔥", quantity_kg: 0.03 },
    ],
  },
  {
    id: 5,
    name_cn: "白菜仔湯",
    description: "簡單清湯，適合配煎炒主菜。",
    image_emoji: "🥣",
    cuisine: "cantonese",
    servings: 2,
    recipe_ingredient: [
      { ingredient_name: "白菜", quantity_kg: 0.4, notes: "走清甜路線，適合家庭晚餐" },
      { ingredient_name: "薑", quantity_kg: 0.02 },
    ],
  },
  {
    id: 6,
    name_cn: "鮮魷炒白菜",
    description: "海鮮加時蔬，口感爽脆，適合平日晚餐。",
    image_emoji: "🦑",
    cuisine: "cantonese",
    servings: 2,
    recipe_ingredient: [
      { ingredient_name: "鮮魷", quantity_kg: 0.32 },
      { ingredient_name: "白菜", quantity_kg: 0.3 },
      { ingredient_name: "蒜頭", quantity_kg: 0.02 },
    ],
  },
];

function buildRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getCacheKey(goodsId: string, goodsItemId?: string | null) {
  return `${goodsId}::${goodsItemId || "none"}`;
}

function isFresh(fetchedAt: number, ttlMs: number) {
  return Date.now() - fetchedAt < ttlMs;
}

function getLocalDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

function getLocalHour(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: TIME_ZONE,
    }).format(date),
  );
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isDefined<T>(value: T | null): value is T {
  return value !== null;
}

function chooseNormalizedPrice(input: JsonRecord) {
  return (
    toNumber(input.low_catty_price) ??
    toNumber(input.avg_catty_price) ??
    toNumber(input.price) ??
    toNumber(input.low_price) ??
    toNumber(input.avg_price) ??
    toNumber(input.high_price) ??
    0
  );
}

function estimateIngredientPricePerKg(name: string) {
  if (!name) return 30;
  const lower = name.toLowerCase();

  if (
    lower.includes("菜") ||
    lower.includes("蔬") ||
    lower.includes("白菜") ||
    lower.includes("菜心") ||
    lower.includes("greens") ||
    lower.includes("leaf")
  ) return 25;

  if (
    lower.includes("肉") ||
    lower.includes("豬") ||
    lower.includes("牛") ||
    lower.includes("pork") ||
    lower.includes("beef")
  ) return 80;

  if (
    lower.includes("魚") ||
    lower.includes("鮮魷") ||
    lower.includes("魷") ||
    lower.includes("fish") ||
    lower.includes("squid")
  ) return 70;

  if (lower.includes("蛋") || lower.includes("egg")) return 20;
  if (lower.includes("番茄") || lower.includes("tomato")) return 18;
  if (lower.includes("薑") || lower.includes("ginger")) return 32;
  if (lower.includes("蒜") || lower.includes("garlic")) return 28;
  if (lower.includes("蔥") || lower.includes("scallion")) return 24;

  return 30;
}

function requireCronAuth(req: express.Request) {
  if (!CRON_SECRET) {
    return true;
  }

  return req.headers.authorization === `Bearer ${CRON_SECRET}`;
}

function normalizeIamPrices(
  goodsId: string,
  goodsItemId: string | null | undefined,
  rawList: JsonRecord[],
): NormalizedPriceRow[] {
  const snapshotAt = new Date().toISOString();

  return rawList
    .map((row) => {
      const normalizedPrice = chooseNormalizedPrice(row);
      const marketId = String(row.market_id || row.id || "");
      if (!marketId || normalizedPrice <= 0) {
        return null;
      }

      return {
        goods_id: goodsId,
        goods_item_id: goodsItemId || null,
        market_id: marketId,
        market_name: String(row.market_name || row.name || "Unknown market"),
        unit: 2,
        low_price: toNumber(row.low_catty_price) ?? toNumber(row.low_price),
        avg_price: toNumber(row.avg_catty_price) ?? toNumber(row.avg_price),
        high_price: toNumber(row.high_catty_price) ?? toNumber(row.high_price),
        normalized_price: normalizedPrice,
        snapshot_at: String(row.snapshot_at || snapshotAt),
        source: "iam" as const,
      };
    })
    .filter(isDefined)
    .sort((a, b) => a.normalized_price - b.normalized_price);
}

function normalizeDbPrices(rows: JsonRecord[]): NormalizedPriceRow[] {
  return rows
    .map((row) => {
      const normalizedPrice = chooseNormalizedPrice(row);
      if (!row.goods_id || !row.market_id || normalizedPrice <= 0) {
        return null;
      }

      return {
        goods_id: String(row.goods_id),
        goods_item_id: row.goods_item_id ? String(row.goods_item_id) : null,
        market_id: String(row.market_id),
        market_name: String(row.market_name || "Unknown market"),
        unit: Number(row.unit || 2),
        low_price: toNumber(row.low_price),
        avg_price: toNumber(row.avg_price),
        high_price: toNumber(row.high_price),
        normalized_price: normalizedPrice,
        snapshot_at: String(row.snapshot_at || row.updated_at || new Date().toISOString()),
        source: "db" as const,
      };
    })
    .filter(isDefined)
    .sort((a, b) => a.normalized_price - b.normalized_price);
}

async function fetchIamList(endpoint: string, body: JsonRecord, timeout = 8000) {
  const response = await axios.post(
    `${IAM_BASE_URL}${endpoint}`,
    {
      head: { request_id: buildRequestId(), version: "1.0.0" },
      body: { ...body, lang: "CN" },
    },
    { timeout },
  );

  if (response.data?.head?.code && response.data.head.code !== "00") {
    throw new Error(`IAM returned code ${response.data.head.code}`);
  }

  return response.data;
}

async function fetchCategoriesFromIam() {
  const data = await fetchIamList("/goods/getGoodsCategory", {});
  const list = data?.body?.goods_category_list;
  if (!Array.isArray(list)) {
    throw new Error("Invalid categories payload");
  }

  return list.map((item: JsonRecord) => ({
    id: String(item.id),
    name_cn: String(item.goods_category_name || ""),
  }));
}

async function fetchGoodsFromIam(categoryId: string) {
  const data = await fetchIamList("/goods/getGoodsList", { goods_category_id: categoryId });
  const list = data?.body?.goods_list;
  if (!Array.isArray(list)) {
    throw new Error("Invalid goods payload");
  }

  return list.map((item: JsonRecord) => ({
    goods_id: String(item.id),
    goods_name: String(item.goods_name || ""),
    goods_item_id: String(item.goods_category_id || categoryId),
  }));
}

async function fetchIamPrices(goodsId: string, goodsItemId?: string | null) {
  const body: JsonRecord = { goods_id: goodsId, unit: 2 };
  if (goodsItemId) {
    body.goods_item_id = goodsItemId;
  }

  const data = await fetchIamList("/goodsPrice/getGoodsPriceByMarket", body, 5000);
  const list = data?.body?.goods_price_list;
  if (!Array.isArray(list)) {
    return [];
  }

  return normalizeIamPrices(goodsId, goodsItemId, list);
}

async function syncWithSupabase(table: string, data: JsonRecord | JsonRecord[], onConflict?: string) {
  if (!supabase || !SUPABASE_CAN_WRITE) return;

  try {
    const query = supabase.from(table).upsert(data, onConflict ? { onConflict } : undefined);
    const { error } = await query;
    if (error) {
      console.log(`Supabase upsert failed on ${table}:`, error.message);
    }
  } catch (error: any) {
    console.log(`Supabase upsert failed on ${table}:`, error.message);
  }
}

async function readLatestPricesFromDb(goodsId: string, goodsItemId?: string | null) {
  if (!supabase) return [];

  try {
    let query = supabase
      .from("latest_market_item_price")
      .select("*")
      .eq("goods_id", goodsId)
      .order("normalized_price", { ascending: true });

    if (goodsItemId) {
      query = query.eq("goods_item_id", goodsItemId);
    }

    const { data, error } = await query;
    if (error || !data) {
      if (error) {
        console.log("Latest price DB read failed:", error.message);
      }
      return [];
    }

    return normalizeDbPrices(data);
  } catch (error: any) {
    console.log("Latest price DB read failed:", error.message);
    return [];
  }
}

async function writeLatestPrices(goodsId: string, goodsItemId: string | null | undefined, rows: NormalizedPriceRow[]) {
  if (!rows.length) return;

  await syncWithSupabase(
    "latest_market_item_price",
    rows.map((row) => ({
      goods_id: row.goods_id,
      goods_item_id: goodsItemId || null,
      market_id: row.market_id,
      market_name: row.market_name,
      unit: row.unit,
      low_price: row.low_price,
      avg_price: row.avg_price,
      high_price: row.high_price,
      normalized_price: row.normalized_price,
      snapshot_at: row.snapshot_at,
      updated_at: new Date().toISOString(),
    })),
    "goods_id,goods_item_id,market_id,unit",
  );

  await syncWithSupabase(
    "market_item_price_snapshot",
    rows.map((row) => ({
      goods_id: row.goods_id,
      market_id: row.market_id,
      unit: row.unit,
      low_price: row.low_price,
      avg_price: row.avg_price,
      high_price: row.high_price,
      snapshot_at: row.snapshot_at,
    })),
  );
}

async function refreshPriceCache(goodsId: string, goodsItemId?: string | null) {
  if (goodsId.startsWith("est-")) {
    return [];
  }

  const cacheKey = getCacheKey(goodsId, goodsItemId);
  const existing = inFlightPriceRefresh.get(cacheKey);
  if (existing) {
    return existing;
  }

  const refreshPromise = (async () => {
    try {
      const freshRows = await fetchIamPrices(goodsId, goodsItemId);
      if (freshRows.length) {
        priceCache.set(cacheKey, { value: freshRows, fetchedAt: Date.now() });
        await writeLatestPrices(goodsId, goodsItemId, freshRows);
      }
      return freshRows;
    } finally {
      inFlightPriceRefresh.delete(cacheKey);
    }
  })();

  inFlightPriceRefresh.set(cacheKey, refreshPromise);
  return refreshPromise;
}

function triggerBackgroundPriceRefresh(goodsId: string, goodsItemId?: string | null) {
  void refreshPriceCache(goodsId, goodsItemId).catch((error) => {
    console.log(`Background refresh failed for ${goodsId}:`, error.message);
  });
}

async function getOrLoadPrices(goodsId: string, goodsItemId?: string | null) {
  const cacheKey = getCacheKey(goodsId, goodsItemId);
  const cached = priceCache.get(cacheKey);
  if (cached && cached.value.length && isFresh(cached.fetchedAt, PRICE_CACHE_TTL_MS)) {
    return cached.value;
  }

  const dbRows = await readLatestPricesFromDb(goodsId, goodsItemId);
  if (dbRows.length) {
    priceCache.set(cacheKey, { value: dbRows, fetchedAt: Date.now() });
    if (!cached || !isFresh(cached.fetchedAt, BACKGROUND_PRICE_REFRESH_MS)) {
      triggerBackgroundPriceRefresh(goodsId, goodsItemId);
    }
    return dbRows;
  }

  return refreshPriceCache(goodsId, goodsItemId);
}

async function getOrLoadCategories() {
  if (categoriesCache && categoriesCache.value.length && isFresh(categoriesCache.fetchedAt, CATEGORY_CACHE_TTL_MS)) {
    return categoriesCache.value;
  }

  if (categoriesRefreshPromise) {
    return categoriesRefreshPromise;
  }

  categoriesRefreshPromise = fetchCategoriesFromIam()
    .then(async (categories) => {
      categoriesCache = { value: categories, fetchedAt: Date.now() };
      await syncWithSupabase("goods_category", categories, "id");
      return categories;
    })
    .finally(() => {
      categoriesRefreshPromise = null;
    });

  return categoriesRefreshPromise;
}

async function getOrLoadGoods(categoryId: string) {
  const cached = goodsCache.get(categoryId);
  if (cached && isFresh(cached.fetchedAt, GOODS_CACHE_TTL_MS)) {
    return cached.value;
  }

  const existing = inFlightGoodsRequests.get(categoryId);
  if (existing) {
    return existing;
  }

  const request = fetchGoodsFromIam(categoryId)
    .then(async (goods) => {
      goodsCache.set(categoryId, { value: goods, fetchedAt: Date.now() });
      await syncWithSupabase(
        "goods_item",
        goods.map((item) => ({
          id: item.goods_id,
          goods_id: item.goods_id,
          category_id: categoryId,
          name_cn: item.goods_name,
          default_unit: 2,
          updated_at: new Date().toISOString(),
        })),
        "goods_id",
      );
      return goods;
    })
    .finally(() => {
      inFlightGoodsRequests.delete(categoryId);
    });

  inFlightGoodsRequests.set(categoryId, request);
  return request;
}

async function loadRecipes() {
  if (!supabase) {
    return FALLBACK_RECIPES;
  }

  try {
    const { data, error } = await supabase.from("recipe").select(`
      id, name_cn, description, servings, cuisine, image_emoji,
      recipe_ingredient ( ingredient_name, quantity_kg, goods_id, notes )
    `);

    if (error) {
      console.log("Recipe DB read failed:", error.message);
      return FALLBACK_RECIPES;
    }

    return Array.isArray(data) && data.length ? (data as RecipeRow[]) : FALLBACK_RECIPES;
  } catch (error: any) {
    console.log("Recipe DB read failed:", error.message);
    return FALLBACK_RECIPES;
  }
}

async function readLatestPricesForGoodsIds(goodsIds: string[]) {
  if (!supabase || !goodsIds.length) {
    return new Map<string, NormalizedPriceRow>();
  }

  try {
    const { data, error } = await supabase
      .from("latest_market_item_price")
      .select("*")
      .in("goods_id", goodsIds)
      .order("normalized_price", { ascending: true });

    if (error || !data) {
      if (error) {
        console.log("Batch latest price read failed:", error.message);
      }
      return new Map<string, NormalizedPriceRow>();
    }

    const grouped = new Map<string, NormalizedPriceRow>();
    for (const row of normalizeDbPrices(data)) {
      if (!grouped.has(row.goods_id)) {
        grouped.set(row.goods_id, row);
      }
    }

    return grouped;
  } catch (error: any) {
    console.log("Batch latest price read failed:", error.message);
    return new Map<string, NormalizedPriceRow>();
  }
}

async function readLowestPricesForGoodsIds(goodsIds: string[]) {
  const latestPriceByGoodsId = await readLatestPricesForGoodsIds(goodsIds);
  return goodsIds
    .map((goodsId) => {
      const row = latestPriceByGoodsId.get(goodsId);
      if (!row) return null;

      return {
        ...row,
        price: row.normalized_price,
      };
    })
    .filter(isDefined);
}

async function warmPricesForGoodsList(goodsList: Array<{ goods_id: string; goods_item_id?: string | null }>) {
  const queue = goodsList.filter((item) => item.goods_id && !item.goods_id.startsWith("est-"));
  let cursor = 0;

  const worker = async () => {
    while (cursor < queue.length) {
      const current = queue[cursor++];
      try {
        await refreshPriceCache(current.goods_id, current.goods_item_id || null);
      } catch (error: any) {
        console.log(`Warm price refresh failed for ${current.goods_id}:`, error.message);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(PRICE_WARMUP_CONCURRENCY, Math.max(queue.length, 1)) }, () =>
      worker(),
    ),
  );
}

async function warmDailyPrices() {
  if (dailyPriceWarmPromise) {
    return dailyPriceWarmPromise;
  }

  dailyPriceWarmPromise = (async () => {
    const categories = await getOrLoadCategories();
    const goodsByCategory = await Promise.all(
      categories.map(async (category) => {
        const goods = await getOrLoadGoods(String(category.id));
        return goods.map((item) => ({
          goods_id: String(item.goods_id),
          goods_item_id: item.goods_item_id ? String(item.goods_item_id) : String(category.id),
        }));
      }),
    );

    const flattenedGoods = goodsByCategory.flat();
    await warmPricesForGoodsList(flattenedGoods);
    lastDailyWarmDate = getLocalDateKey();
    console.log(`Daily price warm completed for ${flattenedGoods.length} goods on ${lastDailyWarmDate}.`);
  })().finally(() => {
    dailyPriceWarmPromise = null;
  });

  return dailyPriceWarmPromise;
}

async function writeRecipeSnapshots(recipes: any[]) {
  if (!recipes.length) return;

  const snapshots: RecipeSnapshot[] = recipes.map((recipe) => ({
    recipe_id: recipe.id,
    total_cost: recipe.total_cost,
    servings: recipe.servings || 2,
    ingredients_json: recipe.recipe_ingredient || [],
    computed_at: new Date().toISOString(),
  }));

  await syncWithSupabase("recipe_cost_snapshot", snapshots, "recipe_id");
}

async function computeRecipeSnapshots() {
  const recipes = await loadRecipes();
  const goodsIds = Array.from(
    new Set(
      recipes
        .flatMap((recipe) => recipe.recipe_ingredient || [])
        .map((ingredient) => ingredient.goods_id)
        .filter((goodsId): goodsId is string => Boolean(goodsId)),
    ),
  );

  const latestPriceByGoodsId = await readLatestPricesForGoodsIds(goodsIds);
  const missingGoodsIds = goodsIds.filter(
    (goodsId) => !goodsId.startsWith("est-") && !latestPriceByGoodsId.has(goodsId),
  );

  if (missingGoodsIds.length) {
    for (const goodsId of missingGoodsIds) {
      triggerBackgroundPriceRefresh(goodsId, null);
    }
  }

  const enrichedRecipes = recipes
    .map((recipe) => {
      const ingredients = (recipe.recipe_ingredient || []).map((ingredient) => {
        const quantityKg = toNumber(ingredient.quantity_kg) ?? 0;
        const matchedPrice = ingredient.goods_id
          ? latestPriceByGoodsId.get(ingredient.goods_id)
          : undefined;
        const livePricePerCatty = matchedPrice?.normalized_price ?? null;
        const livePricePerKg = livePricePerCatty
          ? livePricePerCatty / 0.6
          : estimateIngredientPricePerKg(ingredient.ingredient_name);
        const totalIngredientCost = livePricePerKg * quantityKg;

        return {
          ...ingredient,
          live_price_per_kg: livePricePerKg,
          total_ingredient_cost: totalIngredientCost,
          cheapest_market: matchedPrice?.market_name || "估算資料",
          price_source: matchedPrice ? matchedPrice.source : "estimate",
        };
      });

      const totalCost = ingredients.reduce((sum, ingredient) => {
        return sum + (toNumber(ingredient.total_ingredient_cost) ?? 0);
      }, 0);

      return {
        ...recipe,
        recipe_ingredient: ingredients,
        total_cost: totalCost,
      };
    })
    .sort((a, b) => a.total_cost - b.total_cost);

  recipeCache.set("recipes", { value: enrichedRecipes, fetchedAt: Date.now() });
  await writeRecipeSnapshots(enrichedRecipes);
  return enrichedRecipes;
}

async function runDailyRefreshTasks() {
  await warmDailyPrices();
  await computeRecipeSnapshots();
}

function triggerBackgroundRecipeRefresh() {
  if (recipeRefreshPromise) {
    return;
  }

  recipeRefreshPromise = computeRecipeSnapshots()
    .catch((error) => {
      console.log("Background recipe refresh failed:", error.message);
      return recipeCache.get("recipes")?.value || [];
    })
    .finally(() => {
      recipeRefreshPromise = null;
    });
}

async function getOrLoadRecipeSnapshots() {
  const cached = recipeCache.get("recipes");
  if (cached?.value?.length && isFresh(cached.fetchedAt, RECIPE_CACHE_TTL_MS)) {
    return cached.value;
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("recipe_cost_snapshot")
        .select("recipe_id, total_cost, servings, ingredients_json, computed_at, recipe(id, name_cn, description, cuisine, image_emoji)")
        .order("total_cost", { ascending: true });

      if (!error && data && data.length) {
        const fromDb = data.map((row: any) => ({
          id: row.recipe_id,
          name_cn: row.recipe?.name_cn || "Recipe",
          description: row.recipe?.description || "",
          cuisine: row.recipe?.cuisine || "cantonese",
          image_emoji: row.recipe?.image_emoji || "🍲",
          servings: row.servings || 2,
          total_cost: toNumber(row.total_cost) ?? 0,
          recipe_ingredient: Array.isArray(row.ingredients_json) ? row.ingredients_json : [],
        }));

        recipeCache.set("recipes", { value: fromDb, fetchedAt: Date.now() });
        triggerBackgroundRecipeRefresh();
        return fromDb;
      }
    } catch (error: any) {
      console.log("Recipe snapshot read failed:", error.message);
    }
  }

  if (recipeRefreshPromise) {
    return recipeRefreshPromise;
  }

  recipeRefreshPromise = computeRecipeSnapshots().finally(() => {
    recipeRefreshPromise = null;
  });
  return recipeRefreshPromise;
}

function shouldRunDailyWarm(now = new Date()) {
  const currentDateKey = getLocalDateKey(now);
  if (lastDailyWarmDate === currentDateKey) {
    return false;
  }

  return getLocalHour(now) >= DAILY_WARM_HOUR;
}

function ensureDailyWarm() {
  if (!shouldRunDailyWarm()) {
    return;
  }

  void runDailyRefreshTasks().catch((error) => {
    console.log("Daily price warm failed:", error.message);
  });
}

function startBackgroundRefreshLoops() {
  ensureDailyWarm();

  setInterval(() => {
    const keys = Array.from(priceCache.keys());
    for (const cacheKey of keys) {
      const [goodsId, goodsItemId] = cacheKey.split("::");
      if (goodsId) {
        triggerBackgroundPriceRefresh(goodsId, goodsItemId === "none" ? null : goodsItemId);
      }
    }
  }, BACKGROUND_PRICE_REFRESH_MS);

  setInterval(() => {
    triggerBackgroundRecipeRefresh();
  }, BACKGROUND_RECIPE_REFRESH_MS);

  setInterval(() => {
    ensureDailyWarm();
  }, DAILY_WARM_CHECK_MS);
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get("/api/grocery/categories", async (_req, res) => {
    try {
      const categories = await getOrLoadCategories();
      return res.json({ data: categories });
    } catch (error: any) {
      console.error("IAM categories failed:", error.message);
      return res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.post("/api/grocery/goods", async (req, res) => {
    try {
      const { category_id: categoryId } = req.body || {};
      if (!categoryId) {
        return res.status(400).json({ error: "category_id is required" });
      }

      const goods = await getOrLoadGoods(String(categoryId));
      return res.json({ data: goods });
    } catch (error: any) {
      console.error("IAM goods failed:", error.message);
      return res.status(500).json({ error: "Failed to fetch goods" });
    }
  });

  app.post("/api/grocery/prices", async (req, res) => {
    try {
      const { goods_id: goodsId, goods_item_id: goodsItemId } = req.body || {};
      if (!goodsId) {
        return res.status(400).json({ error: "goods_id is required" });
      }

      const prices = await getOrLoadPrices(
        String(goodsId),
        goodsItemId ? String(goodsItemId) : null,
      );

      return res.json({
        data: prices.map((price) => ({
          ...price,
          price: price.normalized_price,
        })),
        source: prices[0]?.source || "unknown",
        cached: true,
      });
    } catch (error: any) {
      console.error("Price lookup failed:", error.message);
      return res.status(500).json({ error: "Failed to fetch prices" });
    }
  });

  app.post("/api/grocery/prices/summary", async (req, res) => {
    try {
      const goodsIds = Array.isArray(req.body?.goods_ids)
        ? req.body.goods_ids.map((value: unknown) => String(value)).filter(Boolean)
        : [];

      if (!goodsIds.length) {
        return res.status(400).json({ error: "goods_ids is required" });
      }

      const summaries = await readLowestPricesForGoodsIds(goodsIds);
      const foundIds = new Set(summaries.map((item) => item.goods_id));
      const missingIds = goodsIds.filter((goodsId) => !foundIds.has(goodsId));
      for (const goodsId of missingIds) {
        triggerBackgroundPriceRefresh(goodsId, null);
      }

      return res.json({
        data: summaries,
        missing_goods_ids: missingIds,
        cached: true,
      });
    } catch (error: any) {
      console.error("Price summary lookup failed:", error.message);
      return res.status(500).json({ error: "Failed to fetch price summaries" });
    }
  });

  app.get("/api/grocery/recipes", async (_req, res) => {
    try {
      const recipes = await getOrLoadRecipeSnapshots();
      return res.json({ recipes, cached: true });
    } catch (error: any) {
      console.error("Recipe processing failed:", error.message);
      return res.status(500).json({ error: "Recipe processing failed" });
    }
  });

  app.post("/api/internal/refresh-daily", async (req, res) => {
    if (!requireCronAuth(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      await runDailyRefreshTasks();
      return res.json({
        ok: true,
        warmed_at: new Date().toISOString(),
        local_date: getLocalDateKey(),
      });
    } catch (error: any) {
      console.error("Daily refresh failed:", error.message);
      return res.status(500).json({ error: "Daily refresh failed" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  triggerBackgroundRecipeRefresh();
  startBackgroundRefreshLoops();
}

startServer().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
