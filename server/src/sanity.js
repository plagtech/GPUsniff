/**
 * Sanity filtering for affiliate offers.
 *
 * Keyword-based product feeds happily return accessories (brackets,
 * cables, waterblocks) and laptops that match GPU model names. This
 * module rejects those so only plausible, actual graphics cards survive
 * into the price/deals pipeline.
 *
 * Three checks (an offer must pass all that apply):
 *  1. Price floor — below a per-GPU minimum ⇒ almost certainly not a card.
 *  2. Accessory titles — reject brackets/cables/etc. and laptops.
 *  3. Card signature — the title must resolve to THIS exact GPU model AND
 *     name a maker / board partner (GeForce, Radeon, MSI, ASUS, …).
 *
 * Title checks only run when the offer carries a title; offers without one
 * (some providers omit it) are judged on the price floor alone.
 */
import { identifyGPU } from './gpuDatabase.js';

// Explicit minimum plausible price for the featured GPUs. Anything else
// falls back to 60% of MSRP.
const PRICE_FLOORS = {
  'rtx-5090': 1500,
  'rtx-5080': 800,
  'rtx-5070-ti': 600,
  'rtx-5070': 450,
  'rtx-5060-ti': 300,
  'rx-9070-xt': 500,
};

export function priceFloorFor(gpu) {
  return PRICE_FLOORS[gpu.id] ?? Math.round(gpu.msrp * 0.6);
}

// Accessory / non-card terms. Matched as whole words so "showcase" won't
// trip "case" and "outstanding" won't trip "stand".
const ACCESSORY_RE =
  /\b(bracket|cable|riser|fan|waterblock|water block|backplate|holder|stand|mount|sticker|case|laptop|notebook|cooler|shroud|screw|adapter|extension)\b/i;

// Maker / board-partner signals — a real card names one of these.
const MAKER_SIGNALS = [
  'geforce', 'radeon', 'arc', 'nvidia', 'amd', 'intel',
  'msi', 'asus', 'rog', 'tuf', 'gigabyte', 'aorus', 'zotac', 'pny',
  'sapphire', 'xfx', 'evga', 'asrock', 'inno3d', 'gainward', 'palit',
  'powercolor', 'colorful', 'manli', 'gunnir', 'acer', 'yeston',
];

/**
 * @returns {boolean} true if the offer is a plausible real graphics card.
 */
export function isPlausibleOffer(gpu, offer) {
  if (offer.price == null || offer.price < priceFloorFor(gpu)) return false;

  const title = offer.title;
  if (title) {
    const t = String(title).toLowerCase();
    if (ACCESSORY_RE.test(t)) return false;
    // The most specific GPU the title names must be THIS one (so an
    // "RTX 5070 Ti" listing can't pass as an "RTX 5070", etc.).
    if (identifyGPU(title)?.id !== gpu.id) return false;
    if (!MAKER_SIGNALS.some((m) => t.includes(m))) return false;
  }

  return true;
}
