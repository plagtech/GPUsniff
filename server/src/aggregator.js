/**
 * Aggregation layer: turn raw provider offers into the sorted,
 * display-ready price list the extension expects.
 *
 * Every price returned is REAL — quoted by a configured affiliate
 * provider and clickable. There is no gap-filling: a retailer with no
 * real offer simply doesn't appear in the response.
 *
 * The only exception is pure local dev with ZERO providers configured,
 * where `mockOffers` supplies stand-in data so the UI can be exercised
 * offline. That path can never run in production because production has
 * at least one provider configured (`hasAnyProvider()` is true).
 *
 * Results are cached per-GPU for PRICE_CACHE_TTL_SECONDS.
 */
import { config, hasAnyProvider } from './config.js';
import { cache } from './cache.js';
import { getGpuById, retailerMeta } from './gpuDatabase.js';
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
    ...(offer.sku ? { sku: offer.sku } : {}),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Keep only the cheapest offer per retailer (a retailer can be fed by
 *  more than one provider, e.g. Best Buy via both its own API and CJ). */
function cheapestPerRetailer(offers) {
  const byRetailer = new Map();
  for (const offer of offers) {
    if (offer.price == null) continue;
    const current = byRetailer.get(offer.retailer);
    if (!current || offer.price < current.price) {
      byRetailer.set(offer.retailer, offer);
    }
  }
  return [...byRetailer.values()];
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
  const live = hasAnyProvider();

  // Live: only real offers from configured providers. No provider ⇒ no row.
  // Dev-only (zero providers configured): stand-in data so the UI works offline.
  let offers = [];
  let errors = [];
  if (live) {
    ({ offers, errors } = await fetchAllRealOffers(gpu));
  } else {
    offers = mockOffers(gpu);
  }

  const prices = cheapestPerRetailer(offers)
    .map((o) => decorate(o, nowIso))
    .sort((a, b) => a.price - b.price);

  const payload = { gpuId, prices, errors };
  cache.set(cacheKey, payload, config.priceCacheTtlSeconds);

  // Only persist real prices to price history — never mock dev data.
  if (live && prices.length) {
    recordSnapshots(gpuId, prices, nowIso).catch((e) =>
      console.error('[GPUSniff] snapshot write failed:', e.message)
    );
  }

  return { ...payload, cached: false };
}
