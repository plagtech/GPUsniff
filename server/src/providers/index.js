/**
 * Provider orchestration: fan out to the affiliate providers that have
 * valid credentials configured, in parallel, and collect their offers.
 *
 * Only configured providers are queried — an unconfigured provider is
 * never called, so it can never contribute placeholder data. Providers
 * that throw are isolated so one failing network doesn't take down the
 * whole response.
 */
import { providerStatus } from '../config.js';
import { fetchBestBuyOffers } from './bestbuy.js';
import { fetchCJOffers } from './cj.js';
import { fetchEbayOffers } from './ebay.js';
import { fetchWalmartOffers } from './walmart.js';
import { fetchRakutenOffers } from './rakuten.js';

const PROVIDERS = [
  { name: 'bestbuy', run: fetchBestBuyOffers, isConfigured: providerStatus.bestbuy },
  { name: 'cj', run: fetchCJOffers, isConfigured: providerStatus.cj },
  { name: 'ebay', run: fetchEbayOffers, isConfigured: providerStatus.ebay },
  { name: 'walmart', run: fetchWalmartOffers, isConfigured: providerStatus.walmart },
  { name: 'rakuten', run: fetchRakutenOffers, isConfigured: providerStatus.rakuten },
];

/**
 * @returns {Promise<{ offers: object[], errors: {provider: string, message: string}[] }>}
 */
export async function fetchAllRealOffers(gpu) {
  const active = PROVIDERS.filter((p) => p.isConfigured());
  const settled = await Promise.allSettled(active.map((p) => p.run(gpu)));

  const offers = [];
  const errors = [];
  settled.forEach((result, i) => {
    const providerName = active[i].name;
    if (result.status === 'fulfilled') {
      offers.push(...result.value);
    } else {
      const message = result.reason?.message || String(result.reason);
      console.error(`[GPUSniff] provider "${providerName}" failed: ${message}`);
      errors.push({ provider: providerName, message });
    }
  });

  return { offers, errors };
}
