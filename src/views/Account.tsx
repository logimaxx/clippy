/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";
import type { OauthProvider } from "../db/schema";

interface LoginPageProps {
  mode?: "login" | "register";
  error?: string;
  notice?: string;
  oauthProviders?: OauthProvider[];
  resetEnabled?: boolean;
  /** Relative path to return to after signing in, e.g. a pending team invite. */
  next?: string;
}

function OauthButtons({ providers }: { providers: OauthProvider[] }) {
  if (providers.length === 0) return null;

  return (
    <div class="oauth-buttons">
      {providers.includes("google") && (
        <a href="/auth/google" class="btn btn-oauth btn-oauth-google">
          Continue with Google
        </a>
      )}
      {providers.includes("github") && (
        <a href="/auth/github" class="btn btn-oauth btn-oauth-github">
          Continue with GitHub
        </a>
      )}
      <p class="oauth-divider">
        <span>or</span>
      </p>
    </div>
  );
}

export function LoginPage({
  mode = "login",
  error,
  notice,
  oauthProviders = [],
  resetEnabled = false,
  next,
}: LoginPageProps) {
  const isRegister = mode === "register";
  const suffix = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <Layout title={isRegister ? "Register — Webklip" : "Login — Webklip"}>
      <main class="home account-page">
        <h1>{isRegister ? "Create account" : "Sign in"}</h1>
        {notice && <p class="success">{notice}</p>}
        {error && <p class="pin-error">{error}</p>}
        <OauthButtons providers={oauthProviders} />
        <form
          method="post"
          action={isRegister ? `/register${suffix}` : `/login${suffix}`}
          class="home-form"
        >
          {next && <input type="hidden" name="next" value={next} />}
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
              Already have an account? <a href={`/login${suffix}`}>Sign in</a>
            </>
          ) : (
            <>
              No account? <a href={`/register${suffix}`}>Register</a>
            </>
          )}
          {!isRegister && resetEnabled && (
            <>
              {" · "}
              <a href="/forgot-password">Forgot password?</a>
            </>
          )}
          {" · "}
          <a href="/">Home</a>
        </p>
      </main>
    </Layout>
  );
}

interface VerifyEmailPageProps {
  email?: string;
  /** Sign-in was refused because the address is still unconfirmed. */
  pending?: boolean;
  resent?: boolean;
  invalid?: boolean;
  error?: string;
  /** The account exists but the confirmation email could not be handed off. */
  sendFailed?: boolean;
  /** Delivery is broken right now, said the same way to every visitor. */
  mailerDown?: boolean;
}

export function VerifyEmailPage({
  email,
  pending,
  resent,
  invalid,
  error,
  sendFailed,
  mailerDown,
}: VerifyEmailPageProps) {
  if (invalid) {
    return (
      <Layout title="Confirmation link — Webklip">
        <main class="home account-page">
          <h1>Link no longer valid</h1>
          <p class="pin-error">
            This confirmation link is invalid, already used, or expired.
          </p>
          <p class="hint">Request a new one and we'll email it right away.</p>
          <form method="post" action="/verify-email/resend" class="home-form">
            <input
              type="email"
              name="email"
              placeholder="Email"
              class="slug-input"
              required
            />
            <button type="submit" class="btn btn-primary">
              Send a new link
            </button>
          </form>
          <p class="hint">
            <a href="/login">← Back to sign in</a>
          </p>
        </main>
      </Layout>
    );
  }

  if (sendFailed) {
    return (
      <Layout title="Confirm your email — Webklip">
        <main class="home account-page">
          <h1>We couldn't send the email</h1>
          <p class="pin-error">
            Your account was created, but the confirmation email failed to go out.
            Nothing is lost — try again in a few minutes.
          </p>
          <form method="post" action="/verify-email/resend" class="home-form">
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={email}
              class="slug-input"
              required
            />
            <button type="submit" class="btn btn-primary">
              Try sending again
            </button>
          </form>
          <p class="hint">
            If it keeps failing, sign in with Google instead — that skips email
            confirmation entirely.
          </p>
          <p class="hint">
            <a href="/login">← Back to sign in</a>
          </p>
        </main>
      </Layout>
    );
  }

  return (
    <Layout title="Confirm your email — Webklip">
      <main class="home account-page">
        <h1>{pending ? "Confirm your email first" : "Check your email"}</h1>
        {error && <p class="pin-error">{error}</p>}
        {!error && (
          <p class="success">
            {pending
              ? "Your account exists but the address hasn't been confirmed yet."
              : resent
                ? "If that address is waiting for confirmation, a new link is on its way."
                : "We sent a confirmation link to your address. Open it to activate your account."}
          </p>
        )}
        {mailerDown && (
          <p class="pin-error">
            Our email system is having trouble right now, so delivery may be delayed.
          </p>
        )}
        <p class="hint">
          The link works once and expires in 24 hours. Unconfirmed accounts are
          deleted after 7 days.
        </p>
        <form method="post" action="/verify-email/resend" class="home-form">
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={email}
            class="slug-input"
            required
          />
          <button type="submit" class="btn btn-ghost">
            Resend confirmation link
          </button>
        </form>
        <p class="hint">
          <a href="/login">← Back to sign in</a>
        </p>
      </main>
    </Layout>
  );
}

