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
