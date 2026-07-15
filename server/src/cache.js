/**
 * Tiny in-memory TTL cache. Good enough for a single-instance
 * aggregator; swap for Redis if you scale horizontally.
 */
class TTLCache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlSeconds) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /** Return cached value if fresh, otherwise run loader() and cache it. */
  async wrap(key, ttlSeconds, loader) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await loader();
    this.set(key, value, ttlSeconds);
    return value;
  }
}

export const cache = new TTLCache();
