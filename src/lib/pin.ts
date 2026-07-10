import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

const SECRET = process.env.SESSION_SECRET ?? "clippy-dev-secret-change-me";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function shouldUseSecureCookies(headers?: Headers): boolean {
  if (process.env.SECURE_COOKIES === "true") return true;
  if (headers?.get("x-forwarded-proto") === "https") return true;
  return false;
}

function cookieName(slug: string) {
  return `clippy_unlock_${slug}`;
}

function signSlug(slug: string): string {
  return createHmac("sha256", SECRET).update(slug).digest("base64url");
}

function parseCookieHeader(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

function verifyUnlockToken(slug: string, cookie: string | undefined): boolean {
  if (!cookie) return false;
  try {
    const expected = signSlug(slug);
    const a = Buffer.from(cookie);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function hashPin(pin: string): Promise<string> {
  return Bun.password.hash(pin, { algorithm: "bcrypt", cost: 10 });
}

export async function verifyPin(
  pin: string | null | undefined,
  hash: string | null
): Promise<boolean> {
  if (!hash) return true;
  if (!pin) return false;
  return Bun.password.verify(pin, hash);
}

export function isUnlocked(c: Context, slug: string): boolean {
  return verifyUnlockToken(slug, getCookie(c, cookieName(slug)));
}

export function isUnlockedFromRequest(req: Request, slug: string): boolean {
  const cookie = parseCookieHeader(req.headers.get("cookie"), cookieName(slug));
  return verifyUnlockToken(slug, cookie);
}

export function setUnlockCookie(c: Context, slug: string) {
  setCookie(c, cookieName(slug), signSlug(slug), {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 86400,
    path: "/",
    secure: shouldUseSecureCookies(c.req.raw.headers),
  });
}

export function checkPinAttempts(ip: string, slug: string): boolean {
  const key = `${ip}:${slug}`;
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + LOCKOUT_MS };
    attempts.set(key, entry);
  }
  return entry.count < MAX_ATTEMPTS;
}

export function recordPinFailure(ip: string, slug: string) {
  const key = `${ip}:${slug}`;
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + LOCKOUT_MS };
  }
  entry.count += 1;
  attempts.set(key, entry);
}

export function clearPinAttempts(ip: string, slug: string) {
  attempts.delete(`${ip}:${slug}`);
}

export function remainingPinAttempts(ip: string, slug: string): number {
  const key = `${ip}:${slug}`;
  const entry = attempts.get(key);
  if (!entry || Date.now() >= entry.resetAt) return MAX_ATTEMPTS;
  return Math.max(0, MAX_ATTEMPTS - entry.count);
}
