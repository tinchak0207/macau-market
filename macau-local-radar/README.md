<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Macau Local Radar

This project is split logically into:

- `frontend`: Vite + React UI
- `backend`: Express API in `server.ts`
- `data`: Supabase + IAM market price fetches + scheduled warm-up route

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local`
3. Run the app:
   `npm run dev`

Local dev serves the frontend and API from the same origin at `http://localhost:3000`.

## Production Deploy

Recommended split:

1. Frontend on Vercel
   `market.tinchak0207.xyz`
2. Backend on a long-running Node host
   `api.market.tinchak0207.xyz`
3. Supabase for data + cron trigger

Do not deploy this backend to a purely static Vercel setup. The app uses:

- in-memory caches
- periodic warm-up loops
- a protected internal refresh endpoint

### Frontend env

Set this in Vercel:

```bash
VITE_API_BASE_URL=https://api.market.tinchak0207.xyz
```

### Backend env

Set these on Railway / Render / Fly / VPS:

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_CRON_SECRET=...
PRICE_WARM_HOUR=6
PRICE_WARMUP_CONCURRENCY=4
TZ=Asia/Hong_Kong
PORT=3000
```

### DNS

Set:

- `market.tinchak0207.xyz` -> Vercel custom domain
- `api.market.tinchak0207.xyz` -> backend host target

### Daily refresh

Use [supabase_cron.sql](./supabase_cron.sql) and replace:

- `YOUR_APP_DOMAIN` with `https://api.market.tinchak0207.xyz`
- `YOUR_APP_CRON_SECRET` with your real secret

## App Roadmap

To ship to App Store and Google Play without rewriting the product:

1. Keep this React app as the main product surface.
2. Add PWA basics: manifest, icons, installability, offline fallback.
3. Wrap the web app with Capacitor for iOS and Android.
4. Add native push, location permission messaging, app icons, splash screens.
5. Submit to TestFlight and Google Play internal testing before public release.

Detailed release steps live in [docs/LAUNCH_AND_APP_STORE_GUIDE.md](./docs/LAUNCH_AND_APP_STORE_GUIDE.md).
