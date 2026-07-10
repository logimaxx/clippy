import { Hono } from "hono";
import { eq } from "drizzle-orm";
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

const auth = new Hono();

function authApiEnabled(): boolean {
  return process.env.ENABLE_AUTH_API === "true";
}

auth.post("/api/v1/auth/register", async (c) => {
  if (!authApiEnabled()) {
    return c.json({ error: "Auth API disabled" }, 403);
  }
  const body = await c.req.json<{ email: string; password: string; name?: string }>();
  if (!body.email?.includes("@") || !body.password || body.password.length < 8) {
    return c.json({ error: "Valid email and password (8+ chars) required" }, 400);
  }

  const existing = await getUserByEmail(body.email.toLowerCase());
  if (existing) return c.json({ error: "Email already registered" }, 409);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);

  await db.insert(users).values({
    id,
    email: body.email.toLowerCase(),
    name: body.name ?? null,
    passwordHash,
  });

  setSessionCookie(c, id);
  return c.json({ id, email: body.email.toLowerCase() }, 201);
});

auth.post("/api/v1/auth/login", async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const user = await getUserByEmail(body.email?.toLowerCase() ?? "");
  if (!user?.passwordHash || !(await verifyPassword(body.password, user.passwordHash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  setSessionCookie(c, user.id);
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
  await db.delete(apiKeys).where(eq(apiKeys.id, id));
  return c.json({ ok: true });
});

export { auth };
