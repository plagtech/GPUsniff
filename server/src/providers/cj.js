/**
 * CJ Affiliate (Commission Junction) — GraphQL Product Search.
 * Docs: https://developers.cj.com/graphql/reference/Product%20Search
 *
 * One request returns products across all advertisers you're joined
 * with. We map results back to GPUSniff retailer keys by matching the
 * advertiser name, so a single call feeds both Best Buy and B&H Photo.
 *
 * No-op ([]) unless CJ_PERSONAL_ACCESS_TOKEN + CJ_COMPANY_ID are set.
 */
import { config } from '../config.js';

const ENDPOINT = 'https://ads.api.cj.com/query';

// Map an advertiser name (as CJ reports it) to a GPUSniff retailer key.
function retailerForAdvertiser(name = '') {
  const n = name.toLowerCase();
  if (n.includes('best buy')) return 'bestbuy';
  if (n.includes('b&h') || n.includes('bhphoto') || n.includes('b & h')) return 'bhphoto';
  return null;
}

export async function fetchCJOffers(gpu) {
  const { token, companyId, advertiserIds } = config.cj;
  if (!token || !companyId) return [];

  const advertiserFilter = advertiserIds.length
    ? `, partnerIds: [${advertiserIds.map((id) => `"${id}"`).join(', ')}]`
    : '';

  const query = `
    query ProductSearch($companyId: ID!, $keywords: [String!]!) {
      products(
        companyId: $companyId
        keywords: $keywords
        limit: 20${advertiserFilter}
      ) {
        totalCount
        resultList {
          title
          price { amount currency }
          salePrice { amount currency }
          linkCode(pid: "${config.cj.companyId}") { clickUrl }
          link
          availability
          advertiserName
        }
      }
    }`;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: { companyId, keywords: gpu.keywords.slice(0, 3) },
    }),
  });

  if (!res.ok) {
    throw new Error(`CJ API ${res.status}: ${await safeText(res)}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`CJ GraphQL error: ${json.errors[0]?.message}`);
  }

  const results = json.data?.products?.resultList ?? [];
  const offers = [];
  // Keep only the cheapest offer per retailer.
  const cheapestByRetailer = new Map();

  for (const item of results) {
    const retailer = retailerForAdvertiser(item.advertiserName);
    if (!retailer) continue;
    const sale = num(item.salePrice?.amount);
    const regular = num(item.price?.amount);
    const price = sale ?? regular;
    if (price == null) continue;

    const offer = {
      retailer,
      price,
      originalPrice: sale != null && regular != null && regular > sale ? regular : null,
      inStock: isAvailable(item.availability),
      url: item.linkCode?.clickUrl || item.link,
      shipping: null,
      source: 'cj-graphql',
    };
    const current = cheapestByRetailer.get(retailer);
    if (!current || offer.price < current.price) {
      cheapestByRetailer.set(retailer, offer);
    }
  }

  for (const offer of cheapestByRetailer.values()) offers.push(offer);
  return offers;
}

function isAvailable(availability) {
  if (availability == null) return true; // CJ often omits; assume listed = buyable
  return String(availability).toLowerCase().includes('in');
}

function num(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '<no body>';
  }
}
