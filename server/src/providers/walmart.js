/**
 * Walmart — via the Impact Radius affiliate Product Catalog API.
 * Docs: https://integrations.impact.com/impact-publisher/reference/catalog-item-search
 *
 * Auth: HTTP Basic with Account SID (username) + Auth Token (password).
 * Item search across the Walmart catalog you're contracted with; the
 * returned tracking URL already carries your affiliate parameters.
 *
 * No-op ([]) unless IMPACT_ACCOUNT_SID + IMPACT_AUTH_TOKEN are set.
 */
import { config } from '../config.js';

const BASE = 'https://api.impact.com';

export async function fetchWalmartOffers(gpu) {
  const { accountSid, authToken, walmartCampaignId } = config.impact;
  if (!accountSid || !authToken) return [];

  const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const params = new URLSearchParams({
    Query: gpu.name,
    PageSize: '5',
  });
  if (walmartCampaignId) params.set('CampaignId', walmartCampaignId);

  const url = `${BASE}/Mediapartners/${accountSid}/Catalogs/ItemSearch?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Impact API ${res.status}: ${await safeText(res)}`);
  }
  const data = await res.json();
  const items = Array.isArray(data.Items) ? data.Items : [];
  if (!items.length) return [];

  // Impact returns items sorted by relevance; pick the cheapest in-stock.
  const priced = items
    .map((it) => ({
      price: num(it.CurrentPrice),
      original: num(it.OriginalPrice),
      inStock: isAvailable(it.StockAvailability),
      url: it.TrackingUrl || it.Url,
      shipping: null,
      title: it.Name || null,
    }))
    .filter((o) => o.price != null)
    .sort((a, b) => a.price - b.price);

  // Return all candidates; the aggregator sanity-filters and keeps the
  // cheapest plausible card per retailer.
  return priced.map((o) => ({
    retailer: 'walmart',
    price: o.price,
    title: o.title,
    originalPrice: o.original && o.original > o.price ? o.original : null,
    inStock: o.inStock,
    url: o.url,
    shipping: o.shipping,
    source: 'impact-walmart',
  }));
}

function isAvailable(stock) {
  if (stock == null) return true;
  return String(stock).toLowerCase().includes('in');
}

function num(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '<no body>';
  }
}
