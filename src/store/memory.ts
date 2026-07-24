import type { Clip } from "../db/schema";

export interface MemoryClip extends Clip {
  dirty?: boolean;
}

const cache = new Map<string, MemoryClip>();
const timers = new Map<string, Timer>();

export function getCached(slug: string): MemoryClip | undefined {
  return cache.get(slug);
}

export function setCached(clip: MemoryClip) {
  cache.set(clip.slug, clip);
  scheduleExpiry(clip.slug, clip.expiresAt);
}

export function deleteCached(slug: string) {
  cache.delete(slug);
  const t = timers.get(slug);
  if (t) {
    clearTimeout(t);
    timers.delete(slug);
  }
}

/** setTimeout uses a 32-bit signed delay; longer TTLs must be chunked. */
const MAX_TIMEOUT_MS = 2_147_483_647;

function scheduleExpiry(slug: string, expiresAt: number | null) {
  const existing = timers.get(slug);
  if (existing) clearTimeout(existing);

  if (expiresAt === null) return;

  const delay = expiresAt * 1000 - Date.now();
  if (delay <= 0) {
    cache.delete(slug);
    return;
  }

  timers.set(
    slug,
    setTimeout(() => {
      timers.delete(slug);
      const cached = cache.get(slug);
      if (!cached) return;
      // Chunked wait for TTLs beyond MAX_TIMEOUT_MS; re-check real expiry.
      if (cached.expiresAt !== null && cached.expiresAt * 1000 > Date.now()) {
        scheduleExpiry(slug, cached.expiresAt);
        return;
      }
      cache.delete(slug);
    }, Math.min(delay, MAX_TIMEOUT_MS))
  );
}

export function allCachedSlugs(): string[] {
  return [...cache.keys()];
}
