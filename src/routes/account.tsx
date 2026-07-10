/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { teams, teamMembers, users } from "../db/schema";
import {
  resolveAuth,
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  getUserByEmail,
  createApiKeyRaw,
  hashApiKey,
} from "../lib/session";
import { listUserTeams } from "../lib/teams";
import { apiKeys } from "../db/schema";
import { AccountPage, LoginPage } from "../views/Account";
import { Layout } from "../views/Layout";

const account = new Hono();

account.get("/login", (c) => c.html(<LoginPage />));

account.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = typeof body.email === "string" ? body.email.toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const user = await getUserByEmail(email);
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return c.html(<LoginPage error="Invalid email or password" />);
  }

  setSessionCookie(c, user.id);
  return c.redirect("/account", 302);
});

account.get("/register", (c) => c.html(<LoginPage mode="register" />));

account.post("/register", async (c) => {
  const body = await c.req.parseBody();
  const email = typeof body.email === "string" ? body.email.toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name : "";

  if (!email.includes("@") || password.length < 8) {
    return c.html(
      <LoginPage mode="register" error="Valid email and password (8+ chars) required" />
    );
  }

  if (await getUserByEmail(email)) {
    return c.html(<LoginPage mode="register" error="Email already registered" />);
  }

  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email,
    name: name || null,
    passwordHash: await hashPassword(password),
  });

  setSessionCookie(c, id);
  return c.redirect("/account", 302);
});

account.post("/logout", async (c) => {
  clearSessionCookie(c);
  return c.redirect("/", 302);
});

account.get("/account", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.redirect("/login", 302);

  const userTeams = await listUserTeams(user.id);
  const keys = await db
    .select({ id: apiKeys.id, name: apiKeys.name, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(eq(apiKeys.userId, user.id));

  return c.html(<AccountPage user={user} teams={userTeams} apiKeys={keys} />);
});

account.post("/account/api-keys", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.text("Unauthorized", 401);

  const body = await c.req.parseBody();
  const name = typeof body.name === "string" ? body.name : "default";
  const rawKey = createApiKeyRaw();

  await db.insert(apiKeys).values({
    id: crypto.randomUUID(),
    userId: user.id,
    keyHash: hashApiKey(rawKey),
    name,
  });

  return c.html(
    <div id="new-key-panel" class="key-reveal">
      <p class="success">API key created — copy now, it won't be shown again:</p>
      <code class="api-key-code">{rawKey}</code>
    </div>
  );
});

account.post("/teams", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.redirect("/login", 302);

  const body = await c.req.parseBody();
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!/^[a-z0-9-]{2,32}$/.test(slug) || name.length < 2) {
    return c.text("Invalid team slug or name", 400);
  }

  const teamId = crypto.randomUUID();
  try {
    await db.insert(teams).values({ id: teamId, slug, name, ownerId: user.id });
    await db.insert(teamMembers).values({
      id: crypto.randomUUID(),
      teamId,
      userId: user.id,
      role: "owner",
    });
  } catch {
    return c.text("Team slug already taken", 409);
  }

  return c.redirect(`/teams/${slug}`, 302);
});

account.get("/teams/:slug", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.redirect("/login", 302);

  const slug = c.req.param("slug");
  const teamRows = await db.select().from(teams).where(eq(teams.slug, slug)).limit(1);
  const team = teamRows[0];
  if (!team) return c.text("Team not found", 404);

  const members = await db
    .select({ email: users.email, role: teamMembers.role })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, team.id));

  return c.html(
    <Layout title={`Team ${team.name}`}>
      <main class="home account-page">
        <h1>{team.name}</h1>
        <p class="tagline">
          Vanity clips: <code>/{team.slug}/your-clip</code>
        </p>
        <form action={`/${team.slug}/new-clip`} method="post" class="home-form">
          <input
            type="text"
            name="name"
            placeholder="clip-name"
            pattern="[a-zA-Z0-9_-]{2,64}"
            class="slug-input"
            required
          />
          <button type="submit" class="btn btn-primary">
            Create team clip
          </button>
        </form>
        <h2>Members</h2>
        <ul class="team-list">
          {members.map((m) => (
            <li>
              {m.email} <span class="badge">{m.role}</span>
            </li>
          ))}
        </ul>
        <p class="hint">
          <a href="/account">← Account</a>
        </p>
      </main>
    </Layout>
  );
});

export { account };
