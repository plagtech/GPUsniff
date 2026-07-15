/**
 * Aggregation layer: turn raw provider offers into the sorted,
 * display-ready price list the extension expects — the same shape the
 * old mock `fetchPrices()` produced, so the extension UI is unchanged.
 *
 * Merge rules:
 *  - Keep the cheapest real offer per retailer (a retailer can be fed by
 *    more than one provider, e.g. Best Buy via both its own API and CJ).
 *  - Retailers with no real offer are filled with an `estimated` mock
 *    price when ALLOW_MOCK_FALLBACK is on, so the table is never empty.
 *  - Results are cached per-GPU for PRICE_CACHE_TTL_SECONDS.
 */
import { config } from './config.js';
import { cache } from './cache.js';
import { RETAILERS, getGpuById, retailerMeta } from './gpuDatabase.js';
import { fetchAllRealOffers } from './providers/index.js';
import { mockOffers } from './providers/mock.js';
import { recordSnapshots } from './supabase.js';

function decorate(offer, nowIso) {
  const meta = retailerMeta(offer.retailer) || {};
  const price = round2(offer.price);
  const originalPrice = offer.originalPrice != null ? round2(offer.originalPrice) : null;
  return {
    retailer: offer.retailer,
    retailerName: meta.name || offer.retailer,
    retailerLogo: meta.logo || '🛍️',
    retailerColor: meta.color || '#888',
    price,
    originalPrice,
    savings: originalPrice ? round2(originalPrice - price) : 0,
    inStock: Boolean(offer.inStock),
    url: offer.url || '#',
    shipping: offer.shipping ?? null,
    lastChecked: nowIso,
    source: offer.source || 'unknown',
    estimated: Boolean(offer.estimated),
    ...(offer.sku ? { sku: offer.sku } : {}),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Merge real offers (cheapest per retailer) + mock fill for the rest. */
function mergeOffers(gpu, realOffers) {
  const cheapestByRetailer = new Map();
  for (const offer of realOffers) {
    if (offer.price == null) continue;
    const current = cheapestByRetailer.get(offer.retailer);
    if (!current || offer.price < current.price) {
      cheapestByRetailer.set(offer.retailer, offer);
    }
  }

  if (config.allowMockFallback) {
    const missing = Object.keys(RETAILERS).filter((k) => !cheapestByRetailer.has(k));
    for (const offer of mockOffers(gpu, missing)) {
      cheapestByRetailer.set(offer.retailer, offer);
    }
  }

  return [...cheapestByRetailer.values()];
}

/**
 * Fetch and aggregate prices for one GPU id.
 * @returns {Promise<{ gpuId, prices: object[], errors, cached: boolean }>}
 */
export async function getPrices(gpuId) {
  const gpu = getGpuById(gpuId);
  if (!gpu) {
    const err = new Error(`Unknown GPU id: ${gpuId}`);
    err.status = 404;
    throw err;
  }

  const cacheKey = `prices:${gpuId}`;
  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  const nowIso = new Date().toISOString();
  const { offers, errors } = await fetchAllRealOffers(gpu);
  const merged = mergeOffers(gpu, offers);
  const prices = merged.map((o) => decorate(o, nowIso)).sort((a, b) => a.price - b.price);

  const payload = { gpuId, prices, errors };
  cache.set(cacheKey, payload, config.priceCacheTtlSeconds);

  // Persist real (non-estimated) snapshots for price history. Fire-and-forget;
  // never let a storage hiccup block the price response.
  recordSnapshots(
    gpuId,
    prices.filter((p) => !p.estimated),
    nowIso
  ).catch((e) => console.error('[GPUSniff] snapshot write failed:', e.message));

  return { ...payload, cached: false };
}
