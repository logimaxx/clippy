import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { users, apiKeys } from "../db/schema";
import {
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  resolveAuth,
  createApiKeyRaw,
  hashApiKey,
  getUserByEmail,
} from "../lib/session";
import {
  canAttemptLogin,
  recordLoginFailure,
  clearLoginFailures,
  canRegister,
} from "../lib/auth-throttle";
import {
  isEmailVerificationRequired,
  sendVerificationEmail,
} from "../lib/email-verification";

const auth = new Hono();

function authApiEnabled(): boolean {
  return process.env.ENABLE_AUTH_API === "true";
}

auth.post("/api/v1/auth/register", async (c) => {
  if (!authApiEnabled()) {
    return c.json({ error: "Auth API disabled" }, 403);
  }
  if (!canRegister(c.req.raw.headers)) {
    return c.json({ error: "Too many registrations from this network" }, 429);
  }
  const body = await c.req.json<{ email: string; password: string; name?: string }>();
  if (!body.email?.includes("@") || !body.password || body.password.length < 8) {
    return c.json({ error: "Valid email and password (8+ chars) required" }, 400);
  }

  const existing = await getUserByEmail(body.email.toLowerCase());
  if (existing) return c.json({ error: "Email already registered" }, 409);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);
  const email = body.email.toLowerCase();
  const needsVerification = isEmailVerificationRequired();

  await db.insert(users).values({
    id,
    email,
    name: body.name ?? null,
    passwordHash,
    emailVerifiedAt: needsVerification ? null : Math.floor(Date.now() / 1000),
  });

  if (needsVerification) {
    const emailSent = await sendVerificationEmail(id, email);
    return c.json({ id, email, emailVerified: false, emailSent }, 201);
  }

  setSessionCookie(c, id);
  return c.json({ id, email }, 201);
});

auth.post("/api/v1/auth/login", async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const email = body.email?.toLowerCase() ?? "";
  const headers = c.req.raw.headers;

  if (!canAttemptLogin(headers, email)) {
    return c.json({ error: "Too many failed attempts" }, 429);
  }

  const user = await getUserByEmail(email);
  if (!user?.passwordHash || !(await verifyPassword(body.password, user.passwordHash))) {
    recordLoginFailure(headers, email);
    return c.json({ error: "Invalid credentials" }, 401);
  }

  clearLoginFailures(headers, email);

  if (isEmailVerificationRequired() && !user.emailVerifiedAt) {
    return c.json({ error: "Email address not confirmed" }, 403);
  }

  setSessionCookie(c, user.id, user.sessionVersion);
  return c.json({ id: user.id, email: user.email, name: user.name });
});

auth.post("/api/v1/auth/logout", async (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

auth.get("/api/v1/auth/me", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ user });
});

auth.get("/api/v1/auth/api-keys", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const keys = await db
    .select({ id: apiKeys.id, name: apiKeys.name, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(eq(apiKeys.userId, user.id));

  return c.json({ keys });
});

auth.post("/api/v1/auth/api-keys", async (c) => {
  if (!authApiEnabled()) {
    return c.json({ error: "Auth API disabled" }, 403);
  }

  const user = await resolveAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json<{ name?: string }>().catch(() => ({}));
  const rawKey = createApiKeyRaw();
  const keyHash = hashApiKey(rawKey);

  await db.insert(apiKeys).values({
    id: crypto.randomUUID(),
    userId: user.id,
    keyHash,
    name: body.name ?? "default",
  });

  return c.json({ apiKey: rawKey }, 201);
});

auth.delete("/api/v1/auth/api-keys/:id", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  await db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)));
  return c.json({ ok: true });
});

export { auth };
