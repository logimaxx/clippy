import { z } from "zod";
import { isAdminPathSegment } from "./admin";

export const TTL_OPTIONS = [
  { value: 900, label: "15 min" },
  { value: 3600, label: "1 hour" },
  { value: 86400, label: "24 hours" },
  { value: 604800, label: "7 days" },
] as const;

export const EXPIRES_BURN = "burn" as const;

/** Single Expires control: burn-after-read (default) or timed TTL */
export const EXPIRES_OPTIONS = [
  { value: EXPIRES_BURN, label: "Burn after read" },
  ...TTL_OPTIONS,
] as const;

export type ExpiresOptionValue = (typeof EXPIRES_OPTIONS)[number]["value"];

export const DEFAULT_TTL = 86400;

export const MAX_FILES_PER_CLIP = 10;

export function expiresModeFromClip(burnOnRead: boolean, expiresAt: number | null): string {
  if (burnOnRead) return EXPIRES_BURN;
  if (expiresAt === null) return String(TTL_OPTIONS[2].value);
  const now = Math.floor(Date.now() / 1000);
  const remaining = expiresAt - now;
  const match = TTL_OPTIONS.find((o) => Math.abs(remaining - o.value) < 60);
  return match ? String(match.value) : String(TTL_OPTIONS[2].value);
}

export function clipFromExpiresMode(
  value: string,
  now: number
): { burnOnRead: boolean; expiresAt: number | null; maxViews: number | null } {
  if (value === EXPIRES_BURN) {
    return { burnOnRead: true, expiresAt: null, maxViews: null };
  }
  const ttl = Number(value);
  if (Number.isInteger(ttl) && ttl > 0) {
    return { burnOnRead: false, expiresAt: now + ttl, maxViews: null };
  }
  return { burnOnRead: true, expiresAt: null, maxViews: null };
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

export const clipSettingsSchema = z.object({
  ttl: z
    .union([z.literal(EXPIRES_BURN), z.coerce.number().int().positive().max(2592000)])
    .optional(),
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
  webhook: z.string().max(2048).optional(),
  encrypted: z
    .union([z.literal("on"), z.literal("off"), z.literal("true"), z.literal("1"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true" || v === "1"),
});

export function settingsToastMessage(
  body: Record<string, unknown>,
  parsed: z.infer<typeof clipSettingsSchema>,
  clip: { webhookUrl: string | null; encrypted: boolean }
): string {
  if (parsed.ttl !== undefined) {
    if (parsed.ttl === EXPIRES_BURN) return "Burn after read enabled";
    const opt = TTL_OPTIONS.find((o) => o.value === parsed.ttl);
    return opt ? `Expires in ${opt.label}` : "Expiry updated";
  }
  if (parsed.language !== undefined) {
    if (!parsed.language) return "Syntax: plain text";
    const label =
      parsed.language.charAt(0).toUpperCase() + parsed.language.slice(1);
    return `Syntax: ${label}`;
  }
  if (parsed.clearPin) return "PIN removed";
  if (parsed.pin && parsed.pin.length > 0) return "PIN saved";
  if (parsed.webhook !== undefined) {
    return clip.webhookUrl ? "Webhook saved" : "Webhook cleared";
  }
  if ("encrypted" in body) {
    return clip.encrypted
      ? "End-to-end encryption enabled"
      : "Encryption disabled";
  }
  if (parsed.readAccess !== undefined) {
    const opt = READ_ACCESS_OPTIONS.find((o) => o.value === parsed.readAccess);
    return opt ? opt.label : "Read limit updated";
  }
  return "Settings saved";
}

export const clipContentSchema = z.object({
  content: z.string().max(1_000_000),
});

export const SLUG_REGEX = /^[a-zA-Z0-9_-]{3,64}$/;
export const VANITY_SLUG_REGEX = /^[a-zA-Z0-9_-]{2,32}\/[a-zA-Z0-9_-]{2,64}$/;

export const RESERVED_SLUGS = new Set([
  "account",
  "api",
  "assets",
  "login",
  "register",
  "teams",
  "new",
  "ws",
  "privacy",
  "terms",
  "security",
  "docs",
  "demo",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  // SEO landing pages
  "online-clipboard",
  "share-text-between-devices",
  "temporary-file-sharing",
  "secure-clipboard",
  "share-code-snippets",
  "clipboard-api",
  "burn-after-read",
  "encrypted-clipboard",
]);

export const RESERVED_CLIP_SUFFIXES = new Set([
  "countdown",
  "versions",
  "settings",
  "upload",
  "qr",
  "unlock",
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
  return `${Math.round(seconds / 86400)} days`;
}

export function remainingSeconds(expiresAt: number | null): number | null {
  if (expiresAt === null) return null;
  return Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
}
