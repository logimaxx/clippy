import type { Clip } from "../db/schema";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;

  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 0) return true;
  }
  return false;
}

export async function isSafeWebhookUrl(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.username || u.password) return false;

    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return false;
    }

    const ipVersion = isIP(host);
    if (ipVersion) return !isPrivateIp(host);

    const records = await lookup(host, { all: true });
    return records.every((r) => !isPrivateIp(r.address));
  } catch {
    return false;
  }
}

export async function fireWebhook(
  clip: Clip,
  event: "read" | "burned" | "expired",
  extra: Record<string, unknown> = {}
) {
  if (!clip.webhookUrl) return;

  const url = clip.webhookUrl;
  if (!(await isSafeWebhookUrl(url))) {
    console.error(`Webhook blocked for ${clip.slug}: unsafe URL`);
    return;
  }

  const payload = {
    event,
    slug: clip.slug,
    timestamp: new Date().toISOString(),
    viewCount: clip.viewCount,
    burnOnRead: clip.burnOnRead,
    maxViews: clip.maxViews,
    ...extra,
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Webklip-Webhook/1.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error(`Webhook failed for ${clip.slug}:`, err);
  }
}
