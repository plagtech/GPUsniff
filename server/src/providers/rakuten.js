/**
 * Rakuten Advertising (LinkShare) — Product Search API.
 * Docs: https://developers.rakutenadvertising.com/ (Product Search 1.0)
 *
 * Fetches GPU products from Newegg (merchant id 44583) via Rakuten's
 * affiliate product feed. The request is filtered to that merchant, so
 * every result maps to the `newegg` retailer.
 *
 * Auth (two-step): the web-services token + security token are exchanged
 * at /token — Authorization: Bearer base64(RAKUTEN_TOKEN:RAKUTEN_SECURITY_TOKEN)
 * (yes, "Bearer" with a base64 blob) and body
 * grant_type=client_credentials&scope=<RAKUTEN_SID> — for a short-lived
 * access token, which is then sent as `Authorization: Bearer <access_token>`
 * on the Product Search request. Response is XML.
 *
 * Affiliate links are (re)built from the account SID as Rakuten deep
 * links so clicks are attributed to us.
 *
 * No-op ([]) unless RAKUTEN_TOKEN + RAKUTEN_SECURITY_TOKEN + RAKUTEN_SID
 * + RAKUTEN_NEWEGG_MID are all set.
 */
import { config } from '../config.js';

const ENDPOINT = 'https://api.linksynergy.com/productsearch/1.0';
const TOKEN_ENDPOINT = 'https://api.linksynergy.com/token';
const DEEPLINK_BASE = 'https://click.linksynergy.com/deeplink';
// Abort any Rakuten request that hasn't completed within this window so a
// slow/unresponsive endpoint can never hang the server.
const RAKUTEN_TIMEOUT_MS = 10_000;

// Cached OAuth2 access token minted from the web-services + security tokens.
let tokenCache = { value: '', expiresAt: 0 };

export async function fetchRakutenOffers(gpu) {
  const { token, securityToken, sid, neweggMid } = config.rakuten;
  if (!token || !securityToken || !sid || !neweggMid) return [];

  // Step 1: exchange the web-services + security tokens for an access token.
  let accessToken;
  try {
    accessToken = await getAccessToken(token.trim(), securityToken.trim(), sid.trim());
  } catch (err) {
    console.error(`[GPUSniff] Rakuten token exchange failed for ${gpu.id}: ${err.message}`);
    return [];
  }

  // Step 2: query Product Search with the access token as Bearer.
  const params = new URLSearchParams({
    keyword: gpu.name, // e.g. "RTX 5070", "RX 9070 XT"
    mid: neweggMid, // 44583 = Newegg
    max: '20',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RAKUTEN_TIMEOUT_MS);
  let res;
  let rawBody;
  try {
    res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/xml',
      },
      signal: controller.signal,
    });
    rawBody = await res.text();
  } catch (err) {
    const reason =
      err.name === 'AbortError' ? `timeout after ${RAKUTEN_TIMEOUT_MS / 1000}s` : err.message;
    console.error(`[GPUSniff] Rakuten query failed for ${gpu.id}: ${reason}`);
    return [];
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    console.error(`[GPUSniff] Rakuten API ${res.status} for ${gpu.id}: ${rawBody.slice(0, 200)}`);
    return [];
  }

  const offers = [];
  for (const item of parseItems(rawBody)) {
    // Defensive: the `mid` filter should already scope to Newegg, but skip
    // anything that reports a different merchant just in case.
    if (item.mid && String(item.mid) !== String(neweggMid)) continue;

    const regular = num(item.price);
    let sale = num(item.saleprice);
    if (sale != null && sale <= 0) sale = null; // Rakuten sends 0.00 / equal price when there's no sale
    const hasSale = sale != null && regular != null && sale < regular;
    const price = hasSale ? sale : regular ?? sale;
    if (price == null) continue;

    offers.push({
      retailer: 'newegg',
      price,
      originalPrice: hasSale ? regular : null,
      inStock: isAvailable(item),
      url: buildAffiliateUrl(item.linkurl, sid, neweggMid),
      shipping: null,
      source: 'rakuten-linkshare',
      title: item.productname || null,
    });
  }

  // Return all Newegg candidates; the aggregator sanity-filters out feed
  // junk and keeps the cheapest plausible card per retailer.
  return offers;
}

// ── OAuth2 token exchange ───────────────────────────────────────────────
// Rakuten's /token wants "Authorization: Bearer <base64(token:securityToken)>"
// and scope = the site id. Cached until shortly before it expires.
async function getAccessToken(webServicesToken, securityToken, sid) {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) {
    return tokenCache.value;
  }

  const credentials = Buffer.from(`${webServicesToken}:${securityToken}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'client_credentials', scope: sid });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RAKUTEN_TIMEOUT_MS);
  let res;
  let raw;
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: controller.signal,
    });
    raw = await res.text();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`token endpoint timeout after ${RAKUTEN_TIMEOUT_MS / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${raw.slice(0, 200)}`);

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('token endpoint returned non-JSON');
  }
  if (!json.access_token) throw new Error('no access_token in token response');

  const ttl = Number(json.expires_in) || 3600;
  // Refresh a minute early.
  tokenCache = { value: json.access_token, expiresAt: Date.now() + (ttl - 60) * 1000 };
  return json.access_token;
}

// ── Affiliate links ─────────────────────────────────────────────────────
// Rebuild the product's destination as a Rakuten deep link attributed to
// our SID: click.linksynergy.com/deeplink?id=<SID>&mid=<MID>&murl=<dest>.
function buildAffiliateUrl(linkurl, sid, mid) {
  const dest = extractMurl(linkurl) || linkurl;
  if (!dest) return '';
  return `${DEEPLINK_BASE}?id=${encodeURIComponent(sid)}&mid=${encodeURIComponent(mid)}&murl=${encodeURIComponent(dest)}`;
}

// The feed's linkurl is already a tracking link wrapping the real Newegg
// URL in a `murl` param; pull that destination back out so we can re-wrap
// it with our own SID.
function extractMurl(linkurl) {
  if (!linkurl) return null;
  const m = linkurl.match(/[?&]murl=([^&]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

// ── Availability ────────────────────────────────────────────────────────
// Product Search doesn't always include stock; treat listed items as
// buyable unless an explicit out-of-stock flag says otherwise.
function isAvailable(item) {
  const raw = (item.instock ?? item.availability ?? '').toString().toLowerCase();
  if (!raw) return true;
  if (raw === 'no' || raw === 'false' || raw.includes('out')) return false;
  return true;
}

// ── Minimal XML extraction (Product Search 1.0 returns XML) ─────────────
// The feed is well-structured <item>…</item> blocks; we pull only the few
// fields we need without adding an XML-parser dependency.
function parseItems(xml) {
  const items = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    items.push({
      mid: xmlTag(block, 'mid'),
      productname: xmlTag(block, 'productname'),
      price: xmlTag(block, 'price'),
      saleprice: xmlTag(block, 'saleprice'),
      linkurl: xmlTag(block, 'linkurl'),
      instock: xmlTag(block, 'instock'),
      availability: xmlTag(block, 'availability'),
    });
  }
  return items;
}

function xmlTag(block, name) {
  const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1].trim()) : null;
}

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'");
}

function num(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}
