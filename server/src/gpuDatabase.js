/**
 * Curated GPU catalog + retailer definitions.
 *
 * This is the server-side source of truth. It mirrors the list the
 * extension ships with (extension/api.js) so product matching is
 * consistent on both sides. When you add a card, add it in both places
 * (or have the extension pull the list from GET /api/gpus).
 */

export const GPU_DATABASE = [
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

export const RETAILERS = {
  bestbuy: { name: 'Best Buy', domain: 'bestbuy.com', logo: '🏪', color: '#0046BE', affiliateNetwork: 'cj' },
  newegg: { name: 'Newegg', domain: 'newegg.com', logo: '🥚', color: '#F7A000', affiliateNetwork: 'rakuten' },
  amazon: { name: 'Amazon', domain: 'amazon.com', logo: '📦', color: '#FF9900', affiliateNetwork: 'amazon' },
  bhphoto: { name: 'B&H Photo', domain: 'bhphotovideo.com', logo: '📷', color: '#00A0E3', affiliateNetwork: 'cj' },
  microcenter: { name: 'Micro Center', domain: 'microcenter.com', logo: '🔧', color: '#CF202F', affiliateNetwork: 'shareasale' },
  walmart: { name: 'Walmart', domain: 'walmart.com', logo: '🛒', color: '#0071DC', affiliateNetwork: 'impact' },
  ebay: { name: 'eBay', domain: 'ebay.com', logo: '🏷️', color: '#E53238', affiliateNetwork: 'ebay' },
  techforless: { name: 'Tech For Less', domain: 'www.techforless.com', logo: '🛍️', color: '#0F9D8C', affiliateNetwork: 'cj' },
};

const BY_ID = new Map(GPU_DATABASE.map((g) => [g.id, g]));

export function getGpuById(id) {
  return BY_ID.get(id) || null;
}

export function retailerMeta(retailerKey) {
  return RETAILERS[retailerKey] || null;
}

/** Identify a GPU from free-text (a product title). */
export function identifyGPU(text) {
  if (!text) return null;
  const normalized = String(text).toLowerCase();
  // Prefer the most specific keyword match (longest keyword wins so
  // "rtx 5070 ti" doesn't get grabbed by the "5070" entry).
  let best = null;
  let bestLen = 0;
  for (const gpu of GPU_DATABASE) {
    for (const keyword of gpu.keywords) {
      if (normalized.includes(keyword) && keyword.length > bestLen) {
        best = gpu;
        bestLen = keyword.length;
      }
    }
  }
  return best;
}

/** Search the catalog by name / brand / keyword. */
export function searchGPUs(query) {
  if (!query || query.length < 2) return [];
  const normalized = query.toLowerCase();
  return GPU_DATABASE.filter((gpu) => {
    const nameMatch = gpu.name.toLowerCase().includes(normalized);
    const brandMatch = gpu.brand.toLowerCase().includes(normalized);
    const keywordMatch = gpu.keywords.some((k) => k.includes(normalized));
    return nameMatch || brandMatch || keywordMatch;
  });
}
