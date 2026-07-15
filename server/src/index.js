import express from 'express';
import cors from 'cors';
import { config, hasAnyProvider } from './config.js';
import { supabaseReady } from './supabase.js';
import { pricesRouter } from './routes/prices.js';
import { dealsRouter } from './routes/deals.js';
import { searchRouter } from './routes/search.js';
import { historyRouter } from './routes/history.js';
import { waitlistRouter } from './routes/waitlist.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

// ---------- CORS ----------
// Allowlist = https://gpusniff.com (always) + anything in CORS_ORIGIN,
// plus any chrome-extension:// / moz-extension:// origin (the extension's
// origin changes with its id and across dev builds).
const allowlist = new Set(config.allowedOrigins);
app.use(
  cors({
    origin(origin, callback) {
      // Same-origin / server-to-server requests have no Origin header.
      if (!origin) return callback(null, true);
      if (allowlist.has(origin)) return callback(null, true);
      if (origin.startsWith('chrome-extension://')) return callback(null, true);
      if (origin.startsWith('moz-extension://')) return callback(null, true);
      return callback(new Error(`Origin not allowed: ${origin}`));
    },
  })
);

// ---------- Health ----------
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    liveProviders: hasAnyProvider(),
    supabase: supabaseReady(),
    mockFallback: config.allowMockFallback,
  });
});

// ---------- Routes ----------
app.use('/api/prices', pricesRouter);
app.use('/api/deals', dealsRouter);
app.use('/api/search', searchRouter);
app.use('/api/history', historyRouter);
app.use('/api/waitlist', waitlistRouter);

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// ---------- Error handler ----------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[GPUSniff] Unhandled error:', err);
  res.status(status).json({ error: err.message || 'Internal error' });
});

app.listen(config.port, () => {
  console.log(`[GPUSniff] API listening on :${config.port}`);
  console.log(`[GPUSniff] live providers: ${hasAnyProvider() ? 'yes' : 'none (mock only)'}`);
});

export { app };
