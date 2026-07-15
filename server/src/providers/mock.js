/**
 * Mock provider — stand-in data for pure local dev ONLY.
 *
 * This runs exclusively when ZERO affiliate providers are configured
 * (see aggregator.js). The moment any real provider has credentials,
 * this file is never called, so mock prices can never reach production
 * or appear alongside real ones.
 */
import { RETAILERS } from '../gpuDatabase.js';

let warned = false;

export function mockOffers(gpu, retailerKeys = Object.keys(RETAILERS)) {
  if (!warned) {
    warned = true;
    console.warn(
      '[GPUSniff] WARNING: No API keys configured, running in dev-only mock mode'
    );
  }

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
