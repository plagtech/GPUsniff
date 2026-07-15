/**
 * GPUSniff API Layer
 * 
 * This module handles all price fetching and comparison logic.
 * Currently uses mock data — swap each provider function with real
 * affiliate API calls when keys are provisioned.
 * 
 * Affiliate networks to integrate:
 * - CJ Affiliate (Best Buy, B&H Photo)
 * - Impact Radius (Target, Walmart)
 * - eBay Partner Network
 * - Partnerize (Newegg)
 * - Rakuten Advertising
 * - Amazon PA-API 5.0 (optional)
 */

// ============================================================
// Configuration — add real API keys here
// ============================================================
const CONFIG = {
  // Affiliate keys live ONLY on the backend (server/.env) — never ship
  // them in the extension. The extension talks to our own API, which
  // aggregates the affiliate networks server-side.
  //
  // Backend URL. Override for local dev by setting `gpusniff_backend_url`
  // in chrome.storage.local (see resolveBackendUrl below).
  backendUrl: 'https://api.gpusniff.com',
  // Live data on: the extension fetches from the backend and transparently
  // falls back to on-device mock data if the backend is unreachable.
  useLiveData: true,
  // How long (ms) to wait on a backend request before falling back to mock.
  requestTimeoutMs: 6000,
};

// ============================================================
// GPU Product Database (curated list for matching)
// ============================================================
const GPU_DATABASE = [
  // NVIDIA RTX 50 Series
  { id: 'rtx-5090', brand: 'NVIDIA', name: 'RTX 5090', tier: 'flagship', msrp: 1999, keywords: ['5090', 'rtx 5090', 'geforce 5090'] },
  { id: 'rtx-5080', brand: 'NVIDIA', name: 'RTX 5080', tier: 'high', msrp: 999, keywords: ['5080', 'rtx 5080', 'geforce 5080'] },
  { id: 'rtx-5070-ti', brand: 'NVIDIA', name: 'RTX 5070 Ti', tier: 'high-mid', msrp: 749, keywords: ['5070 ti', 'rtx 5070 ti', 'geforce 5070 ti'] },
  { id: 'rtx-5070', brand: 'NVIDIA', name: 'RTX 5070', tier: 'mid', msrp: 549, keywords: ['5070', 'rtx 5070', 'geforce 5070'] },
  { id: 'rtx-5060-ti', brand: 'NVIDIA', name: 'RTX 5060 Ti', tier: 'mid', msrp: 449, keywords: ['5060 ti', 'rtx 5060 ti'] },
  { id: 'rtx-5060', brand: 'NVIDIA', name: 'RTX 5060', tier: 'budget', msrp: 299, keywords: ['5060', 'rtx 5060'] },
  // NVIDIA RTX 40 Series (still widely sold)
  { id: 'rtx-4090', brand: 'NVIDIA', name: 'RTX 4090', tier: 'flagship', msrp: 1599, keywords: ['4090', 'rtx 4090', 'geforce 4090'] },
  { id: 'rtx-4080-super', brand: 'NVIDIA', name: 'RTX 4080 Super', tier: 'high', msrp: 999, keywords: ['4080 super', 'rtx 4080 super'] },
  { id: 'rtx-4070-ti-super', brand: 'NVIDIA', name: 'RTX 4070 Ti Super', tier: 'high-mid', msrp: 799, keywords: ['4070 ti super', 'rtx 4070 ti super'] },
  { id: 'rtx-4070-super', brand: 'NVIDIA', name: 'RTX 4070 Super', tier: 'mid', msrp: 599, keywords: ['4070 super', 'rtx 4070 super'] },
  { id: 'rtx-4060-ti', brand: 'NVIDIA', name: 'RTX 4060 Ti', tier: 'mid', msrp: 399, keywords: ['4060 ti', 'rtx 4060 ti'] },
  { id: 'rtx-4060', brand: 'NVIDIA', name: 'RTX 4060', tier: 'budget', msrp: 299, keywords: ['4060', 'rtx 4060', 'geforce 4060'] },
  // AMD Radeon RX 9000 Series
  { id: 'rx-9070-xt', brand: 'AMD', name: 'RX 9070 XT', tier: 'high-mid', msrp: 549, keywords: ['9070 xt', 'rx 9070 xt', 'radeon 9070 xt'] },
  { id: 'rx-9070', brand: 'AMD', name: 'RX 9070', tier: 'mid', msrp: 449, keywords: ['9070', 'rx 9070', 'radeon 9070'] },
  // AMD Radeon RX 7000 Series
  { id: 'rx-7900-xtx', brand: 'AMD', name: 'RX 7900 XTX', tier: 'flagship', msrp: 999, keywords: ['7900 xtx', 'rx 7900 xtx', 'radeon 7900 xtx'] },
  { id: 'rx-7900-xt', brand: 'AMD', name: 'RX 7900 XT', tier: 'high', msrp: 899, keywords: ['7900 xt', 'rx 7900 xt'] },
  { id: 'rx-7800-xt', brand: 'AMD', name: 'RX 7800 XT', tier: 'mid', msrp: 499, keywords: ['7800 xt', 'rx 7800 xt', 'radeon 7800 xt'] },
  { id: 'rx-7700-xt', brand: 'AMD', name: 'RX 7700 XT', tier: 'mid', msrp: 449, keywords: ['7700 xt', 'rx 7700 xt'] },
  { id: 'rx-7600', brand: 'AMD', name: 'RX 7600', tier: 'budget', msrp: 269, keywords: ['7600', 'rx 7600', 'radeon 7600'] },
  // Intel Arc
  { id: 'arc-b580', brand: 'Intel', name: 'Arc B580', tier: 'budget', msrp: 249, keywords: ['b580', 'arc b580', 'intel b580'] },
  { id: 'arc-a770', brand: 'Intel', name: 'Arc A770', tier: 'mid', msrp: 349, keywords: ['a770', 'arc a770', 'intel a770'] },
];

