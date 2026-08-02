import { siteUrl } from "./constants";

export interface UmamiConfig {
  websiteId: string;
  scriptUrl: string;
}

export interface TrackAppAccessOptions {
  userAgent?: string | null;
  language?: string | null;
  referrer?: string | null;
}

/** Fixed path for clip-app access — never include secret clip slugs. */
export const APP_ACCESS_URL = "/app";

const SEND_TIMEOUT_MS = 3000;
const DEFAULT_USER_AGENT = "Webklip/1.0 (Server)";

export function getUmamiConfig(): UmamiConfig | null {
  const websiteId = process.env.UMAMI_WEBSITE_ID?.trim();
  if (!websiteId) return null;

  const scriptUrl =
    process.env.UMAMI_SCRIPT_URL?.trim() ||
    (process.env.UMAMI_URL?.trim()
      ? `${process.env.UMAMI_URL.replace(/\/$/, "")}/script.js`
      : "");

  if (!scriptUrl) return null;

  try {
    new URL(scriptUrl);
  } catch {
    console.warn("UMAMI_SCRIPT_URL or UMAMI_URL is not a valid URL — analytics disabled.");
    return null;
  }

  return { websiteId, scriptUrl };
}

export function isUmamiEnabled(): boolean {
  return getUmamiConfig() !== null;
}

export function umamiScriptOrigin(): string | null {
  const config = getUmamiConfig();
  if (!config) return null;
  return new URL(config.scriptUrl).origin;
}

/** Script tag for public marketing/static pages only — clipboard app uses server-side trackAppAccess. */
export function umamiScriptTag(): string | null {
  const config = getUmamiConfig();
  if (!config) return null;
  return `<script defer src="${config.scriptUrl}" data-website-id="${config.websiteId}"></script>`;
}

function hostnameFromSiteUrl(): string {
  try {
    return new URL(siteUrl()).hostname;
  } catch {
    return "webklip.com";
  }
}

/** API origin for server-side tracking — requires `UMAMI_URL` (not script URL alone). */
export function umamiApiOrigin(): string | null {
  const raw = process.env.UMAMI_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    console.warn("UMAMI_URL is not a valid URL — app access tracking disabled.");
    return null;
  }
}

/**
 * Fire-and-forget Umami pageview for clipboard app access.
 * Requires `UMAMI_WEBSITE_ID` and `UMAMI_URL`. Never throws to the caller.
 */
export function trackAppAccess(opts: TrackAppAccessOptions = {}): void {
  const websiteId = process.env.UMAMI_WEBSITE_ID?.trim();
  if (!websiteId) return;

  const origin = umamiApiOrigin();
  if (!origin) return;

  const language = opts.language?.trim().slice(0, 35) || undefined;
  const referrer = opts.referrer?.trim() || undefined;
  const userAgent = opts.userAgent?.trim() || DEFAULT_USER_AGENT;

  const body = {
    type: "event",
    payload: {
      website: websiteId,
      hostname: hostnameFromSiteUrl(),
      url: APP_ACCESS_URL,
      ...(language ? { language } : {}),
      ...(referrer ? { referrer } : {}),
    },
  };

  void fetch(`${origin}/api/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": userAgent,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  }).catch(() => {
    /* ignore network / timeout errors */
  });
}
