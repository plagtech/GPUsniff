/**
 * Rakuten Advertising (LinkShare) — Product Search API.
 * Docs: https://developers.rakutenadvertising.com/ (Product Search 1.0)
 *
 * Fetches GPU products from Newegg (merchant id 44583) via Rakuten's
 * affiliate product feed. The request is filtered to that merchant, so
 * every result maps to the `newegg` retailer.
 *
 * Auth: the account token is sent as `Authorization: Bearer <token>`.
 * Response is XML.
 *
 * Affiliate links are (re)built from the account SID as Rakuten deep
 * links so clicks are attributed to us.
 *
 * No-op ([]) unless RAKUTEN_TOKEN + RAKUTEN_SID + RAKUTEN_NEWEGG_MID
 * are all set.
 */
import { config } from '../config.js';

const ENDPOINT = 'https://api.linksynergy.com/productsearch/1.0';
const DEEPLINK_BASE = 'https://click.linksynergy.com/deeplink';
// Abort any Rakuten request that hasn't completed within this window so a
// slow/unresponsive endpoint can never hang the server.
const RAKUTEN_TIMEOUT_MS = 10_000;

export async function fetchRakutenOffers(gpu) {
  const { token, sid, neweggMid } = config.rakuten;
  if (!token || !sid || !neweggMid) {
    // TEMP DEBUG
    console.log(
      '[Rakuten DEBUG] skipped — credentials not configured ' +
        '(need RAKUTEN_TOKEN, RAKUTEN_SID, RAKUTEN_NEWEGG_MID)'
    );
    return [];
  }

  const params = new URLSearchParams({
    keyword: gpu.name, // e.g. "RTX 5070", "RX 9070 XT"
    mid: neweggMid, // 44583 = Newegg
    max: '20',
  });
  const requestUrl = `${ENDPOINT}?${params.toString()}`;

  // Trim: the env var can pick up a stray trailing newline/space when it's
  // pasted into a dashboard, which corrupts the Authorization header.
  const cleanToken = token.trim();
  const headers = {
    Authorization: `Bearer ${cleanToken}`,
    Accept: 'application/xml',
  };

  // TEMP DEBUG
  console.log(`[Rakuten DEBUG] querying keyword: ${gpu.name}, mid: ${neweggMid}`);
  console.log('[Rakuten DEBUG] Authorization header present:', !!headers.Authorization);
  console.log(`[Rakuten DEBUG] token length: ${cleanToken.length}, sent as: Bearer ${redact(cleanToken)}`);
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
    `[Rakuten DEBUG] HTTP status: ${res.status} | final URL: ${res.url} | redirected: ${res.redirected}`
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