// ============================================================
// Retailer Definitions
// ============================================================
const RETAILERS = {
  bestbuy: {
    name: 'Best Buy',
    domain: 'bestbuy.com',
    logo: '🏪',
    color: '#0046BE',
    affiliateNetwork: 'cj',
  },
  newegg: {
    name: 'Newegg',
    domain: 'newegg.com',
    logo: '🥚',
    color: '#F7A000',
    affiliateNetwork: 'partnerize',
  },
  amazon: {
    name: 'Amazon',
    domain: 'amazon.com',
    logo: '📦',
    color: '#FF9900',
    affiliateNetwork: 'amazon',
  },
  bhphoto: {
    name: 'B&H Photo',
    domain: 'bhphotovideo.com',
    logo: '📷',
    color: '#00A0E3',
    affiliateNetwork: 'cj',
  },
  microcenter: {
    name: 'Micro Center',
    domain: 'microcenter.com',
    logo: '🔧',
    color: '#CF202F',
    affiliateNetwork: 'shareasale',
  },
  walmart: {
    name: 'Walmart',
    domain: 'walmart.com',
    logo: '🛒',
    color: '#0071DC',
    affiliateNetwork: 'impact',
  },
  ebay: {
    name: 'eBay',
    domain: 'ebay.com',
    logo: '🏷️',
    color: '#E53238',
    affiliateNetwork: 'ebay',
  },
};

// ============================================================
// Product Matching
// ============================================================

/**
 * Identify a GPU from a product page title or description
 */
function identifyGPU(text) {
  const normalized = text.toLowerCase();
  for (const gpu of GPU_DATABASE) {
    for (const keyword of gpu.keywords) {
      if (normalized.includes(keyword)) {
        return gpu;
      }
    }
  }
  return null;
}

/**
 * Detect which retailer we're on from URL
 */
function detectRetailer(url) {
  for (const [key, retailer] of Object.entries(RETAILERS)) {
    if (url.includes(retailer.domain)) {
      return { key, ...retailer };
    }
  }
  return null;
}

