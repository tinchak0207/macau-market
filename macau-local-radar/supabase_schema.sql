-- Supabase schema for Macau Local Radar

CREATE TABLE IF NOT EXISTS market (
  id UUID PRIMARY KEY,
  name_cn TEXT NOT NULL,
  name_pt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goods_category (
  id TEXT PRIMARY KEY,
  name_cn TEXT NOT NULL,
  name_pt TEXT
);

CREATE TABLE IF NOT EXISTS goods_item (
  id TEXT PRIMARY KEY,
  goods_id TEXT UNIQUE NOT NULL,
  category_id TEXT REFERENCES goods_category(id),
  name_cn TEXT NOT NULL,
  name_pt TEXT,
  default_unit INTEGER DEFAULT 2,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_item_price_snapshot (
  id BIGSERIAL PRIMARY KEY,
  goods_id TEXT REFERENCES goods_item(goods_id) ON DELETE CASCADE,
  market_id UUID REFERENCES market(id) ON DELETE CASCADE,
  unit INTEGER NOT NULL DEFAULT 2,
  low_price NUMERIC(10,2),
  avg_price NUMERIC(10,2),
  high_price NUMERIC(10,2),
  snapshot_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_price_goods_time
  ON market_item_price_snapshot(goods_id, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_price_market_time
  ON market_item_price_snapshot(market_id, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_price_goods_market_time
  ON market_item_price_snapshot(goods_id, market_id, snapshot_at DESC);

CREATE TABLE IF NOT EXISTS stall_item_price_snapshot (
  id BIGSERIAL PRIMARY KEY,
  goods_id TEXT REFERENCES goods_item(goods_id) ON DELETE CASCADE,
  market_id UUID REFERENCES market(id) ON DELETE CASCADE,
  stall_location TEXT NOT NULL,
  price_kg NUMERIC(10,2),
  price_catty NUMERIC(10,2),
  snapshot_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stall_price_goods_market
  ON stall_item_price_snapshot(goods_id, market_id, snapshot_at DESC);

CREATE TABLE IF NOT EXISTS goods_price_trend (
  id BIGSERIAL PRIMARY KEY,
  goods_id TEXT REFERENCES goods_item(goods_id) ON DELETE CASCADE,
  unit INTEGER NOT NULL DEFAULT 2,
  trend_data JSONB,
  all_market_avg NUMERIC(10,2),
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trend_goods_time
  ON goods_price_trend(goods_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS recipe (
  id SERIAL PRIMARY KEY,
  name_cn TEXT NOT NULL,
  description TEXT,
  servings INTEGER DEFAULT 2,
  cuisine TEXT DEFAULT 'cantonese',
  image_emoji TEXT DEFAULT '🍲',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_ingredient (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER REFERENCES recipe(id) ON DELETE CASCADE,
  goods_id TEXT,
  ingredient_name TEXT NOT NULL,
  quantity_kg NUMERIC(8,4) NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredient_recipe_goods
  ON recipe_ingredient(recipe_id, goods_id);

CREATE TABLE IF NOT EXISTS latest_market_item_price (
  goods_id TEXT NOT NULL,
  goods_item_id TEXT,
  market_id UUID NOT NULL,
  market_name TEXT NOT NULL,
  unit INTEGER NOT NULL DEFAULT 2,
  low_price NUMERIC(10,2),
  avg_price NUMERIC(10,2),
  high_price NUMERIC(10,2),
  normalized_price NUMERIC(10,2) NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (goods_id, goods_item_id, market_id, unit)
);

CREATE INDEX IF NOT EXISTS idx_latest_market_price_goods_price
  ON latest_market_item_price(goods_id, normalized_price ASC);

CREATE INDEX IF NOT EXISTS idx_latest_market_price_goods_market_time
  ON latest_market_item_price(goods_id, market_id, snapshot_at DESC);

CREATE TABLE IF NOT EXISTS recipe_cost_snapshot (
  recipe_id INTEGER PRIMARY KEY REFERENCES recipe(id) ON DELETE CASCADE,
  total_cost NUMERIC(10,2) NOT NULL,
  servings INTEGER NOT NULL DEFAULT 2,
  ingredients_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_cost_snapshot_total_cost
  ON recipe_cost_snapshot(total_cost ASC);

ALTER TABLE market ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_item_price_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE stall_item_price_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_price_trend ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredient ENABLE ROW LEVEL SECURITY;
ALTER TABLE latest_market_item_price ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_cost_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_market" ON market;
CREATE POLICY "public_read_market"
  ON market FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_read_category" ON goods_category;
CREATE POLICY "public_read_category"
  ON goods_category FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_read_item" ON goods_item;
CREATE POLICY "public_read_item"
  ON goods_item FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_read_market_price" ON market_item_price_snapshot;
CREATE POLICY "public_read_market_price"
  ON market_item_price_snapshot FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_read_stall_price" ON stall_item_price_snapshot;
CREATE POLICY "public_read_stall_price"
  ON stall_item_price_snapshot FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_read_trend" ON goods_price_trend;
CREATE POLICY "public_read_trend"
  ON goods_price_trend FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_read_recipe" ON recipe;
CREATE POLICY "public_read_recipe"
  ON recipe FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_read_recipe_ingredient" ON recipe_ingredient;
CREATE POLICY "public_read_recipe_ingredient"
  ON recipe_ingredient FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_read_latest_market_price" ON latest_market_item_price;
CREATE POLICY "public_read_latest_market_price"
  ON latest_market_item_price FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_read_recipe_cost_snapshot" ON recipe_cost_snapshot;
CREATE POLICY "public_read_recipe_cost_snapshot"
  ON recipe_cost_snapshot FOR SELECT USING (true);
