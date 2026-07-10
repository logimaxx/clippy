import { createHmac, timingSafeEqual, createHash, randomBytes } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users, apiKeys, type User } from "../db/schema";
import { shouldUseSecureCookies } from "./pin";

const SECRET = process.env.SESSION_SECRET ?? "clippy-dev-secret-change-me";
const SESSION_COOKIE = "clippy_session";
const SESSION_DAYS = 30;

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  via: "session" | "api_key";
}

function signSession(userId: string): string {
  const sig = createHmac("sha256", SECRET).update(userId).digest("base64url");
  return `${userId}.${sig}`;
}

function verifySessionToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const userId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", SECRET).update(userId).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
    return userId;
  } catch {
    return null;
  }
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

export function setSessionCookie(c: Context, userId: string) {
  setCookie(c, SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: SESSION_DAYS * 86400,
    path: "/",
    secure: shouldUseSecureCookies(c.req.raw.headers),
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
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
  const userId = verifySessionToken(token);
  if (!userId) return null;

  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) return null;

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
  return `clippy_${randomBytes(24).toString("base64url")}`;
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}
