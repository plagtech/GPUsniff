/**
 * Mock provider — deterministic-ish stand-in used when no real
 * affiliate keys are configured (or as a fallback for retailers a
 * given provider doesn't cover). Mirrors the shape of a real offer so
 * the extension renders identically whether data is live or mocked.
 *
 * Every offer carries `estimated: true` so the aggregator/UI can label
 * it and callers never mistake a guess for a real quoted price.
 */
import { RETAILERS } from '../gpuDatabase.js';

export function mockOffers(gpu, retailerKeys = Object.keys(RETAILERS)) {
  const basePrice = gpu.msrp;
  return retailerKeys.map((retailerKey) => {
    const variance = Math.random() * 0.15 - 0.05; // -5% .. +10%
    const price = Math.round(basePrice * (1 + variance) * 100) / 100;
    const inStock = Math.random() > 0.2;
    const hasDiscount = Math.random() > 0.65;
    const originalPrice = hasDiscount ? Math.round(price * 1.12 * 100) / 100 : null;
    return {
      retailer: retailerKey,
      price,
      originalPrice,
      inStock,
      url: mockUrl(retailerKey, gpu),
      shipping: inStock ? (Math.random() > 0.5 ? 'Free' : '$5.99') : null,
      source: 'mock',
      estimated: true,
    };
  });
}

function mockUrl(retailerKey, gpu) {
  const slug = gpu.name.toLowerCase().replace(/\s+/g, '-');
  const urls = {
    bestbuy: `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(gpu.name)}`,
    newegg: `https://www.newegg.com/p/pl?d=${encodeURIComponent(gpu.name)}`,
    amazon: `https://www.amazon.com/s?k=${encodeURIComponent(gpu.name)}`,
    bhphoto: `https://www.bhphotovideo.com/c/search?q=${encodeURIComponent(gpu.name)}`,
    microcenter: `https://www.microcenter.com/search/search_results.aspx?N=&Ntt=${encodeURIComponent(gpu.name)}`,
    walmart: `https://www.walmart.com/search?q=${encodeURIComponent(gpu.name)}`,
    ebay: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(gpu.name)}`,
  };
  return urls[retailerKey] || `https://www.google.com/search?q=${slug}`;
}
