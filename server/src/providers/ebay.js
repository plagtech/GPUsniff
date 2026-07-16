/**
 * eBay Browse API — item summary search.
 * Docs: https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
 *
 * Auth: an application access token (client-credentials grant). Provide
 * EBAY_OAUTH_TOKEN directly, or EBAY_CLIENT_ID + EBAY_CLIENT_SECRET and
 * this module mints and refreshes the token itself.
 *
 * No-op ([]) when neither a token nor client credentials are set.
 */
import { config } from '../config.js';

const HOSTS = {
  PRODUCTION: { api: 'https://api.ebay.com', auth: 'https://api.ebay.com/identity/v1/oauth2/token' },
  SANDBOX: { api: 'https://api.sandbox.ebay.com', auth: 'https://api.sandbox.ebay.com/identity/v1/oauth2/token' },
};

let tokenCache = { value: '', expiresAt: 0 };

async function getToken() {
  if (config.ebay.token) return config.ebay.token;
  const { clientId, clientSecret } = config.ebay;
  if (!clientId || !clientSecret) return '';

  if (tokenCache.value && Date.now() < tokenCache.expiresAt) {
    return tokenCache.value;
  }

  const hosts = HOSTS[config.ebay.env] || HOSTS.PRODUCTION;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'https://api.ebay.com/oauth/api_scope',
  });

  const res = await fetch(hosts.auth, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`eBay OAuth ${res.status}: ${await safeText(res)}`);
  }
  const json = await res.json();
  tokenCache = {
    value: json.access_token,
    // Refresh a minute early.
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return tokenCache.value;
}

export async function fetchEbayOffers(gpu) {
  const token = await getToken();
  if (!token) return [];

  const hosts = HOSTS[config.ebay.env] || HOSTS.PRODUCTION;
  const params = new URLSearchParams({
    q: gpu.name,
    // 27386 = "Computer Graphics/Video Cards"
    category_ids: '27386',
    filter: 'buyingOptions:{FIXED_PRICE},conditions:{NEW}',
    sort: 'price',
    limit: '5',
  });

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    // Ship-to US pricing.
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
  };
  if (config.ebay.campaignId) {
    headers['X-EBAY-C-ENDUSERCTX'] = `affiliateCampaignId=${config.ebay.campaignId}`;
  }

  const res = await fetch(`${hosts.api}/buy/browse/v1/item_summary/search?${params.toString()}`, {
    headers,
  });
  if (!res.ok) {
    throw new Error(`eBay Browse ${res.status}: ${await safeText(res)}`);
  }
  const data = await res.json();
  const items = Array.isArray(data.itemSummaries) ? data.itemSummaries : [];
  if (!items.length) return [];

  // Return all candidates; the aggregator sanity-filters and keeps the
  // cheapest plausible card per retailer.
  return items
    .map((item) => {
      const price = num(item.price?.value);
      if (price == null) return null;
      return {
        retailer: 'ebay',
        price,
        title: item.title || null,
        originalPrice: num(item.marketingPrice?.originalPrice?.value),
        inStock: true, // Browse only returns buyable listings
        // itemAffiliateWebUrl is present when a campaign id is configured.
        url: item.itemAffiliateWebUrl || item.itemWebUrl,
        shipping: formatShipping(item.shippingOptions?.[0]?.shippingCost),
        source: 'ebay-browse',
      };
    })
    .filter(Boolean);
}

function formatShipping(cost) {
  if (!cost) return null;
  const v = num(cost.value);
  if (v == null) return null;
  return v === 0 ? 'Free' : `$${v.toFixed(2)}`;
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
