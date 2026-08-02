import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string[] | null = null;

/**
 * Marketing / website path segments that must not be usable as clip or team slugs.
 * Loaded from the website build output or website-owned list so SEO landings stay
 * reserved after the website moves to its own repo (drop in the same JSON).
 *
 * Override path with `MARKETING_RESERVED_PATHS` (absolute or cwd-relative file).
 */
export function loadMarketingReservedPaths(): string[] {
  if (cached) return cached;

  const envPath = process.env.MARKETING_RESERVED_PATHS?.trim();
  const candidates = [
    ...(envPath ? [envPath] : []),
    join(process.cwd(), "dist", "pages", "reserved-paths.json"),
    join(process.cwd(), "website", "reserved-paths.json"),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
      if (!Array.isArray(raw)) continue;
      cached = raw.filter((s): s is string => typeof s === "string" && s.length > 0);
      return cached;
    } catch {
      /* try next */
    }
  }

  cached = [];
  return cached;
}

/** Test helper — clear cache after writing a new reserved-paths file. */
export function clearMarketingReservedPathsCache(): void {
  cached = null;
}