export function ForgotPasswordPage({
  sent,
  error,
  mailerDown,
}: {
  sent?: boolean;
  error?: string;
  mailerDown?: boolean;
}) {
  return (
    <Layout title="Reset password — Webklip">
      <main class="home account-page">
        <h1>Reset password</h1>
        {sent ? (
          <>
            <p class="success">
              If an account exists for that address, a reset link is on its way. The
              link works once and expires in an hour.
            </p>
            {mailerDown && (
              <p class="pin-error">
                Our email system is having trouble right now, so delivery may be
                delayed. Try again in a few minutes if nothing arrives.
              </p>
            )}
            <p class="hint">
              <a href="/login">← Back to sign in</a>
            </p>
          </>
        ) : (
          <>
            {error && <p class="pin-error">{error}</p>}
            <p class="hint">
              Enter your email and we'll send you a link to choose a new password.
            </p>
            <form method="post" action="/forgot-password" class="home-form">
              <input
                type="email"
                name="email"
                placeholder="Email"
                class="slug-input"
                required
              />
              <button type="submit" class="btn btn-primary">
                Send reset link
              </button>
            </form>
            <p class="hint">
              <a href="/login">← Back to sign in</a>
            </p>
          </>
        )}
      </main>
    </Layout>
  );
}

export function ResetPasswordPage({
  token,
  error,
  invalid,
}: {
  token?: string;
  error?: string;
  invalid?: boolean;
}) {
  return (
    <Layout title="Choose a new password — Webklip">
      <main class="home account-page">
        <h1>Choose a new password</h1>
        {invalid ? (
          <>
            <p class="pin-error">
              This reset link is invalid, already used, or expired.
            </p>
            <p class="hint">
              <a href="/forgot-password">Request a new one</a>
            </p>
          </>
        ) : (
          <>
            {error && <p class="pin-error">{error}</p>}
            <form method="post" action={`/reset-password/${token}`} class="home-form">
              <input
                type="password"
                name="password"
                placeholder="New password (8+ chars)"
                class="slug-input"
                required
                minlength={8}
                autocomplete="new-password"
              />
              <input
                type="password"
                name="password_confirm"
                placeholder="Repeat new password"
                class="slug-input"
                required
                minlength={8}
                autocomplete="new-password"
              />
              <button type="submit" class="btn btn-primary">
                Set new password
              </button>
            </form>
            <p class="hint">
              Setting a new password signs you out on every other device.
            </p>
          </>
        )}
      </main>
    </Layout>
  );
}

interface AccountPageProps {
  user: { id: string; email: string; name: string | null };
  teams: { id: string; slug: string; name: string; role: string }[];
  apiKeys: { id: string; name: string | null; createdAt: number }[];
  deleteError?: string;
}

export function AccountPage({ user, teams, apiKeys, deleteError }: AccountPageProps) {
  return (
    <Layout title="Account — Webklip">
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

        <section class="account-section">
          <h2>Sessions</h2>
          <p class="hint">
            Sessions expire 30 days after sign-in. Sign out everywhere if you used a
            shared device or think a session was copied.
          </p>
          <div class="account-actions">
            <form method="post" action="/logout">
              <button type="submit" class="btn btn-ghost">Logout</button>
            </form>
            <form method="post" action="/account/logout-all">
              <button type="submit" class="btn btn-ghost">
                Sign out everywhere
              </button>
            </form>
          </div>
        </section>

        <section class="account-section account-danger">
          <h2>Delete account</h2>
          <p class="hint">
            Permanently removes your account, API keys, teams you own, and every clip
            you created — including uploaded files. This cannot be undone.
          </p>
          {deleteError && <p class="pin-error">{deleteError}</p>}
          <form method="post" action="/account/delete" class="home-form">
            <input
              type="email"
              name="confirm_email"
              placeholder={`Type ${user.email} to confirm`}
              class="slug-input"
              required
            />
            <input
              type="password"
              name="password"
              placeholder="Password (leave blank if you use Google/GitHub)"
              class="slug-input"
              autocomplete="current-password"
            />
            <button type="submit" class="btn btn-danger">
              Delete my account
            </button>
          </form>
        </section>

        <p class="hint">
          <a href="/">← Home</a>
        </p>
      </main>
    </Layout>
  );
}
