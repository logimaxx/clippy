import { z } from "zod";
import { isAdminPathSegment } from "./admin";

export const TTL_OPTIONS = [
  { value: 900, label: "15 min" },
  { value: 3600, label: "1 hour" },
  { value: 86400, label: "24 hours" },
  { value: 604800, label: "7 days" },
  { value: 2592000, label: "30 days" },
  { value: 7776000, label: "90 days" },
  { value: 31536000, label: "1 year" },
] as const;

export const EXPIRES_BURN = "burn" as const;
export const EXPIRES_CUSTOM = "custom" as const;

/** Max timed TTL / custom expiry horizon (1 year). */
export const MAX_TTL = 31536000;

/** Single Expires control: timed TTL (default 15 min), custom datetime, or burn-after-read last */
export const EXPIRES_OPTIONS = [
  ...TTL_OPTIONS,
  { value: EXPIRES_CUSTOM, label: "Custom…" },
  { value: EXPIRES_BURN, label: "Burn after read" },
] as const;

export type ExpiresOptionValue = (typeof EXPIRES_OPTIONS)[number]["value"];

export const DEFAULT_TTL = 900;

/**
 * Safety-net lifetime for burn-after-read clips that are never viewed.
 * Burn still deletes on first real read; this only caps abandoned clips.
 */
export const BURN_MAX_TTL = 604800; // 7 days

export const MAX_FILES_PER_CLIP = 10;

/** Per-file upload cap (env `MAX_FILE_SIZE_MB`, default 10). */
export const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB ?? 10);
/** Total attachments per clip (env `MAX_TOTAL_FILES_MB`, default 50). */
export const MAX_TOTAL_FILES_MB = Number(process.env.MAX_TOTAL_FILES_MB ?? 50);
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_TOTAL_FILES_SIZE = MAX_TOTAL_FILES_MB * 1024 * 1024;

/**
 * Max stored clip text length (characters), including workspace JSON for tabs.
 * Applies to the full `clips.content` blob, not per-tab body alone.
 */
export const MAX_CONTENT_LENGTH = 1_000_000;

/** Short copy for upload UI (drop zones, docs). */
export function fileLimitsSummary(): string {
  return `Max ${MAX_FILES_PER_CLIP} files · ${MAX_FILE_SIZE_MB} MB each · ${MAX_TOTAL_FILES_MB} MB total`;
}

/** User-facing message when clip text exceeds {@link MAX_CONTENT_LENGTH}. */
export function contentTooLargeMessage(): string {
  return `Content too large (max ${MAX_CONTENT_LENGTH.toLocaleString()} characters)`;
}