// ============================================================
// Price Fetching (Mock → Real API swap points)
// ============================================================

/**
 * Generate mock price data for a GPU across retailers.
 * REPLACE: each case with real affiliate API calls.
 */
function getMockPrices(gpuId) {
  const gpu = GPU_DATABASE.find(g => g.id === gpuId);
  if (!gpu) return [];

  const basePrice = gpu.msrp;
  const retailers = Object.keys(RETAILERS);
  const results = [];

  for (const retailerKey of retailers) {
    // Simulate realistic price variation
    const variance = (Math.random() * 0.15) - 0.05; // -5% to +10%
    const price = Math.round((basePrice * (1 + variance)) * 100) / 100;
    const inStock = Math.random() > 0.2; // 80% in stock
    const hasDiscount = Math.random() > 0.65;
    const originalPrice = hasDiscount ? Math.round(price * 1.12 * 100) / 100 : null;

    results.push({
      retailer: retailerKey,
      retailerName: RETAILERS[retailerKey].name,
      retailerLogo: RETAILERS[retailerKey].logo,
      retailerColor: RETAILERS[retailerKey].color,
      price: price,
      originalPrice: originalPrice,
      savings: originalPrice ? Math.round((originalPrice - price) * 100) / 100 : 0,
      inStock: inStock,
      url: generateMockUrl(retailerKey, gpu),
      lastChecked: new Date().toISOString(),
      shipping: inStock ? (Math.random() > 0.5 ? 'Free' : '$5.99') : null,
    });
  }

  // Sort by price
  results.sort((a, b) => a.price - b.price);
  return results;
}

function generateMockUrl(retailerKey, gpu) {
  const slugName = gpu.name.toLowerCase().replace(/\s+/g, '-');
  const urls = {
    bestbuy: `https://www.bestbuy.com/site/nvidia-geforce-${slugName}/`,
    newegg: `https://www.newegg.com/p/N82E16814`,
    amazon: `https://www.amazon.com/dp/B0EXAMPLE`,
    bhphoto: `https://www.bhphotovideo.com/c/product/${slugName}`,
    microcenter: `https://www.microcenter.com/product/nvidia-geforce-${slugName}`,
    walmart: `https://www.walmart.com/ip/NVIDIA-GeForce-${slugName}`,
    ebay: `https://www.ebay.com/itm/nvidia-geforce-${slugName}`,
  };
  return urls[retailerKey] || '#';
}

// ============================================================
// Real API integration stubs
// ============================================================

/**
 * TODO: CJ Affiliate API — Best Buy, B&H Photo
 * Endpoint: https://productcatalog.api.cj.com/query
 * Auth: Bearer token
 */
async function fetchCJPrices(gpuName) {
  if (!CONFIG.cj.apiKey) return [];
  // const response = await fetch('https://productcatalog.api.cj.com/query', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${CONFIG.cj.apiKey}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     query: `{ products(partnerIds: ["..."], keywords: "${gpuName}") { ... } }`
  //   })
  // });
  return [];
}

/**
 * TODO: Impact Radius API — Walmart, Target
 * Endpoint: https://api.impact.com/
 */
async function fetchImpactPrices(gpuName) {
  if (!CONFIG.impact.apiKey) return [];
  return [];
}

/**
 * TODO: eBay Partner Network — Browse API
 * Endpoint: https://api.ebay.com/buy/browse/v1/item_summary/search
 */
async function fetchEbayPrices(gpuName) {
  if (!CONFIG.ebay.appId) return [];
  return [];
}

// ============================================================
// Backend client
// ============================================================

/**
 * Resolve the backend base URL. Allows a local-dev override stored in
 * chrome.storage.local under `gpusniff_backend_url` (e.g.
 * "http://localhost:8080") without editing this file.
 */
async function resolveBackendUrl() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get('gpusniff_backend_url');
      if (data.gpusniff_backend_url) return data.gpusniff_backend_url;
    }
  } catch (_) { /* storage unavailable — use default */ }
  return CONFIG.backendUrl;
}

