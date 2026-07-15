/**
 * Provider orchestration: fan out to every configured affiliate
 * provider in parallel and collect their offers. Providers that aren't
 * configured return [] cheaply; providers that throw are isolated so one
 * failing network doesn't take down the whole response.
 */
import { fetchBestBuyOffers } from './bestbuy.js';
import { fetchCJOffers } from './cj.js';
import { fetchEbayOffers } from './ebay.js';
import { fetchWalmartOffers } from './walmart.js';

const PROVIDERS = [
  { name: 'bestbuy', run: fetchBestBuyOffers },
  { name: 'cj', run: fetchCJOffers },
  { name: 'ebay', run: fetchEbayOffers },
  { name: 'walmart', run: fetchWalmartOffers },
];

/**
 * @returns {Promise<{ offers: object[], errors: {provider: string, message: string}[] }>}
 */
export async function fetchAllRealOffers(gpu) {
  const settled = await Promise.allSettled(PROVIDERS.map((p) => p.run(gpu)));

  const offers = [];
  const errors = [];
  settled.forEach((result, i) => {
    const providerName = PROVIDERS[i].name;
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
