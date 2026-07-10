/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";

interface LoginPageProps {
  mode?: "login" | "register";
  error?: string;
}

export function LoginPage({ mode = "login", error }: LoginPageProps) {
  const isRegister = mode === "register";

  return (
    <Layout title={isRegister ? "Register — Clippy" : "Login — Clippy"}>
      <main class="home account-page">
        <h1>{isRegister ? "Create account" : "Sign in"}</h1>
        {error && <p class="pin-error">{error}</p>}
        <form
          method="post"
          action={isRegister ? "/register" : "/login"}
          class="home-form"
        >
          {isRegister && (
            <input
              type="text"
              name="name"
              placeholder="Name (optional)"
              class="slug-input"
            />
          )}
          <input
            type="email"
            name="email"
            placeholder="Email"
            class="slug-input"
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Password (8+ chars)"
            class="slug-input"
            required
            minlength={8}
          />
          <button type="submit" class="btn btn-primary">
            {isRegister ? "Register" : "Login"}
          </button>
        </form>
        <p class="hint">
          {isRegister ? (
            <>
              Already have an account? <a href="/login">Sign in</a>
            </>
          ) : (
            <>
              No account? <a href="/register">Register</a>
            </>
          )}
          {" · "}
          <a href="/">Home</a>
        </p>
      </main>
    </Layout>
  );
}

interface AccountPageProps {
  user: { id: string; email: string; name: string | null };
  teams: { id: string; slug: string; name: string; role: string }[];
  apiKeys: { id: string; name: string | null; createdAt: number }[];
}

export function AccountPage({ user, teams, apiKeys }: AccountPageProps) {
  return (
    <Layout title="Account — Clippy">
      <main class="home account-page">
        <h1>Account</h1>
        <p class="tagline">
          {user.name ? `${user.name} · ` : ""}
          {user.email}
        </p>

        <section class="account-section">
          <h2>API keys</h2>
          <form
            hx-post="/account/api-keys"
            hx-target="#new-key-panel"
            hx-swap="innerHTML"
            class="inline-form"
          >
            <input type="text" name="name" placeholder="Key name" class="slug-input" />
            <button type="submit" class="btn btn-ghost">Create key</button>
          </form>
          <div id="new-key-panel"></div>
          <ul class="team-list">
            {apiKeys.map((k) => (
              <li>
                {k.name ?? "default"}{" "}
                <span class="muted">({new Date(k.createdAt * 1000).toLocaleDateString()})</span>
              </li>
            ))}
          </ul>
        </section>

        <section class="account-section">
          <h2>Teams</h2>
          <ul class="team-list">
            {teams.map((t) => (
              <li>
                <a href={`/teams/${t.slug}`}>{t.name}</a>{" "}
                <span class="badge">{t.role}</span>
              </li>
            ))}
          </ul>
          <form method="post" action="/teams" class="home-form">
            <input
              type="text"
              name="slug"
              placeholder="team-slug"
              pattern="[a-z0-9-]{2,32}"
              class="slug-input"
              required
            />
            <input
              type="text"
              name="name"
              placeholder="Team name"
              class="slug-input"
              required
            />
            <button type="submit" class="btn btn-primary">Create team</button>
          </form>
        </section>

        <form method="post" action="/logout">
          <button type="submit" class="btn btn-ghost">Logout</button>
        </form>
        <p class="hint">
          <a href="/">← Home</a>
        </p>
      </main>
    </Layout>
  );
}