/** fetch() with a timeout so a slow/dead backend never hangs the UI. */
async function backendFetch(path) {
  const base = await resolveBackendUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
  try {
    const response = await fetch(`${base}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Backend ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// Unified Price Fetch
// ============================================================

/**
 * Fetch prices for a GPU across all retailers.
 * Returns sorted array of price results. Falls back to on-device mock
 * data if the backend is disabled or unreachable.
 */
async function fetchPrices(gpuId) {
  if (CONFIG.useLiveData) {
    try {
      const prices = await backendFetch(`/api/prices/${gpuId}`);
      if (Array.isArray(prices) && prices.length) return prices;
      console.warn('[GPUSniff] backend returned no prices, using mock');
    } catch (err) {
      console.error('[GPUSniff] price API error, falling back to mock:', err);
    }
  }
  return getMockPrices(gpuId);
}

/**
 * Fetch price history for a GPU (for price charts).
 * Returns { gpuId, days, series, snapshots } or null if unavailable.
 */
async function fetchHistory(gpuId, days = 30) {
  if (!CONFIG.useLiveData) return null;
  try {
    return await backendFetch(`/api/history/${gpuId}?days=${days}`);
  } catch (err) {
    console.error('[GPUSniff] history API error:', err);
    return null;
  }
}

/**
 * Search GPUs by query string
 */
function searchGPUs(query) {
  if (!query || query.length < 2) return [];
  const normalized = query.toLowerCase();
  return GPU_DATABASE.filter(gpu => {
    const nameMatch = gpu.name.toLowerCase().includes(normalized);
    const brandMatch = gpu.brand.toLowerCase().includes(normalized);
    const keywordMatch = gpu.keywords.some(k => k.includes(normalized));
    return nameMatch || brandMatch || keywordMatch;
  });
}

/**
 * Get trending deals. Fetches live deals from the backend and falls
 * back to a curated mock list if the backend is disabled/unreachable.
 * Returns a Promise (callers must await).
 */
async function getTrendingDeals() {
  if (CONFIG.useLiveData) {
    try {
      const deals = await backendFetch('/api/deals');
      if (Array.isArray(deals) && deals.length) return deals;
    } catch (err) {
      console.error('[GPUSniff] deals API error, falling back to mock:', err);
    }
  }
  return getMockTrendingDeals();
}

/**
 * Curated mock trending deals (offline fallback).
 */
function getMockTrendingDeals() {
  const deals = [
    {
      gpu: GPU_DATABASE.find(g => g.id === 'rtx-5070'),
      retailer: 'newegg',
      price: 519.99,
      originalPrice: 549.99,
      savings: 30,
      badge: 'Price Drop',
    },
    {
      gpu: GPU_DATABASE.find(g => g.id === 'rx-9070-xt'),
      retailer: 'bestbuy',
      price: 529.99,
      originalPrice: 549.99,
      savings: 20,
      badge: 'In Stock',
    },
    {
      gpu: GPU_DATABASE.find(g => g.id === 'rtx-4060-ti'),
      retailer: 'amazon',
      price: 349.99,
      originalPrice: 399.99,
      savings: 50,
      badge: 'Best Price',
    },
    {
      gpu: GPU_DATABASE.find(g => g.id === 'arc-b580'),
      retailer: 'newegg',
      price: 219.99,
      originalPrice: 249.99,
      savings: 30,
      badge: 'Budget Pick',
    },
  ];
  return deals;
}

// ============================================================
// ES module exports
// Consumed by the popup (popup/popup.html loads popup.js as a module)
// and the background service worker (declared "type": "module").
// ============================================================
export {
  CONFIG,
  GPU_DATABASE,
  RETAILERS,
  identifyGPU,
  detectRetailer,
  fetchPrices,
  fetchHistory,
  searchGPUs,
  getTrendingDeals,
  getMockPrices,
};
