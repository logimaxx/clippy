import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import {
  checkPinAttempts,
  clearPinAttempts,
  recordPinFailure,
  remainingPinAttempts,
  shouldUseSecureCookies,
  verifyPin,
} from "./pin";

const SECRET = process.env.SESSION_SECRET ?? "webklip-dev-secret-change-me";
export const OWNER_PASSWORD_MIN_LEN = 8;

function cookieName(slug: string) {
  return `webklip_owner_${slug}`;
}

/** Namespace claim attempts separately from visitor PIN attempts. */
function claimIp(ip: string) {
  return `ownerclaim:${ip}`;
}

function signOwner(slug: string): string {
  return createHmac("sha256", SECRET).update(`owner:${slug}`).digest("base64url");
}

function parseCookieHeader(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

function verifyOwnerToken(slug: string, cookie: string | undefined): boolean {
  if (!cookie) return false;
  try {
    const expected = signOwner(slug);
    const a = Buffer.from(cookie);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isClipOwner(
  c: Context,
  slug: string,
  userId: string | null,
  ownerId: string | null
): boolean {
  if (ownerId && userId === ownerId) return true;
  return verifyOwnerToken(slug, getCookie(c, cookieName(slug)));
}

export function isClipOwnerFromRequest(
  req: Request,
  slug: string,
  userId: string | null,
  ownerId: string | null
): boolean {
  if (ownerId && userId === ownerId) return true;
  return verifyOwnerToken(
    slug,
    parseCookieHeader(req.headers.get("cookie"), cookieName(slug))
  );
}

export function setOwnerCookie(c: Context, slug: string) {
  setCookie(c, cookieName(slug), signOwner(slug), {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    secure: shouldUseSecureCookies(c.req.raw.headers),
  });
}

export function checkOwnerClaimAttempts(ip: string, slug: string): boolean {
  return checkPinAttempts(claimIp(ip), slug);
}

export function recordOwnerClaimFailure(ip: string, slug: string) {
  recordPinFailure(claimIp(ip), slug);
}

export function clearOwnerClaimAttempts(ip: string, slug: string) {
  clearPinAttempts(claimIp(ip), slug);
}

export function remainingOwnerClaimAttempts(ip: string, slug: string): number {
  return remainingPinAttempts(claimIp(ip), slug);
}

export async function verifyOwnerPassword(
  password: string | null | undefined,
  hash: string | null
): Promise<boolean> {
  if (!hash || !password) return false;
  return verifyPin(password, hash);
}
