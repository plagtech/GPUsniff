/**
 * Rakuten Advertising (LinkShare) — Product Search API.
 * Docs: https://developers.rakutenadvertising.com/ (Product Search 1.0)
 *
 * Fetches GPU products from Newegg (merchant id 44583) via Rakuten's
 * affiliate product feed. The request is filtered to that merchant, so
 * every result maps to the `newegg` retailer.
 *
 * Auth (two-step): the web-services token + security token are exchanged
 * at /token for a short-lived OAuth2 access token, which is then sent as
 * `Authorization: Bearer <access_token>` on the Product Search request.
 * Response is XML.
 *
 * TEMP: the exact /token credential format isn't pinned down yet, so
 * getAccessToken() tries several documented permutations in order and uses
 * the first that returns an access_token (each attempt is logged so we can
 * see the winner in Railway). Once known, collapse to the single format.
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
  if (!token || !securityToken || !sid || !neweggMid) {
    // TEMP DEBUG
    console.log(
      '[Rakuten DEBUG] skipped — credentials not configured ' +
        '(need RAKUTEN_TOKEN, RAKUTEN_SECURITY_TOKEN, RAKUTEN_SID, RAKUTEN_NEWEGG_MID)'
    );
    return [];
  }

  // Step 1: exchange the web-services + security tokens for a short-lived
  // OAuth2 access token (HTTP Basic + client_credentials).
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
  const requestUrl = `${ENDPOINT}?${params.toString()}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/xml',
  };

  // TEMP DEBUG
  console.log(`[Rakuten DEBUG] querying keyword: ${gpu.name}, mid: ${neweggMid}`);
  console.log('[Rakuten DEBUG] Authorization header present:', !!headers.Authorization);
  console.log(`[Rakuten DEBUG] access token: Bearer ${redact(accessToken)}`);
  console.log(`[Rakuten DEBUG] request URL: ${requestUrl}`);

  // Hard 10s cap on the whole request (connect + body read) via
  // AbortController, mirroring the CJ provider.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RAKUTEN_TIMEOUT_MS);
  let res;
  let rawBody;
  try {
    res = await fetch(requestUrl, {
      headers,
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

  // TEMP DEBUG — log status + body BEFORE any error handling so we can
  // see exactly what Rakuten returns, even on non-200 responses. If
  // `redirected` is true and the final URL is a different host, a
  // cross-origin redirect stripped our Authorization header (undici does
  // this by spec) — that alone explains "access token is missing".
  console.log(
    `[Rakuten DEBUG] HTTP status: ${res.status} | final URL: ${redactTokenInUrl(res.url)} | redirected: ${res.redirected}`
  );
  console.log(`[Rakuten DEBUG] raw response (first 500 chars): ${rawBody.slice(0, 500)}`);

  if (!res.ok) {
    console.error(`[GPUSniff] Rakuten API ${res.status} for ${gpu.id}: ${rawBody.slice(0, 200)}`);
    return [];
  }

  const items = parseItems(rawBody);
  // TEMP DEBUG
  console.log(`[Rakuten DEBUG] parsed items count: ${items.length}`);

  const offers = [];
  for (const item of items) {
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

  if (!offers.length) return [];

  // Return the single cheapest Newegg offer (the aggregator keeps the
  // cheapest per retailer anyway, but this keeps the payload tight).
  offers.sort((a, b) => a.price - b.price);
  return [offers[0]];
}

// ── OAuth2 token exchange ───────────────────────────────────────────────
const b64 = (s) => Buffer.from(s).toString('base64');

// TEMP: candidate /token credential formats, tried in order until one
// returns an access_token. `t` = web-services token, `s` = security token,
// `sid` = site id. The base64 credential values are NOT logged (only the
// label describing the format), so no secret leaks.
function tokenPermutations(t, s, sid) {
  return [
    // Rakuten docs: "Bearer <base64(clientId:clientSecret)>", scope = SID.
    { label: '1. bearer-b64(token:security) scope=SID', header: `Bearer ${b64(`${t}:${s}`)}`, body: { grant_type: 'client_credentials', scope: sid } },
    { label: '2. bearer-b64(security:token) scope=SID', header: `Bearer ${b64(`${s}:${t}`)}`, body: { grant_type: 'client_credentials', scope: sid } },
    // Swapped Basic order, scope=Production.
    { label: '3. basic(security:token) scope=Production', header: `Basic ${b64(`${s}:${t}`)}`, body: { grant_type: 'client_credentials', scope: 'Production' } },
    // Basic, no scope.
    { label: '4. basic(token:security) no-scope', header: `Basic ${b64(`${t}:${s}`)}`, body: { grant_type: 'client_credentials' } },
    // Basic, scope=SID.
    { label: '5. basic(token:security) scope=SID', header: `Basic ${b64(`${t}:${s}`)}`, body: { grant_type: 'client_credentials', scope: sid } },
    // Credentials in the POST body, no auth header.
    { label: '6. body-creds client_id/client_secret (no header)', header: null, body: { grant_type: 'client_credentials', client_id: t, client_secret: s } },
    // Some Rakuten accounts hand you a PRE-ENCODED base64 credential — use
    // the token value directly after Bearer/Basic (don't re-encode it).
    { label: '7. bearer RAKUTEN_TOKEN raw (pre-encoded) scope=SID', header: `Bearer ${t}`, body: { grant_type: 'client_credentials', scope: sid } },
    { label: '8. bearer RAKUTEN_SECURITY_TOKEN raw (pre-encoded) scope=SID', header: `Bearer ${s}`, body: { grant_type: 'client_credentials', scope: sid } },
    { label: '9. basic RAKUTEN_TOKEN raw (pre-encoded) scope=SID', header: `Basic ${t}`, body: { grant_type: 'client_credentials', scope: sid } },
  ];
}

// POST one permutation to /token; returns { status, raw }. 10s timeout.
async function postToken(perm) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (perm.header) headers.Authorization = perm.header;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RAKUTEN_TIMEOUT_MS);
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers,
      body: new URLSearchParams(perm.body),
      signal: controller.signal,
    });
    return { status: res.status, raw: await res.text() };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`timeout after ${RAKUTEN_TIMEOUT_MS / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Try each permutation in order; cache + return the first access token.
async function getAccessToken(webServicesToken, securityToken, sid) {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) {
    console.log('[Rakuten DEBUG] using cached access token'); // TEMP DEBUG
    return tokenCache.value;
  }

  let lastError = 'none';
  for (const perm of tokenPermutations(webServicesToken, securityToken, sid)) {
    console.log(`[Rakuten DEBUG] trying token exchange permutation: ${perm.label}`); // TEMP DEBUG
    let status;
    let raw;
    try {
      ({ status, raw } = await postToken(perm));
    } catch (err) {
      lastError = `${perm.label} → ${err.message}`;
      console.log(`[Rakuten DEBUG] permutation "${perm.label}" threw: ${err.message}`); // TEMP DEBUG
      continue;
    }

    console.log(`[Rakuten DEBUG] permutation "${perm.label}" → HTTP ${status}`); // TEMP DEBUG
    if (status < 200 || status >= 300) {
      // Error bodies carry the reason (e.g. invalid_client), not a secret.
      console.log(`[Rakuten DEBUG] permutation "${perm.label}" error body: ${raw.slice(0, 200)}`); // TEMP DEBUG
      lastError = `${perm.label} → ${status}: ${raw.slice(0, 120)}`;
      continue;
    }

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      lastError = `${perm.label} → 2xx non-JSON`;
      continue;
    }
    if (!json.access_token) {
      lastError = `${perm.label} → 2xx but no access_token`;
      continue;
    }

    const ttl = Number(json.expires_in) || 3600;
    tokenCache = { value: json.access_token, expiresAt: Date.now() + (ttl - 60) * 1000 };
    console.log(`[Rakuten DEBUG] ✓ token exchange SUCCEEDED via "${perm.label}" (expires_in ${ttl})`); // TEMP DEBUG
    return json.access_token;
  }

  throw new Error(`all token-exchange permutations failed; last: ${lastError}`);
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

// TEMP DEBUG helper — show only the first/last few chars of a secret.
function redact(t) {
  if (!t) return '(empty)';
  if (t.length <= 8) return '****';
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

// TEMP DEBUG helper — mask the token value inside a request URL for logs.
function redactTokenInUrl(url) {
  return url.replace(/([?&]token=)[^&]*/i, '$1***');
}
