import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db } from "../db/client";
import { oauthAccounts, users, type OauthProvider, type User } from "../db/schema";
import { siteUrl } from "./constants";
import { shouldUseSecureCookies } from "./pin";
import { getUserByEmail } from "./session";

const SECRET = process.env.SESSION_SECRET ?? "webklip-dev-secret-change-me";
const OAUTH_STATE_COOKIE = "webklip_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;

export type OauthProfile = {
  provider: OauthProvider;
  providerUserId: string;
  email: string;
  name: string | null;
};

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
};

export function isOauthProvider(value: string): value is OauthProvider {
  return value === "google" || value === "github";
}

export function getOauthProviderConfig(provider: OauthProvider): ProviderConfig | null {
  if (provider === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["openid", "email", "profile"],
    };
  }

  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["read:user", "user:email"],
  };
}

export function enabledOauthProviders(): OauthProvider[] {
  const out: OauthProvider[] = [];
  if (getOauthProviderConfig("google")) out.push("google");
  if (getOauthProviderConfig("github")) out.push("github");
  return out;
}

export function oauthCallbackUrl(provider: OauthProvider): string {
  return `${siteUrl()}/auth/${provider}/callback`;
}

function signState(nonce: string, provider: OauthProvider, exp: number): string {
  const payload = `${provider}.${nonce}.${exp}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function createOauthState(provider: OauthProvider): string {
  const nonce = randomBytes(16).toString("base64url");
  const exp = Date.now() + STATE_TTL_MS;
  return signState(nonce, provider, exp);
}

export function verifyOauthState(
  state: string,
  expectedProvider: OauthProvider
): boolean {
  const parts = state.split(".");
  if (parts.length !== 4) return false;
  const [provider, nonce, expStr, sig] = parts;
  if (provider !== expectedProvider || !nonce || !expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const expected = createHmac("sha256", SECRET)
    .update(`${provider}.${nonce}.${exp}`)
    .digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function setOauthStateCookie(c: Context, state: string) {
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: Math.floor(STATE_TTL_MS / 1000),
    path: "/",
    secure: shouldUseSecureCookies(c.req.raw.headers),
  });
}

export function clearOauthStateCookie(c: Context) {
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });
}

export function readOauthStateCookie(c: Context): string | undefined {
  return getCookie(c, OAUTH_STATE_COOKIE);
}

export function buildAuthorizationUrl(provider: OauthProvider, state: string): string | null {
  const config = getOauthProviderConfig(provider);
  if (!config) return null;

  const url = new URL(config.authUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", oauthCallbackUrl(provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  if (provider === "google") {
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
  }
  return url.toString();
}

async function exchangeCode(
  provider: OauthProvider,
  code: string
): Promise<string | null> {
  const config = getOauthProviderConfig(provider);
  if (!config) return null;

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: oauthCallbackUrl(provider),
    grant_type: "authorization_code",
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

async function fetchGoogleProfile(accessToken: string): Promise<OauthProfile | null> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!data.sub || !data.email || data.email_verified === false) return null;

  return {
    provider: "google",
    providerUserId: data.sub,
    email: data.email.toLowerCase(),
    name: data.name ?? null,
  };
}

async function fetchGithubProfile(accessToken: string): Promise<OauthProfile | null> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "webklip",
  };

  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) return null;

  const user = (await userRes.json()) as {
    id?: number;
    email?: string | null;
    name?: string | null;
    login?: string;
  };
  if (user.id == null) return null;

  let email: string | null = null;
  const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
  if (emailsRes.ok) {
    const emails = (await emailsRes.json()) as Array<{
      email?: string;
      primary?: boolean;
      verified?: boolean;
    }>;
    const primary =
      emails.find((e) => e.primary && e.verified && e.email) ??
      emails.find((e) => e.verified && e.email);
    email = primary?.email?.toLowerCase() ?? null;
  }
  if (!email && user.email) {
    email = user.email.toLowerCase();
  }
  if (!email) return null;

  return {
    provider: "github",
    providerUserId: String(user.id),
    email,
    name: user.name ?? user.login ?? null,
  };
}

export async function fetchOauthProfile(
  provider: OauthProvider,
  code: string
): Promise<OauthProfile | null> {
  const accessToken = await exchangeCode(provider, code);
  if (!accessToken) return null;
  if (provider === "google") return fetchGoogleProfile(accessToken);
  return fetchGithubProfile(accessToken);
}

/** Link or create a local user for a verified OAuth profile. */
export async function findOrCreateOauthUser(profile: OauthProfile): Promise<User> {
  const linked = await db
    .select({ user: users })
    .from(oauthAccounts)
    .innerJoin(users, eq(oauthAccounts.userId, users.id))
    .where(
      and(
        eq(oauthAccounts.provider, profile.provider),
        eq(oauthAccounts.providerUserId, profile.providerUserId)
      )
    )
    .limit(1);

  if (linked[0]) return linked[0].user;

  let user = await getUserByEmail(profile.email);
  if (!user) {
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      email: profile.email,
      name: profile.name,
      passwordHash: null,
    });
    user = (await getUserByEmail(profile.email))!;
  } else if (!user.name && profile.name) {
    await db.update(users).set({ name: profile.name }).where(eq(users.id, user.id));
    user = { ...user, name: profile.name };
  }

  await db.insert(oauthAccounts).values({
    id: crypto.randomUUID(),
    userId: user.id,
    provider: profile.provider,
    providerUserId: profile.providerUserId,
  });

  return user;
}