export function formatExpiresAt(expiresAt: number): string {
  return new Date(expiresAt * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function expiresModeFromClip(burnOnRead: boolean, expiresAt: number | null): string {
  if (burnOnRead) return EXPIRES_BURN;
  if (expiresAt === null) return String(DEFAULT_TTL);
  const now = Math.floor(Date.now() / 1000);
  const remaining = expiresAt - now;
  const match = TTL_OPTIONS.find((o) => Math.abs(remaining - o.value) < 60);
  return match ? String(match.value) : EXPIRES_CUSTOM;
}

export function clipFromExpiresMode(
  value: string,
  now: number
): { burnOnRead: boolean; expiresAt: number | null; maxViews: number | null } {
  if (value === EXPIRES_BURN) {
    return { burnOnRead: true, expiresAt: now + BURN_MAX_TTL, maxViews: null };
  }
  if (value === EXPIRES_CUSTOM) {
    return { burnOnRead: false, expiresAt: now + DEFAULT_TTL, maxViews: null };
  }
  const ttl = Number(value);
  if (Number.isInteger(ttl) && ttl > 0 && ttl <= MAX_TTL) {
    return { burnOnRead: false, expiresAt: now + ttl, maxViews: null };
  }
  return { burnOnRead: false, expiresAt: now + DEFAULT_TTL, maxViews: null };
}

/** Cap burn-after-read clips so abandoned ones still auto-delete. */
export function applyBurnExpiryCap(
  burnOnRead: boolean,
  expiresAt: number | null | undefined,
  now: number
): number | null {
  if (!burnOnRead) return expiresAt ?? null;
  const cap = now + BURN_MAX_TTL;
  if (expiresAt == null || expiresAt > cap) return cap;
  return expiresAt;
}

/** @deprecated Advanced read limits — not shown in main UI */
export const READ_ACCESS_OPTIONS = [
  { value: "unlimited", label: "Unlimited reads" },
  { value: "1", label: "Burn after read" },
  { value: "3", label: "Delete after 3 API reads" },
  { value: "10", label: "Delete after 10 API reads" },
] as const;

export type ReadAccessValue = (typeof READ_ACCESS_OPTIONS)[number]["value"];

export const VIEW_LIMIT_OPTIONS = [
  { value: 0, label: "Unlimited" },
  { value: 1, label: "1 read" },
  { value: 3, label: "3 reads" },
  { value: 10, label: "10 reads" },
] as const;

export function readAccessFromClip(
  burnOnRead: boolean,
  maxViews: number | null
): ReadAccessValue {
  if (burnOnRead) return "1";
  if (maxViews === null || maxViews === 0) return "unlimited";
  const asString = String(maxViews);
  if (READ_ACCESS_OPTIONS.some((o) => o.value === asString)) {
    return asString as ReadAccessValue;
  }
  return "unlimited";
}

export function clipFromReadAccess(value: string): {
  burnOnRead: boolean;
  maxViews: number | null;
} {
  if (value === "unlimited") return { burnOnRead: false, maxViews: null };
  if (value === "1") return { burnOnRead: true, maxViews: null };
  const n = Number(value);
  if (Number.isInteger(n) && n > 0) return { burnOnRead: false, maxViews: n };
  return { burnOnRead: false, maxViews: null };
}

export const CLIP_VISIBILITY = ["private", "public"] as const;
export type ClipVisibilitySetting = (typeof CLIP_VISIBILITY)[number];

export const clipSettingsSchema = z.object({
  ttl: z
    .union([z.literal(EXPIRES_BURN), z.coerce.number().int().positive().max(MAX_TTL)])
    .optional(),
  /** Absolute unix expiry from the custom datetime modal. */
  expiresAt: z.coerce.number().int().positive().optional(),
  burn: z
    .union([z.literal("on"), z.literal("off"), z.literal("true"), z.literal("1"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true" || v === "1"),
  language: z.string().max(32).optional(),
  readAccess: z.enum(["unlimited", "1", "3", "10"]).optional(),
  maxViews: z.coerce.number().int().min(0).max(1000).optional(),
  pin: z.string().max(128).optional(),
  clearPin: z
    .union([z.literal("on"), z.literal("true"), z.literal("1"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true" || v === "1"),
  ownerPassword: z.string().max(128).optional(),
  clearOwnerPassword: z
    .union([z.literal("on"), z.literal("true"), z.literal("1"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true" || v === "1"),
  webhook: z.string().max(2048).optional(),
  /** Protect mode: none clears E2E; passphrase enables client-side E2E (requires e2e fields). */
  protect: z.enum(["none", "passphrase", "e2e"]).optional(),
  e2eSalt: z.string().max(128).optional(),
  e2eWrappedKey: z.string().max(512).optional(),
  e2eKdf: z.string().max(256).optional(),
  /** Ciphertext (or plaintext when clearing protect) saved with settings. */
  content: z.string().max(MAX_CONTENT_LENGTH).optional(),
  encrypted: z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return undefined;
    const values = Array.isArray(v) ? v : [v];
    return values.includes("on") || values.includes(true) || values.includes("true") || values.includes("1");
  }, z.boolean().optional()),
  visibility: z
    .preprocess((v) => {
      if (v === undefined || v === null || v === "") return undefined;
      const values = Array.isArray(v) ? v : [v];
      if (values.includes("public") || values.includes("on") || values.includes(true)) {
        return "public";
      }
      return "private";
    }, z.enum(["private", "public"]).optional()),
});

export function settingsToastMessage(
  body: Record<string, unknown>,
  parsed: z.infer<typeof clipSettingsSchema>,
  clip: { webhookUrl: string | null; encrypted: boolean; visibility: string; pinHash?: string | null },
  opts: { wasPublic?: boolean } = {}
): string {
  const demotedFromKlipwall =
    opts.wasPublic && clip.visibility !== "public";

  if (parsed.visibility !== undefined) {
    return parsed.visibility === "public"
      ? "Published on Klipwall"
      : "Unpublished from Klipwall";
  }
  if (parsed.expiresAt !== undefined) {
    return `Expires ${formatExpiresAt(parsed.expiresAt)}`;
  }
  if (parsed.ttl !== undefined) {
    if (parsed.ttl === EXPIRES_BURN) {
      return demotedFromKlipwall
        ? "Burn after read enabled - removed from Klipwall"
        : "Burn after read enabled";
    }
    const opt = TTL_OPTIONS.find((o) => o.value === parsed.ttl);
    return opt ? `Expires in ${opt.label}` : "Expiry updated";
  }
  if (parsed.language !== undefined) {
    if (!parsed.language) return "Syntax: plain text";
    const label =
      parsed.language.charAt(0).toUpperCase() + parsed.language.slice(1);
    return `Syntax: ${label}`;
  }
  if (parsed.protect === "none") return "Protection removed";
  if (parsed.protect === "passphrase" || parsed.protect === "e2e") {
    return demotedFromKlipwall
      ? "Passphrase E2E enabled - removed from Klipwall"
      : "Passphrase end-to-end encryption enabled";
  }
  if (parsed.clearPin) return "PIN removed";
  if (parsed.pin && parsed.pin.length > 0) {
    return demotedFromKlipwall
      ? "PIN saved - removed from Klipwall"
      : "PIN saved";
  }
  if (parsed.clearOwnerPassword) return "Owner password removed";
  if (parsed.ownerPassword && parsed.ownerPassword.length > 0) {
    return "Owner password saved";
  }
  if (parsed.webhook !== undefined) {
    return clip.webhookUrl ? "Webhook saved" : "Webhook cleared";
  }
  if ("encrypted" in body) {
    if (clip.encrypted) {
      return demotedFromKlipwall
        ? "Encryption enabled - removed from Klipwall"
        : "End-to-end encryption enabled";
    }
    return "Encryption disabled";
  }
  if (parsed.readAccess !== undefined) {
    const opt = READ_ACCESS_OPTIONS.find((o) => o.value === parsed.readAccess);
    return opt ? opt.label : "Read limit updated";
  }
  return "Settings saved";
}

export const clipContentSchema = z.object({
  content: z.string().max(MAX_CONTENT_LENGTH),
});

export const SLUG_REGEX = /^[a-zA-Z0-9_-]{3,64}$/;
export const VANITY_SLUG_REGEX = /^[a-zA-Z0-9_-]{2,32}\/[a-zA-Z0-9_-]{2,64}$/;

export const RESERVED_SLUGS = new Set([
  "account",
  "api",
  "assets",
  "login",
  "register",
  "forgot-password",
  "reset-password",
  "verify-email",
  "teams",
  "new",
  "ws",
  "privacy",
  "terms",
  "security",
  "about",
  "docs",
  "demo",
  "explore",
  "klipwall",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  // SEO landing pages
  "online-clipboard",
  "live-sync",
  "share-text-between-devices",
  "temporary-file-sharing",
  "secure-clipboard",
  "share-code-snippets",
  "clipboard-api",
  "burn-after-read",
  "encrypted-clipboard",
  "pastebin-vs-webklip",
  "privatebin-alternative",
  "onetimesecret-alternative",
  "share-password",
  "qr-clipboard",
  "temporary-notes",
  "markdown-paste",
  "share-screenshot",
]);

export const RESERVED_CLIP_SUFFIXES = new Set([
  "countdown",
  "versions",
  "settings",
  "upload",
  "qr",
  "unlock",
  "claim",
  "clone",
  "new-clip",
]);

export function isReservedSlug(slug: string): boolean {
  const base = slug.split("/")[0];
  if (isAdminPathSegment(base)) return true;
  return RESERVED_SLUGS.has(slug) || RESERVED_SLUGS.has(base);
}

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug) || VANITY_SLUG_REGEX.test(slug);
}

export function parseVanitySlug(team: string, name: string): string | null {
  if (RESERVED_SLUGS.has(team) || RESERVED_CLIP_SUFFIXES.has(name)) return null;
  const full = `${team}/${name}`;
  return VANITY_SLUG_REGEX.test(full) ? full : null;
}

export function generateSlug(length = 10): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function ttlLabel(seconds: number): string {
  const opt = TTL_OPTIONS.find((o) => o.value === seconds);
  if (opt) return opt.label;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  if (seconds < 31536000) return `${Math.round(seconds / 86400)} days`;
  return `${Math.round(seconds / 31536000)} year${seconds >= 63072000 ? "s" : ""}`;
}

export function remainingSeconds(expiresAt: number | null): number | null {
  if (expiresAt === null) return null;
  return Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
}

/**
 * Only same-site relative paths may be used as a post-login destination, so a
 * `next` parameter cannot be turned into an open redirect.
 */
export function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  if (value.includes("\\") || value.includes("\n") || value.includes("\r")) {
    return undefined;
  }
  return value;
}

/** Public site origin from SITE_URL (no trailing slash). */
export function siteUrl(): string {
  return (process.env.SITE_URL ?? "https://webklip.com").trim().replace(/\/$/, "");
}

/** Hostname(+port) for UI labels — derived from SITE_URL. */
export function siteHost(): string {
  try {
    return new URL(siteUrl()).host;
  } catch {
    return "webklip.com";
  }
}
