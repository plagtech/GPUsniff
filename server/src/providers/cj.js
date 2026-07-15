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
 *
 * ─── TEMP DEBUG ───────────────────────────────────────────────────────
 * Verbose diagnostics + the broad advertiser-3297514 probe are OFF by
 * default (they added extra CJ calls per request). Set env CJ_DEBUG=true
 * to re-enable them and print to the Railway console with a `[CJ DEBUG]`
 * prefix. Remove this block + the debug calls once Tech For Less is
 * confirmed working. See debugBroadProbe() for the probe.
 * ──────────────────────────────────────────────────────────────────────
 */
import { config } from '../config.js';

const ENDPOINT = 'https://ads.api.cj.com/query';
const TFL_ADVERTISER_ID = '3297514'; // Tech For Less
// Abort any CJ request that hasn't completed within this window so a
// slow/unresponsive CJ endpoint can never hang the server.
const CJ_TIMEOUT_MS = 10_000;

// TEMP DEBUG: OFF by default. Set CJ_DEBUG=true to enable verbose logging
// and the one-time broad probe (both make extra CJ calls).
const DEBUG = process.env.CJ_DEBUG === 'true';
let probeDone = false; // run the broad probe once per process, not per request

// Map a CJ advertiser to a GPUSniff retailer key. The advertiser ID is
// the authoritative, stable match; the advertiser name is a fallback for
// advertisers whose ID we haven't recorded yet.
const ADVERTISER_ID_TO_RETAILER = {
  [TFL_ADVERTISER_ID]: 'techforless',
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

/**
 * Run one CJ query and return its resultList. Emits [CJ DEBUG] logs for
 * the exact query, whether advertiser 3297514 is targeted, and the raw
 * response body (before any filtering).
 */
async function runCJQuery({ token, companyId, keywords, advertiserIds, label }) {
  const query = buildQuery(companyId, advertiserIds);

  if (DEBUG) {
    console.log(`[CJ DEBUG] (${label}) keywords = ${JSON.stringify(keywords)}`);
    console.log(
      `[CJ DEBUG] (${label}) advertiserIds sent = ${JSON.stringify(advertiserIds)}` +
        (advertiserIds.length ? '' : '  (empty → ALL joined advertisers)')
    );
    console.log(
      `[CJ DEBUG] (${label}) advertiser 3297514 targeted? ` +
        `${advertiserIds.includes(TFL_ADVERTISER_ID)}  |  ` +
        `present in query string? ${query.includes(TFL_ADVERTISER_ID)}`
    );
    console.log(`[CJ DEBUG] (${label}) exact GraphQL query:\n${query}`);
  }

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

  if (DEBUG) {
    console.log(`[CJ DEBUG] (${label}) HTTP status = ${res.status}`);
    console.log(`[CJ DEBUG] (${label}) raw response (pre-filter):\n${rawBody.slice(0, 2000)}`);
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

  const list = json.data?.products?.resultList ?? [];
  if (DEBUG) {
    const total = json.data?.products?.totalCount;
    console.log(
      `[CJ DEBUG] (${label}) totalCount=${total ?? 'n/a'}, resultList length=${list.length}`
    );
  }
  return list;
}

/**
 * TEMP DEBUG: broad probe against advertiser 3297514 (Tech For Less).
 * Ignores GPU model names and searches generic terms so we can tell
 * whether CJ returns ANY Tech For Less products at all. Runs once per
 * process. If these come back empty, the issue is account linkage /
 * advertiser id / the partnerIds argument — not keyword narrowness.
 */
async function debugBroadProbe({ token, companyId }) {
  console.log('[CJ DEBUG] ===== Tech For Less broad probe (advertiser 3297514) =====');
  const broadTerms = ['graphics card', 'gpu', 'geforce rtx', 'radeon'];
  for (const term of broadTerms) {
    try {
      const results = await runCJQuery({
        token,
        companyId,
        keywords: [term],
        advertiserIds: [TFL_ADVERTISER_ID],
        label: `probe:"${term}"`,
      });
      const tfl = results.filter((r) => String(r.advertiserId) === TFL_ADVERTISER_ID);
      console.log(
        `[CJ DEBUG] probe "${term}" → ${results.length} products total, ${tfl.length} from Tech For Less`
      );
      tfl.slice(0, 3).forEach((p, i) => {
        console.log(
          `[CJ DEBUG]   TFL[${i}] "${p.title}" | price=${p.price?.amount} ` +
            `sale=${p.salePrice?.amount} avail=${p.availability}`
        );
      });
    } catch (e) {
      console.error(`[CJ DEBUG] probe "${term}" failed: ${e.message}`);
    }
  }
  console.log('[CJ DEBUG] ===== end Tech For Less broad probe =====');
}

export async function fetchCJOffers(gpu) {
  const { token, companyId, advertiserIds } = config.cj;
  if (!token || !companyId) return [];

  // TEMP DEBUG: one-time broad probe to diagnose empty Tech For Less results.
  if (DEBUG && !probeDone) {
    probeDone = true;
    await debugBroadProbe({ token, companyId });
  }

  let results;
  try {
    results = await runCJQuery({
      token,
      companyId,
      keywords: gpu.keywords.slice(0, 3),
      advertiserIds,
      label: `gpu:${gpu.id}`,
    });
  } catch (err) {
    // Timeout or any CJ failure → return no offers rather than hang/throw.
    console.error(`[GPUSniff] CJ query failed for ${gpu.id}: ${err.message}`);
    return [];
  }

  // Keep only the cheapest offer per retailer.
  const cheapestByRetailer = new Map();

  for (const item of results) {
    const retailer = retailerForAdvertiser(item);
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

  const offers = [...cheapestByRetailer.values()];
  if (DEBUG) {
    console.log(
      `[CJ DEBUG] (gpu:${gpu.id}) mapped ${offers.length} offer(s): ` +
        `${offers.map((o) => `${o.retailer}=$${o.price}`).join(', ') || '(none)'}`
    );
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
