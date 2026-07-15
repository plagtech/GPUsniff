/**
 * Supabase persistence: price-history snapshots + the launch waitlist.
 *
 * All functions degrade gracefully when Supabase isn't configured:
 * writes become no-ops and reads return empty, so the API still runs
 * locally with zero setup.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

let client = null;
if (config.supabase.url && config.supabase.serviceRoleKey) {
  client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  });
  console.log('[GPUSniff] Supabase connected.');
} else {
  console.warn('[GPUSniff] Supabase not configured — history/waitlist are in-memory no-ops.');
}

export function supabaseReady() {
  return Boolean(client);
}

/**
 * Insert one row per retailer offer into price_snapshots.
 * @param {string} gpuId
 * @param {object[]} prices decorated real price rows
 * @param {string} capturedAt ISO timestamp
 */
export async function recordSnapshots(gpuId, prices, capturedAt) {
  if (!client || !prices.length) return;
  const rows = prices.map((p) => ({
    gpu_id: gpuId,
    retailer: p.retailer,
    price: p.price,
    original_price: p.originalPrice,
    in_stock: p.inStock,
    source: p.source,
    captured_at: capturedAt,
  }));
  const { error } = await client.from('price_snapshots').insert(rows);
  if (error) throw new Error(error.message);
}

/**
 * Return price history for a GPU over the last `days` days.
 * Shape: [{ retailer, price, in_stock, captured_at }]
 */
export async function getHistory(gpuId, days = 30) {
  if (!client) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from('price_snapshots')
    .select('retailer, price, original_price, in_stock, captured_at')
    .eq('gpu_id', gpuId)
    .gte('captured_at', since)
    .order('captured_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Add an email to the waitlist. Idempotent on email (upsert), so a
 * double submit doesn't error. Returns { created: boolean }.
 */
export async function addToWaitlist(email, meta = {}) {
  if (!client) {
    // No datastore configured: accept but warn, so the landing page UX
    // still works in local/dev environments.
    console.warn(`[GPUSniff] Waitlist signup (not persisted): ${email}`);
    return { created: true, persisted: false };
  }
  const { error } = await client
    .from('waitlist')
    .upsert(
      {
        email,
        source: meta.source || 'landing',
        user_agent: meta.userAgent || null,
        referrer: meta.referrer || null,
      },
      { onConflict: 'email', ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);
  return { created: true, persisted: true };
}
