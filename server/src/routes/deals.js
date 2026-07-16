import { Router } from 'express';
import { cache } from '../cache.js';
import { getPrices } from '../aggregator.js';
import { getGpuById } from '../gpuDatabase.js';

export const dealsRouter = Router();

// Popular cards surfaced on the Trending Deals tab. Small so building the
// list only fans out a handful of (cached) price lookups.
const FEATURED = ['rtx-5090', 'rtx-5080', 'rtx-5070-ti', 'rtx-5070', 'rtx-5060-ti', 'rx-9070-xt'];

const DEALS_CACHE_KEY = 'deals';
// Cache deals server-side for 30 min so the popup doesn't re-fan-out to the
// affiliate providers (Rakuten/CJ/…) on every open.
const DEALS_TTL_SECONDS = 30 * 60;

/**
 * Build the trending-deals list: for each featured GPU, take the cheapest
 * in-stock offer and keep it only if it represents real savings (a sale
 * price below its original, or a price below MSRP). Cached for 30 min.
 */
export async function buildDeals() {
  const settled = await Promise.allSettled(FEATURED.map((id) => getPrices(id)));
  const deals = [];

  settled.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    const gpu = getGpuById(FEATURED[i]);
    if (!gpu) return;

    // aggregator returns prices sorted cheapest-first, so the first in-stock
    // entry is the best in-stock price.
    const best = result.value.prices.find((p) => p.inStock);
    if (!best) return;

    // Savings = an actual sale discount, else how far below MSRP the price is.
    const savings =
      best.savings > 0 ? best.savings : best.price < gpu.msrp ? round2(gpu.msrp - best.price) : 0;

    // Only real deals — skip anything at or above its usual price.
    if (savings <= 0) return;

    deals.push({
      gpu: { id: gpu.id, brand: gpu.brand, name: gpu.name, tier: gpu.tier, msrp: gpu.msrp },
      retailer: best.retailer,
      price: best.price,
      originalPrice: best.originalPrice,
      savings,
      badge: badgeFor(gpu, best),
    });
  });

  // Biggest savings first.
  deals.sort((a, b) => b.savings - a.savings);
  cache.set(DEALS_CACHE_KEY, deals, DEALS_TTL_SECONDS);
  return deals;
}

// GET /api/deals — cached trending deals (best in-stock price per featured GPU).
dealsRouter.get('/', async (_req, res, next) => {
  try {
    const cached = cache.get(DEALS_CACHE_KEY);
    res.json(cached ?? (await buildDeals()));
  } catch (err) {
    next(err);
  }
});

function badgeFor(gpu, best) {
  if (best.originalPrice && best.savings > 0) return 'Price Drop';
  if (best.price < gpu.msrp) return 'Below MSRP';
  if (gpu.tier === 'budget') return 'Budget Pick';
  return 'In Stock';
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
