import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChefHat,
  Clock3,
  Loader2,
  Radar,
  Search,
  Sparkles,
  Store,
  Wallet,
} from 'lucide-react';

type Category = {
  id: string;
  name?: string;
  name_cn?: string;
};

type Goods = {
  goods_id: string;
  goods_name?: string;
  name_cn?: string;
  goods_item_id?: string;
};

type Price = {
  market_id: string;
  market_name: string;
  price?: number | string;
  low_catty_price?: number | string;
  normalized_price?: number;
};

type RecipeIngredient = {
  ingredient_name: string;
  cheapest_market?: string;
  total_ingredient_cost?: number;
};

type Recipe = {
  id: number;
  name?: string;
  name_cn?: string;
  description?: string;
  cuisine?: string;
  total_cost?: number;
  recipe_ingredient?: RecipeIngredient[];
};

const currency = new Intl.NumberFormat('zh-HK', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function getItemName(item: { goods_name?: string; name_cn?: string; name?: string }) {
  return item.goods_name || item.name_cn || item.name || '未命名項目';
}

function getPriceValue(price: Price) {
  const raw = price.price ?? price.normalized_price ?? price.low_catty_price ?? 0;
  return typeof raw === 'number' ? raw : Number.parseFloat(raw);
}

export default function DesktopMarketUI() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [allGoods, setAllGoods] = useState<Record<string, Goods[]>>({});
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState('');
  const [activeGoodsId, setActiveGoodsId] = useState<string | null>(null);
  const [priceMap, setPriceMap] = useState<Record<string, Price[]>>({});
  const [loadingPricesFor, setLoadingPricesFor] = useState<string | null>(null);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingRecipes, setLoadingRecipes] = useState(true);

  useEffect(() => {
    void loadCategories();
    void loadRecipes();
  }, []);

  async function loadCategories() {
    try {
      const response = await fetch('/api/grocery/categories');
      const payload = await response.json();
      const nextCategories = Array.isArray(payload?.data) ? payload.data : [];
      setCategories(nextCategories);

      if (nextCategories.length > 0) {
        const firstId = nextCategories[0].id;
        setSelectedCategory(firstId);
        await Promise.all(nextCategories.map((category: Category) => loadGoods(category.id)));
      }
    } finally {
      setLoadingCategories(false);
    }
  }

  async function loadGoods(categoryId: string) {
    try {
      const response = await fetch('/api/grocery/goods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: categoryId }),
      });
      const payload = await response.json();
      setAllGoods((current) => ({
        ...current,
        [categoryId]: Array.isArray(payload?.data) ? payload.data : [],
      }));
    } catch {
      setAllGoods((current) => ({ ...current, [categoryId]: [] }));
    }
  }

  async function loadRecipes() {
    try {
      const response = await fetch('/api/grocery/recipes');
      const payload = await response.json();
      setRecipes(Array.isArray(payload?.recipes) ? payload.recipes : []);
    } finally {
      setLoadingRecipes(false);
    }
  }

  async function loadPrices(goods: Goods) {
    const goodsId = goods.goods_id;
    if (priceMap[goodsId]) {
      setActiveGoodsId(goodsId);
      return;
    }

    setLoadingPricesFor(goodsId);
    setActiveGoodsId(goodsId);

    try {
      const response = await fetch('/api/grocery/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goods_id: goods.goods_id,
          goods_item_id: goods.goods_item_id || selectedCategory,
        }),
      });
      const payload = await response.json();
      setPriceMap((current) => ({
        ...current,
        [goodsId]: Array.isArray(payload?.data) ? payload.data : [],
      }));
    } finally {
      setLoadingPricesFor(null);
    }
  }

  const goodsList = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sourceItems = query
      ? Object.values(allGoods).flat()
      : allGoods[selectedCategory] || [];

    if (!query) {
      return sourceItems;
    }

    return sourceItems.filter((item) => getItemName(item).toLowerCase().includes(query));
  }, [allGoods, search, selectedCategory]);

  const featuredRecipes = useMemo(() => recipes.slice(0, 3), [recipes]);

  const selectedGoods = useMemo(
    () => goodsList.find((item) => item.goods_id === activeGoodsId) || goodsList[0] || null,
    [activeGoodsId, goodsList],
  );

  useEffect(() => {
    if (!selectedGoods) {
      setActiveGoodsId(null);
      return;
    }

    if (selectedGoods.goods_id !== activeGoodsId) {
      setActiveGoodsId(selectedGoods.goods_id);
    }
  }, [activeGoodsId, selectedGoods]);

  const selectedPrices = selectedGoods ? priceMap[selectedGoods.goods_id] || [] : [];
  const cheapestPrice = selectedPrices[0] ? getPriceValue(selectedPrices[0]) : null;

  return (
    <div className="desktop-market-shell">
      <div className="desktop-market-bg" />
      <div className="desktop-market-frame">
        <header className="desktop-hero">
          <div className="desktop-hero__brand">
            <div className="desktop-hero__badge">
              <Radar size={26} />
            </div>
            <div>
              <p className="desktop-eyebrow">Macau Market Radar</p>
              <h1>桌機版即時街市儀表板</h1>
            </div>
          </div>

          <div className="desktop-hero__metrics">
            <div className="desktop-metric-card">
              <span>分類</span>
              <strong>{categories.length}</strong>
            </div>
            <div className="desktop-metric-card">
              <span>食材</span>
              <strong>{goodsList.length}</strong>
            </div>
            <div className="desktop-metric-card">
              <span>食譜</span>
              <strong>{recipes.length}</strong>
            </div>
          </div>
        </header>

        <section className="desktop-content-grid">
          <aside className="desktop-sidebar">
            <div className="desktop-panel desktop-panel--dark">
              <div className="desktop-panel__title">
                <Sparkles size={16} />
                <span>分類導航</span>
              </div>
              <div className="desktop-category-list">
                {loadingCategories && <p className="desktop-empty">載入分類中...</p>}
                {!loadingCategories &&
                  categories.map((category) => {
                    const isActive = category.id === selectedCategory;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        className={`desktop-category-button ${isActive ? 'is-active' : ''}`}
                        onClick={() => setSelectedCategory(category.id)}
                      >
                        <span>{category.name || category.name_cn || '未分類'}</span>
                        <ArrowRight size={15} />
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="desktop-panel">
              <div className="desktop-panel__title">
                <ChefHat size={16} />
                <span>今日推薦食譜</span>
              </div>
              {loadingRecipes && <p className="desktop-empty">載入食譜中...</p>}
              {!loadingRecipes &&
                featuredRecipes.map((recipe) => (
                  <article key={recipe.id} className="desktop-recipe-card">
                    <div className="desktop-recipe-card__head">
                      <h3>{getItemName(recipe)}</h3>
                      <span>${currency.format(recipe.total_cost || 0)}</span>
                    </div>
                    <p>{recipe.description || '以最新街市價格估算總成本。'}</p>
                  </article>
                ))}
            </div>
          </aside>

          <main className="desktop-main">
            <div className="desktop-panel desktop-panel--search">
              <label className="desktop-search">
                <Search size={18} />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜尋食材、肉類、海鮮、蔬菜..."
                />
              </label>
            </div>

            <div className="desktop-market-grid">
              <div className="desktop-panel desktop-panel--goods">
                <div className="desktop-panel__title">
                  <Store size={16} />
                  <span>{search ? '搜尋結果' : '食材清單'}</span>
                </div>

                <div className="desktop-goods-grid">
                  {goodsList.map((goods) => {
                    const isActive = goods.goods_id === selectedGoods?.goods_id;
                    const knownPrice = priceMap[goods.goods_id]?.[0];
                    const value = knownPrice ? getPriceValue(knownPrice) : null;

                    return (
                      <button
                        key={goods.goods_id}
                        type="button"
                        className={`desktop-goods-card ${isActive ? 'is-active' : ''}`}
                        onClick={() => void loadPrices(goods)}
                      >
                        <div>
                          <p>{getItemName(goods)}</p>
                          <span>{knownPrice ? knownPrice.market_name : '點擊查看市場價格'}</span>
                        </div>
                        <strong>{value ? `$${currency.format(value)}` : '查看'}</strong>
                      </button>
                    );
                  })}

                  {!loadingCategories && goodsList.length === 0 && (
                    <div className="desktop-empty-card">目前沒有符合的食材。</div>
                  )}
                </div>
              </div>

              <div className="desktop-panel desktop-panel--detail">
                <div className="desktop-panel__title">
                  <Wallet size={16} />
                  <span>價格詳情</span>
                </div>

                {selectedGoods ? (
                  <div className="desktop-detail">
                    <div className="desktop-detail__summary">
                      <div>
                        <p className="desktop-detail__label">選擇食材</p>
                        <h2>{getItemName(selectedGoods)}</h2>
                      </div>
                      <div className="desktop-detail__price">
                        <span>最低價</span>
                        <strong>
                          {cheapestPrice !== null ? `$${currency.format(cheapestPrice)}` : '--'}
                        </strong>
                      </div>
                    </div>

                    <div className="desktop-detail__meta">
                      <div>
                        <Clock3 size={15} />
                        <span>桌機版會在大螢幕顯示這個分析面板</span>
                      </div>
                    </div>

                    {loadingPricesFor === selectedGoods.goods_id && (
                      <div className="desktop-loading">
                        <Loader2 size={18} className="spin" />
                        <span>載入市場價格中...</span>
                      </div>
                    )}

                    {loadingPricesFor !== selectedGoods.goods_id && (
                      <div className="desktop-price-list">
                        {selectedPrices.map((price) => (
                          <div key={price.market_id} className="desktop-price-row">
                            <div>
                              <p>{price.market_name}</p>
                              <span>每司馬斤參考價</span>
                            </div>
                            <strong>${currency.format(getPriceValue(price))}</strong>
                          </div>
                        ))}

                        {selectedPrices.length === 0 && (
                          <div className="desktop-empty-card">先點左邊食材卡片載入價格。</div>
                        )}
                      </div>
                    )}

                    {featuredRecipes.length > 0 && (
                      <div className="desktop-related">
                        <p className="desktop-detail__label">關聯食譜靈感</p>
                        {featuredRecipes.map((recipe) => (
                          <div key={recipe.id} className="desktop-related-row">
                            <span>{getItemName(recipe)}</span>
                            <span>${currency.format(recipe.total_cost || 0)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="desktop-empty-card">請先從左側選擇一個食材。</div>
                )}
              </div>
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}
