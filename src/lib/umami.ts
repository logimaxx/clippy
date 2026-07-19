export interface UmamiConfig {
  websiteId: string;
  scriptUrl: string;
}

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

export interface UmamiScriptOptions {
  /** Default true — set false when sending sanitized paths from app.js */
  autoTrack?: boolean;
}

export function clipAnalyticsPath(slug: string): "/clip" | "/clip/vanity" {
  return slug.includes("/") ? "/clip/vanity" : "/clip";
}

export function umamiScriptTag(options: UmamiScriptOptions = {}): string | null {
  const config = getUmamiConfig();
  if (!config) return null;
  const autoTrack = options.autoTrack !== false;
  const autoTrackAttr = autoTrack ? "" : ' data-auto-track="false"';
  return `<script defer src="${config.scriptUrl}" data-website-id="${config.websiteId}"${autoTrackAttr}></script>`;
}
