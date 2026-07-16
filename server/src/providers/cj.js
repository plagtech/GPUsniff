/**
 * CJ Affiliate (Commission Junction) — GraphQL Product Search.
 * Docs: https://developers.cj.com/graphql/reference/Product%20Search
 *
 * One request returns products across all advertisers you're joined
 * with. We map results back to GPUSniff retailer keys by advertiser id
 * (fallback: advertiser name), so a single call feeds Best Buy, B&H,
 * and Tech For Less.
 *
 * No-op ([]) unless CJ_PERSONAL_ACCESS_TOKEN + CJ_COMPANY_ID are set.
 */
import { config } from '../config.js';

const ENDPOINT = 'https://ads.api.cj.com/query';
// Abort any CJ request that hasn't completed within this window so a
// slow/unresponsive CJ endpoint can never hang the server.
const CJ_TIMEOUT_MS = 10_000;

// Map a CJ advertiser to a GPUSniff retailer key. The advertiser ID is
// the authoritative, stable match; the advertiser name is a fallback for
// advertisers whose ID we haven't recorded yet.
const ADVERTISER_ID_TO_RETAILER = {
  '3297514': 'techforless', // Tech For Less
};

function retailerForAdvertiser({ advertiserId, advertiserName = '' } = {}) {
  const byId = ADVERTISER_ID_TO_RETAILER[String(advertiserId)];
  if (byId) return byId;

  const n = advertiserName.toLowerCase();
  if (n.includes('best buy')) return 'bestbuy';
  if (n.includes('b&h') || n.includes('bhphoto') || n.includes('b & h')) return 'bhphoto';
  if (n.includes('tech for less') || n.includes('techforless')) return 'techforless';
  return null;
}

// Build the GraphQL query string. `advertiserIds` (when non-empty) is
// injected as `partnerIds` to restrict results to those advertisers.
function buildQuery(companyId, advertiserIds) {
  const advertiserFilter = advertiserIds.length
    ? `, partnerIds: [${advertiserIds.map((id) => `"${id}"`).join(', ')}]`
    : '';
  return `
    query ProductSearch($companyId: ID!, $keywords: [String!]!) {
      products(
        companyId: $companyId
        keywords: $keywords
        limit: 20${advertiserFilter}
      ) {
        totalCount
        resultList {
          title
          link
          linkCode(pid: "${companyId}") { clickUrl }
          advertiserId
          advertiserName
          # Commerce fields live on the Shopping type, not the Product
          # interface, so they must be selected via an inline fragment.
          ... on Shopping {
            availability
            price { amount currency }
            salePrice { amount currency }
          }
        }
      }
    }`;
}

/** Run one CJ query and return its resultList (aborts after CJ_TIMEOUT_MS). */
async function runCJQuery({ token, companyId, keywords, advertiserIds }) {
  const query = buildQuery(companyId, advertiserIds);

  // Hard 10s cap on the whole request (connect + body read) via
  // AbortController, so a hung CJ endpoint can never stall the server.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CJ_TIMEOUT_MS);
  let res;
  let rawBody;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { companyId, keywords } }),
      signal: controller.signal,
    });
    rawBody = await res.text();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`CJ API timeout after ${CJ_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`CJ API ${res.status}: ${rawBody.slice(0, 200)}`);
  }

  let json;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new Error('CJ returned non-JSON response');
  }
  if (json.errors?.length) {
    throw new Error(`CJ GraphQL error: ${json.errors[0]?.message}`);
  }

  return json.data?.products?.resultList ?? [];
}

export async function fetchCJOffers(gpu) {
  const { token, companyId, advertiserIds } = config.cj;
  if (!token || !companyId) return [];

  let results;
  try {
    results = await runCJQuery({
      token,
      companyId,
      keywords: gpu.keywords.slice(0, 3),
      advertiserIds,
    });
  } catch (err) {
    // Timeout or any CJ failure → return no offers rather than hang/throw.
    console.error(`[GPUSniff] CJ query failed for ${gpu.id}: ${err.message}`);
    return [];
  }

  // Return all mapped candidates; the aggregator sanity-filters out feed
  // junk and keeps the cheapest plausible card per retailer.
  const offers = [];
  for (const item of results) {
    const retailer = retailerForAdvertiser(item);
    if (!retailer) continue;
    const sale = num(item.salePrice?.amount);
    const regular = num(item.price?.amount);
    const price = sale ?? regular;
    if (price == null) continue;

    offers.push({
      retailer,
      price,
      title: item.title || null,
      originalPrice: sale != null && regular != null && regular > sale ? regular : null,
      inStock: isAvailable(item.availability),
      url: item.linkCode?.clickUrl || item.link,
      shipping: null,
      source: 'cj-graphql',
    });
  }

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
