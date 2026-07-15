import 'dotenv/config';

function list(value) {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

// The production landing page is always allowed. Extra origins can be
// added via CORS_ORIGIN (comma-separated); ALLOWED_ORIGINS is kept as a
// legacy alias. chrome-extension:// / moz-extension:// are allowed in
// index.js regardless of this list.
const DEFAULT_ORIGINS = ['https://gpusniff.com', 'https://www.gpusniff.com'];

export const config = {
  // Railway (and most PaaS) inject PORT; default to 3000 locally.
  port: Number(process.env.PORT) || 3000,
  allowedOrigins: [
    ...new Set([
      ...DEFAULT_ORIGINS,
      ...list(process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS),
    ]),
  ],
  priceCacheTtlSeconds: Number(process.env.PRICE_CACHE_TTL_SECONDS) || 900,

  bestbuy: {
    apiKey: process.env.BESTBUY_API_KEY || '',
  },
  cj: {
    token: process.env.CJ_PERSONAL_ACCESS_TOKEN || '',
    companyId: process.env.CJ_COMPANY_ID || '',
    advertiserIds: list(process.env.CJ_ADVERTISER_IDS),
  },
  ebay: {
    token: process.env.EBAY_OAUTH_TOKEN || '',
    clientId: process.env.EBAY_CLIENT_ID || '',
    clientSecret: process.env.EBAY_CLIENT_SECRET || '',
    campaignId: process.env.EBAY_CAMPAIGN_ID || '',
    env: (process.env.EBAY_ENV || 'PRODUCTION').toUpperCase(),
  },
  impact: {
    accountSid: process.env.IMPACT_ACCOUNT_SID || '',
    authToken: process.env.IMPACT_AUTH_TOKEN || '',
    walmartCampaignId: process.env.IMPACT_WALMART_CAMPAIGN_ID || '',
  },
  rakuten: {
    token: process.env.RAKUTEN_TOKEN || '',
    sid: process.env.RAKUTEN_SID || '',
    neweggMid: process.env.RAKUTEN_NEWEGG_MID || '',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
};

/**
 * Per-provider "is this configured well enough to return real data?"
 * predicates. Each mirrors the guard inside the provider module, so a
 * provider is only ever queried when it can actually authenticate.
 */
export const providerStatus = {
  bestbuy: () => Boolean(config.bestbuy.apiKey),
  cj: () => Boolean(config.cj.token && config.cj.companyId),
  ebay: () =>
    Boolean(config.ebay.token || (config.ebay.clientId && config.ebay.clientSecret)),
  walmart: () => Boolean(config.impact.accountSid && config.impact.authToken),
  rakuten: () =>
    Boolean(config.rakuten.token && config.rakuten.sid && config.rakuten.neweggMid),
};

/** True when at least one real affiliate provider is configured. */
export function hasAnyProvider() {
  return Object.values(providerStatus).some((isConfigured) => isConfigured());
}
