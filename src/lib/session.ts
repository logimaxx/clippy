import { createHmac, timingSafeEqual, createHash, randomBytes } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { users, apiKeys, type User } from "../db/schema";
import { shouldUseSecureCookies } from "./pin";

const SECRET = process.env.SESSION_SECRET ?? "webklip-dev-secret-change-me";
const SESSION_COOKIE = "webklip_session";
const SESSION_DAYS = 30;
const SESSION_MAX_AGE_S = SESSION_DAYS * 86400;

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  via: "session" | "api_key";
}

interface SessionClaims {
  userId: string;
  issuedAt: number;
  version: number;
}

export function signSession(userId: string, issuedAt: number, version: number): string {
  const payload = `${userId}.${issuedAt}.${version}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/**
 * Verifies signature and absolute age. The `version` claim still has to be
 * compared against the user row — only a DB read can see a revocation.
 */
export function verifySessionToken(token: string): SessionClaims | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, issuedAtRaw, versionRaw, sig] = parts;

  const expected = createHmac("sha256", SECRET)
    .update(`${userId}.${issuedAtRaw}.${versionRaw}`)
    .digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  const issuedAt = Number(issuedAtRaw);
  const version = Number(versionRaw);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(version)) return null;
  if (nowSeconds() - issuedAt > SESSION_MAX_AGE_S) return null;

  return { userId, issuedAt, version };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

export async function verifyPassword(
  password: string,
  hash: string | null
): Promise<boolean> {
  if (!hash) return false;
  return Bun.password.verify(password, hash);
}

export function setSessionCookie(c: Context, userId: string, sessionVersion = 0) {
  setCookie(c, SESSION_COOKIE, signSession(userId, nowSeconds(), sessionVersion), {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: SESSION_MAX_AGE_S,
    path: "/",
    secure: shouldUseSecureCookies(c.req.raw.headers),
  });
}

/** Invalidates every existing session for the user. Returns the new version. */
export async function bumpSessionVersion(userId: string): Promise<number> {
  const rows = await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId))
    .returning({ sessionVersion: users.sessionVersion });
  return rows[0]?.sessionVersion ?? 0;
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/**
 * Session user id from a raw Request (e.g. WebSocket upgrade). Synchronous, so
 * it checks signature and age only — a revoked session is still rejected on the
 * next HTTP request through `resolveAuth`.
 */
export function getSessionUserIdFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === SESSION_COOKIE) {
      return verifySessionToken(rest.join("="))?.userId ?? null;
    }
  }
  return null;
}

export async function resolveAuth(c: Context): Promise<AuthUser | null> {
  const authHeader = c.req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const rawKey = authHeader.slice(7);
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);
    if (!keys[0]) return null;
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, keys[0].userId))
      .limit(1);
    if (!user[0]) return null;
    return {
      id: user[0].id,
      email: user[0].email,
      name: user[0].name,
      via: "api_key",
    };
  }

  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const claims = verifySessionToken(token);
  if (!claims) return null;

  const rows = await db.select().from(users).where(eq(users.id, claims.userId)).limit(1);
  const user = rows[0];
  if (!user) return null;
  if (claims.version !== user.sessionVersion) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    via: "session",
  };
}

export async function requireAuth(c: Context): Promise<AuthUser | null> {
  const user = await resolveAuth(c);
  if (!user) {
    return null;
  }
  return user;
}

export function createApiKeyRaw(): string {
  return `webklip_${randomBytes(24).toString("base64url")}`;
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}
