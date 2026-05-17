# Macau Local Apps Backend Feasibility - 2026-05-16

Scope: backend only. Two niche apps:

1. Bus decision app: 落樓鐘 + 等車轉線雷達 + 巴士斷班警報
2. Grocery decision app: 買餸今日抵買 + 今晚煮乜最抵 + 一餐飯成本計

## 1. Grocery Decision App

Verdict: feasible, and stronger than expected.

### Best Source

Use IAM "街市通" JSON API as primary source:

- App entry: `https://app.iam.gov.mo/marketinfo`
- API base: `https://app.iam.gov.mo/marketinfo`
- Request format:

```json
{
  "head": {
    "request_id": "<uuid>",
    "version": "1.0.0"
  },
  "body": {
    "lang": "CN",
    "sid": null
  }
}
```

All tested endpoints returned JSON with `head.code = "00"` when successful.

### Core Endpoints

- Categories:
  `POST /goods/getGoodsCategory`
  Returns 6 categories: vegetables, freshwater fish, saltwater fish, seafood, pork, beef.

- Goods list by category:
  `POST /goods/getGoodsList`
  Body: `{ "goods_category_id": "7", "lang": "CN", "sid": null }`
  Test count: 60 total items across categories.

- Market list and unit model:
  `POST /goods/getMarketListAndWeight`
  Returns 8 markets and unit conversion data.
  Units include kg, catty, tael, pound, 100g, head.

- Current per-market low/average prices for an item:
  `POST /goodsPrice/getGoodsPriceByMarket`
  Body example:
  `{ "goods_item_id": "7", "goods_id": "2383561239", "unit": 2, "lang": "CN", "sid": null }`
  Example item: 菜心, category 7.

- 7-day trend and all-market averages:
  `POST /goods/getGoodsPriceTrend`
  Body example:
  `{ "goods_id": "2383561239", "other_streets_ids": [], "type": 0, "weight_unit": 2, "lang": "CN", "sid": null }`
  Sample on 2026-05-16: 菜心 all-market average kg price `20.2`, last update `2026-05-16 09:05:08`.

- Stall/gate-level prices:
  `POST /goodsPrice/getGoodsPriceOfMarketGate`
  Body example:
  `{ "goods_item_id": "7", "goods_id": "2383561239", "market_id": "ec438333-cdc8-493e-97fc-495640261856", "lang": "CN", "sid": null }`
  Sample: 沙梨頭街市菜心 returned stall locations like `一樓 049`, `一樓 053`, with kg/catty prices.

### Consumer Council Source

Consumer Council's "街市物價情報站" entry points to server-rendered HTML:

- Function list:
  `https://api03.consumer.gov.mo/app/nextmacauprice/api/functions?lan=cn&v=1.0`
- Street market entry:
  `https://www.consumer.gov.mo/api02/marketcategory.aspx`
- Category page:
  `https://www.consumer.gov.mo/api02/MarketItemLowestPrice.aspx?lan=cn&c=Vegetables&ccn=新鮮食用蔬菜類&pftype=`
- Item detail:
  `https://www.consumer.gov.mo/api02/MarketPrice?lan=cn&c=Vegetables&tn=菜心&s=Couve%20chinesa%20de%20flor&lpa=10.0&lpb=10.2&t=today&pftype=`

This page confirms the data is provided by IAM, but it is HTML and was less current in testing than IAM's API. Use it as fallback only.

### App Backend Value

Government sites show data; they do not solve shopping decisions.

Backend can compute:

- 今日抵買:
  price percentile, today vs yesterday, today vs 7-day average, cheapest nearby market, cheapest stall when available.

- 今晚煮乜最抵:
  maintain a small curated recipe table with ingredient weights, then rank meals by today's live cost and user's preferred markets.

- 一餐飯成本計:
  normalize kg/catty/tael/head units, multiply by serving size, output market and stall shopping plan.

### Risks

- IAM API is public-facing but undocumented. Use cache and low-frequency polling.
- Stall-level prices contain zero values; backend must filter invalid prices.
- Not every item/stall has full current price.
- Recipe logic must be curated; pure AI cannot infer Macau live prices or local stall availability.

