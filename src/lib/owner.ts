import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { shouldUseSecureCookies } from "./pin";

const SECRET = process.env.SESSION_SECRET ?? "webklip-dev-secret-change-me";

function cookieName(slug: string) {
  return `webklip_owner_${slug}`;
}

function signOwner(slug: string): string {
  return createHmac("sha256", SECRET).update(`owner:${slug}`).digest("base64url");
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

export function setOwnerCookie(c: Context, slug: string) {
  setCookie(c, cookieName(slug), signOwner(slug), {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    secure: shouldUseSecureCookies(c.req.raw.headers),
  });
}
