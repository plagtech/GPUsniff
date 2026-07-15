/**
 * Best Buy Product API — direct retailer feed.
 * Docs: https://bestbuyapis.github.io/api-documentation/
 *
 * Returns offers for the `bestbuy` retailer only. No-op (returns [])
 * when BESTBUY_API_KEY is not set, so the aggregator falls back to
 * mock/cached data for Best Buy.
 */
import { config } from '../config.js';

const BASE = 'https://api.bestbuy.com/v1';

export async function fetchBestBuyOffers(gpu) {
  const key = config.bestbuy.apiKey;
  if (!key) return [];

  // Best Buy's search: match GPUs in the Video Cards category (abcat0507002)
  // by keyword, sorted cheapest-first. `(search=...)` does a fuzzy name match.
  const terms = gpu.name.split(/\s+/).map((t) => `search=${encodeURIComponent(t)}`).join('&');
  const filter = `(categoryPath.id=abcat0507002&${terms})`;
  const params = new URLSearchParams({
    apiKey: key,
    format: 'json',
    show: 'sku,name,salePrice,regularPrice,onSale,url,onlineAvailability,addToCartUrl',
    sort: 'salePrice.asc',
    pageSize: '5',
  });
  const url = `${BASE}/products${filter}?${params.toString()}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Best Buy API ${res.status}: ${await safeText(res)}`);
  }
  const data = await res.json();
  const products = Array.isArray(data.products) ? data.products : [];
  if (!products.length) return [];

  // Take the cheapest available match.
  const p = products.find((x) => x.onlineAvailability) || products[0];
  return [
    {
      retailer: 'bestbuy',
      price: p.salePrice ?? p.regularPrice,
      originalPrice: p.onSale ? p.regularPrice : null,
      inStock: Boolean(p.onlineAvailability),
      // Prefer the affiliate-friendly addToCartUrl when present.
      url: p.addToCartUrl || p.url,
      shipping: null,
      source: 'bestbuy-api',
      sku: String(p.sku),
    },
  ];
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '<no body>';
  }
}