## 2. Bus Decision App

Verdict: feasible, but higher source risk than grocery.

### Confirmed Data Surface From DSAT Web App

The DSAT bus web frontend embeds `https://bis.dsat.gov.mo/macauweb/` and uses a tokenized API.

Main public entry:

- `https://www.dsat.gov.mo/bus/site/busstopwaiting.aspx?lang=tc`

Discovered web API host:

- `https://bis.dsat.gov.mo/macauweb`

Token logic from web JS:

1. Build query string in insertion order.
2. MD5 hash the query string.
3. Current local time `yyyyMMddHHmm`.
4. Insert `yyyy` at MD5 index 4, `MMdd` at index 12, `HHmm` at index 24.
5. Send as request header `token`.

### Useful Endpoints

- Route list:
  `POST /macauweb/getRouteAndCompanyList.html`
  Params: `lang=zh_tw&device=web`

- Static route station list:
  `POST /macauweb/getRouteData.html`
  Params: `action=sd&routeName=3&dir=0&lang=zh_tw&device=web`

- Live vehicle distribution on route:
  `POST /macauweb/routestation/bus`
  Params: `action=dy&routeName=3&dir=0&lang=zh_tw&device=web`
  Gives vehicle plate, station position, passenger flow, speed, facilities.

- Nearby stations by GPS:
  `GET /ddbus/common/station/gps?log=...&lat=...&range=300&device=web&HUID=...&needStaInfo=true&lang=zh-tw`

- Station route ETA-ish collection:
  `POST /ddbus/common/route/collection/info?device=web&HUID=...`
  JSON body:
  ```json
  {
    "stationCode": "M16/1",
    "routeList": [
      { "routeCode": "00003", "direction": "0" },
      { "routeCode": "00003", "direction": "1" }
    ]
  }
  ```
  Response includes `stopCounts`: `0` arrived, `x` almost arrived, `f` about to depart, or number of stops away.

### App Backend Value

- 落樓鐘:
  combine walking time, user's lift/downstairs delay, stopCounts, and learned stop-to-stop travel time.

- 等車轉線雷達:
  use nearby stops + route candidates + live collection info to compare "wait here", "walk to another stop", or "transfer".

- 斷班警報:
  feasible only after collecting baseline. Detect live gaps against observed headway by route, direction, station, time bucket.

### Risks

- DSAT API is undocumented and tokenized; it can change without notice.
- During the 2026-05-16 re-check from this machine, direct `bis.dsat.gov.mo` HTTP requests timed out even though the main DSAT page loaded. Treat connectivity/CDN blocking as a real operational risk.
- No reliable official schedule/frequency endpoint recovered yet. "斷班警報" should start as anomaly detection from self-collected live observations.

## MVP Backend Shape

### Grocery

- Cron every 15-30 minutes during market hours:
  fetch categories, goods list, market list, item price by market, item trend.
- On-demand:
  fetch stall prices for selected item and market, cache for 10-30 minutes.
- DB tables:
  `market`, `goods_category`, `goods_item`, `market_item_price_snapshot`, `stall_item_price_snapshot`, `recipe`, `recipe_ingredient`.
- Public API:
  `/today-deals`, `/recipe-rank`, `/meal-cost`, `/markets/:id/item/:goodsId/stalls`.

### Bus

- Poll route/station combos that users actually follow, not the whole city.
- Store live observations every 10-30 seconds per watched station/route.
- DB tables:
  `route`, `station`, `route_station`, `vehicle_observation`, `station_route_eta_snapshot`, `headway_baseline`, `user_watch`.
- Public API:
  `/leave-now`, `/transfer-radar`, `/gap-alerts`, `/station/:code/routes`.

## Final Call

Build both backends as data-decision engines, not government data browsers.

Priority order:

1. Grocery backend first: IAM JSON API is clean, current, and gives enough data for a strong niche app.
2. Bus backend second: technically powerful, but operational risk is higher because the live DSAT source is undocumented and currently connection-sensitive.
