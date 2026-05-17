import express from "express";
import path from "path";
import axios from "axios";
import { createServer as createViteServer } from "vite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const IAM_BASE_URL = "https://app.iam.gov.mo/marketinfo";
const PORT = Number(process.env.PORT || 3000);
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;
const RECIPE_CACHE_TTL_MS = 5 * 60 * 1000;
const BACKGROUND_PRICE_REFRESH_MS = 15 * 60 * 1000;
const BACKGROUND_RECIPE_REFRESH_MS = 10 * 60 * 1000;

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

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
const inFlightPriceRefresh = new Map<string, Promise<NormalizedPriceRow[]>>();
let recipeRefreshPromise: Promise<any[]> | null = null;

const FALLBACK_RECIPES: RecipeRow[] = [
  {
    id: 1,
    name_cn: "Stir-fried Greens",
    description: "Fallback recipe when DB is unavailable.",
    image_emoji: "🥬",
    cuisine: "cantonese",
    servings: 2,
    recipe_ingredient: [
      { ingredient_name: "Leafy greens", quantity_kg: 0.4 },
      { ingredient_name: "Garlic", quantity_kg: 0.02 },
    ],
  },
  {
    id: 2,
    name_cn: "Fish Fillet Soup",
    description: "Fallback recipe when DB is unavailable.",
    image_emoji: "🐟",
    cuisine: "cantonese",
    servings: 2,
    recipe_ingredient: [
      { ingredient_name: "Fish fillet", quantity_kg: 0.3 },
      { ingredient_name: "Ginger", quantity_kg: 0.05 },
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

  if (lower.includes("菜") || lower.includes("greens") || lower.includes("leaf")) return 25;
  if (lower.includes("肉") || lower.includes("pork") || lower.includes("beef")) return 80;
  if (lower.includes("魚") || lower.includes("fish")) return 70;
  if (lower.includes("蛋") || lower.includes("egg")) return 20;

  return 30;
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
  if (!supabase) return;

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

  const freshRows = await refreshPriceCache(goodsId, goodsItemId);
  return freshRows;
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
  const missingGoodsIds = goodsIds.filter((goodsId) => !latestPriceByGoodsId.has(goodsId));
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
        const livePricePerKg = livePricePerCatty ? livePricePerCatty / 0.6 : estimateIngredientPricePerKg(ingredient.ingredient_name);
        const totalIngredientCost = livePricePerKg * quantityKg;

        return {
          ...ingredient,
          live_price_per_kg: livePricePerKg,
          total_ingredient_cost: totalIngredientCost,
          cheapest_market: matchedPrice?.market_name || "Estimated",
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

function startBackgroundRefreshLoops() {
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
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get("/api/grocery/categories", async (_req, res) => {
    try {
      const categories = await fetchCategoriesFromIam();
      void syncWithSupabase("goods_category", categories, "id");
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

      const goods = await fetchGoodsFromIam(String(categoryId));
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

      const prices = await getOrLoadPrices(String(goodsId), goodsItemId ? String(goodsItemId) : null);
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

  app.get("/api/grocery/recipes", async (_req, res) => {
    try {
      const recipes = await getOrLoadRecipeSnapshots();
      return res.json({ recipes, cached: true });
    } catch (error: any) {
      console.error("Recipe processing failed:", error.message);
      return res.status(500).json({ error: "Recipe processing failed" });
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
