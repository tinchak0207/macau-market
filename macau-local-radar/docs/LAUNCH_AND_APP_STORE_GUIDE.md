# Launch And App Store Guide

This file is the single source of truth for everything that still requires your accounts, DNS, Apple, Google, Vercel, or hosting access.

## 1. What is already done in this repo

- Frontend no longer injects `GEMINI_API_KEY` into the browser bundle.
- Frontend supports an external API host through `VITE_API_BASE_URL`.
- PWA basics are in place:
  - `public/manifest.webmanifest`
  - `public/sw.js`
  - `public/offline.html`
  - `public/icons/*`
- Vercel frontend config exists in `vercel.json`.
- Capacitor project config exists in `capacitor.config.json`.
- API warm-up SQL exists in `supabase_cron.sql`.

## 2. Architecture to use

Use this split:

1. `market.tinchak0207.xyz` -> Vercel frontend
2. `api.market.tinchak0207.xyz` -> backend host running `server.ts`
3. Supabase -> database + daily cron trigger

Do not host the current backend as a frontend-only Vercel project. It uses:

- in-memory caches
- background refresh loops
- a protected internal refresh endpoint

## 3. Prepare secrets and env vars

### Vercel frontend env

Set:

```bash
VITE_API_BASE_URL=https://api.market.tinchak0207.xyz
```

### Backend env

Set:

```bash
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
APP_CRON_SECRET=YOUR_LONG_RANDOM_SECRET
PRICE_WARM_HOUR=6
PRICE_WARMUP_CONCURRENCY=4
TZ=Asia/Hong_Kong
PORT=3000
```

## 4. Deploy the backend

Recommended targets:

- Railway
- Render
- Fly.io
- VPS with PM2

### Build/start values

Use:

```bash
npm install
npm run build
npm run start
```

### Health check

After deploy, confirm these URLs work:

```text
https://api.market.tinchak0207.xyz/api/grocery/categories
https://api.market.tinchak0207.xyz/api/grocery/recipes
```

## 5. Deploy the frontend to Vercel

### Vercel project settings

Set:

- Framework preset: `Vite`
- Build command: `npm run build:web`
- Output directory: `dist`

### Domain binding

Bind:

- `market.tinchak0207.xyz`

### DNS

In your DNS provider:

1. Add the Vercel-provided record for `market`
2. Add the backend-host-provided record for `api.market`

### Final frontend verification

Check:

```text
https://market.tinchak0207.xyz
```

Open DevTools and verify:

- manifest loads
- `sw.js` registers
- API calls go to `https://api.market.tinchak0207.xyz`

## 6. Enable the daily refresh job

Open `supabase_cron.sql`.

Replace:

- `YOUR_APP_DOMAIN` -> `https://api.market.tinchak0207.xyz`
- `YOUR_APP_CRON_SECRET` -> your real cron secret

Then run the SQL inside Supabase SQL Editor.

After that, manually test:

```bash
curl -X POST https://api.market.tinchak0207.xyz/api/internal/refresh-daily ^
  -H "Authorization: Bearer YOUR_APP_CRON_SECRET" ^
  -H "Content-Type: application/json" ^
  -d "{}"
```

Expected result: `ok: true`

## 7. Turn the web app into iPhone and Android apps

This repo already has the Capacitor config. You still need to install the actual tooling once on your machine.

### Install mobile tooling

Run:

```bash
npm install -D @capacitor/cli
npm install @capacitor/core @capacitor/ios @capacitor/android
```

### Build and initialize platforms

Run:

```bash
npm run build:web
npx cap add ios
npx cap add android
npx cap sync
```

### Open native projects

Run:

```bash
npx cap open ios
npx cap open android
```

### Native setup you must finish

#### iOS

In Xcode:

1. Set bundle identifier
2. Set team/signing
3. Replace app icon set with final App Store icons
4. Add privacy strings:
   - `NSLocationWhenInUseUsageDescription`
   - `NSUserTrackingUsageDescription` only if you actually add tracking
5. Archive and upload to TestFlight

#### Android

In Android Studio:

1. Set application ID
2. Replace launcher icons
3. Set `minSdk`, `targetSdk`, version code, version name
4. Generate signed AAB
5. Upload to Play Console internal testing

## 8.5. Optional deep linking templates

If you want universal links and Android app links later, use:

- `docs/templates/apple-app-site-association.example`
- `docs/templates/assetlinks.json.example`

## 9. App Store listing assets you still need to produce

You must still prepare these outside code:

- App icon, polished final version
- iPhone screenshots
- iPad screenshots if you support iPad
- Android phone screenshots
- App subtitle
- App description
- Privacy policy URL
- Support URL
- Marketing URL

Starter templates are included in:

- `docs/templates/PRIVACY_POLICY_TEMPLATE.md`
- `docs/templates/STORE_LISTING_TEMPLATE.md`

## 10. Minimum feature bar for review approval

Before public submission, make sure the app is more than a wrapped website. At minimum, ship:

1. Price comparison by category
2. Detailed market price drilldown
3. Recipe cost estimation
4. Offline fallback screen
5. Installable PWA
6. Distinct mobile navigation and desktop layout

Recommended next additions before review:

1. Favorites
2. Price alerts
3. Recently viewed items
4. Nearby market sorting
5. Share card for a cheap basket

## 11. Release order

Use this order:

1. Backend staging
2. Frontend production
3. Supabase cron
4. Test PWA install on iPhone Safari and Android Chrome
5. TestFlight build
6. Google Play internal testing
7. Public store release

## 12. Final pre-launch checklist

- `npm run lint`
- `npm run build`
- `npm run build:web`
- Frontend domain resolves
- Backend domain resolves
- Manifest is valid
- Service worker registers
- Cron endpoint works
- Supabase credentials are correct
- App icon replaced with final brand asset
- Privacy policy published
- Store screenshots exported

## 13. If you want the next best improvement after deployment

Build these in this order:

1. Favorites
2. Push notifications for price drops
3. Analytics
4. Referral flow
5. ASO copy and screenshots
