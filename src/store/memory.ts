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
      cache.delete(slug);
      timers.delete(slug);
    }, delay)
  );
}

export function allCachedSlugs(): string[] {
  return [...cache.keys()];
}
