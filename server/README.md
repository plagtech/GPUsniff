# GPUSniff Backend

Express API that aggregates GPU pricing from affiliate networks server-side
and serves it to the Chrome extension and landing page. Affiliate keys stay
on the server — the extension only ever talks to this API.

Deployed at `https://api.gpusniff.com` (the URL the extension defaults to).

## Quick start

```bash
cd server
cp .env.example .env      # fill in whatever keys you have (all optional)
npm install
npm run dev               # http://localhost:8080  (auto-restart on change)
```

With **zero keys configured** the server runs entirely on estimated mock data,
so you can develop the extension against it immediately. As you add real keys,
those retailers switch to live prices; the rest stay mocked (and are flagged
`"estimated": true`) until you disable the fallback with `ALLOW_MOCK_FALLBACK=false`.

Point the extension at your local server by setting, in the extension's
DevTools console or via `chrome.storage`:

```js
chrome.storage.local.set({ gpusniff_backend_url: 'http://localhost:8080' })
```

## Endpoints

| Method | Path                     | Description |
|--------|--------------------------|-------------|
| GET    | `/health`                | Status + which providers/Supabase are live |
| GET    | `/api/prices/:gpuId`     | Sorted price list across retailers (extension's main call) |
| GET    | `/api/deals`             | Best current offer per featured GPU, with badges |
| GET    | `/api/search?q=`         | Search the GPU catalog |
| GET    | `/api/search/all`        | Full GPU catalog (lets the extension sync its DB) |
| GET    | `/api/history/:gpuId?days=30` | Price history + per-day best-price series for charts |
| POST   | `/api/waitlist`          | `{ email }` → adds to the Supabase waitlist |

`/api/prices/:gpuId` returns the exact array shape the extension's old mock
`fetchPrices()` produced, so no UI changes were needed — each row adds
`source` (which provider) and `estimated` (true = mock/derived).

## How keys map to retailers

| Provider (env)                     | Retailers fed        |
|------------------------------------|----------------------|
| `BESTBUY_API_KEY`                  | Best Buy             |
| `CJ_*` (CJ Affiliate GraphQL)      | Best Buy, B&H Photo  |
| `EBAY_*` (Browse API)              | eBay                 |
| `IMPACT_*` (Impact Radius)         | Walmart              |
| *(mock fallback)*                  | Newegg, Micro Center, and any retailer above without a key |

Newegg (Partnerize) and Micro Center (ShareASale) don't have live providers
yet — add `providers/newegg.js` / `providers/microcenter.js` following the same
shape (`fetch<Name>Offers(gpu) → offer[]`) and register them in
`providers/index.js`.

Each provider is a no-op when its keys are missing, and one provider throwing
never breaks the response (`Promise.allSettled` isolates failures; per-provider
errors surface in the `errors` array and in server logs).

## Supabase (price history + waitlist)

1. Create a project at https://app.supabase.com
2. Run `supabase/schema.sql` in the SQL editor (creates `price_snapshots` +
   `waitlist`, with RLS locked to the service role).
3. Put `SUPABASE_URL` and the **service role** key in `.env`.

Every live (non-estimated) price fetch writes a snapshot per retailer, so price
history accrues automatically as the extension is used and the background alarm
polls. History is read back via `/api/history/:gpuId`.

If Supabase isn't configured, history reads return empty and waitlist signups
are accepted but logged instead of stored — the API still runs.

## Caching

Aggregated prices are cached in memory per GPU for `PRICE_CACHE_TTL_SECONDS`
(default 15 min) to stay under affiliate rate limits and keep the popup snappy.
Single-instance only — swap `cache.js` for Redis if you run multiple instances.

## Deployment

Any Node 18+ host works (Render, Railway, Fly.io, a VPS). Example (Render):

- Build: `npm install`
- Start: `npm start`
- Set all `.env` values as environment variables in the dashboard.
- Point the `api.gpusniff.com` DNS record at the service.
- Set `ALLOWED_ORIGINS=https://gpusniff.com,https://www.gpusniff.com`
  (chrome-extension:// and moz-extension:// origins are always allowed).

## Layout

```
server/
├── src/
│   ├── index.js          # Express app, CORS, routes, health
│   ├── config.js         # env → typed config
│   ├── gpuDatabase.js    # GPU catalog + retailers (server source of truth)
│   ├── cache.js          # in-memory TTL cache
│   ├── aggregator.js     # merge provider offers + mock fill, snapshot writes
│   ├── supabase.js       # price snapshots + waitlist
│   ├── providers/        # one module per affiliate network (+ mock)
│   └── routes/           # prices, deals, search, history, waitlist
└── supabase/schema.sql
```
