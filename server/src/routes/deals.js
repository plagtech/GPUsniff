import { Router } from 'express';
import { cache } from '../cache.js';
import { config } from '../config.js';
import { getPrices } from '../aggregator.js';
import { getGpuById } from '../gpuDatabase.js';

export const dealsRouter = Router();

// Cards we surface on the Trending Deals tab. Kept small so building the
// list only fans out a handful of (cached) price lookups.
const FEATURED = ['rtx-5070', 'rx-9070-xt', 'rtx-5080', 'rtx-4060-ti', 'arc-b580', 'rx-7800-xt'];

// GET /api/deals — best current offer per featured GPU, with a badge.
dealsRouter.get('/', async (_req, res, next) => {
  try {
    const cached = cache.get('deals');
    if (cached) return res.json(cached);

    const settled = await Promise.allSettled(FEATURED.map((id) => getPrices(id)));
    const deals = [];

    settled.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      const gpu = getGpuById(FEATURED[i]);
      const best = result.value.prices.find((p) => p.inStock) || result.value.prices[0];
      if (!gpu || !best) return;
      deals.push({
        gpu: { id: gpu.id, brand: gpu.brand, name: gpu.name, tier: gpu.tier, msrp: gpu.msrp },
        retailer: best.retailer,
        price: best.price,
        originalPrice: best.originalPrice,
        savings: best.savings || (best.price < gpu.msrp ? round2(gpu.msrp - best.price) : 0),
        badge: badgeFor(gpu, best),
        estimated: best.estimated,
      });
    });

    // Highlight the biggest savings first.
    deals.sort((a, b) => (b.savings || 0) - (a.savings || 0));

    // Short TTL so deals feel live but we don't rebuild on every popup open.
    cache.set('deals', deals, Math.min(config.priceCacheTtlSeconds, 300));
    res.json(deals);
  } catch (err) {
    next(err);
  }
});

function badgeFor(gpu, best) {
  if (best.originalPrice && best.savings > 0) return 'Price Drop';
  if (best.price < gpu.msrp) return 'Below MSRP';
  if (gpu.tier === 'budget') return 'Budget Pick';
  if (!best.inStock) return 'Restock Soon';
  return 'In Stock';
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
