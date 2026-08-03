/** @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import { Layout } from "./Layout";
import { AccountShell, type AccountCounts } from "./partials/AccountShell";
import { PasswordField } from "./partials/PasswordField";
import { SiteHeader } from "./partials/SiteHeader";
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

/** Signed-out auth screens keep the marketing chrome so the site nav stays reachable. */
function AuthPage({ title, children }: { title: string; children: Child }) {
  return (
    <Layout title={title} themeToggle="none" bodyClass="with-chrome">
      <SiteHeader />
      <main class="home account-page">{children}</main>
    </Layout>
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
    <AuthPage title={isRegister ? "Register — Webklip" : "Login — Webklip"}>
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
        <PasswordField
          name="password"
          placeholder="Password (8+ chars)"
          required
          minlength={8}
          autocomplete={isRegister ? "new-password" : "current-password"}
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
    </AuthPage>
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
      <AuthPage title="Confirmation link — Webklip">
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
      </AuthPage>
    );
  }

  if (sendFailed) {
    return (
      <AuthPage title="Confirm your email — Webklip">
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
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Confirm your email — Webklip">
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
    </AuthPage>
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
    <AuthPage title="Reset password — Webklip">
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
    </AuthPage>
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
    <AuthPage title="Choose a new password — Webklip">
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
    </AuthPage>
  );
}

interface AccountUserProps {
  user: { id: string; email: string; name: string | null };
  counts?: AccountCounts;
}

interface AccountTeamsPageProps extends AccountUserProps {
  teams: { id: string; slug: string; name: string; role: string }[];
}

export function AccountTeamsPage({ user, teams, counts }: AccountTeamsPageProps) {
  return (
    <AccountShell
      user={user}
      tab="teams"
      title="Teams"
      subtitle="Shared spaces with vanity clip URLs like /team/your-clip."
      counts={counts}
    >
      <section class="account-card">
        <h2>Your teams</h2>
        <p class="account-card-sub">
          Members can open and edit team clips; viewers get read-only access.
        </p>
        <div class="account-card-body">
          {teams.length === 0 ? (
            <p class="account-empty">
              <strong>No teams yet</strong>
              Create one below to share a named clip space with other people.
            </p>
          ) : (
            <ul class="team-list">
              {teams.map((t) => (
                <li class="team-member">
                  <span>
                    <a href={`/teams/${t.slug}`}>{t.name}</a>{" "}
                    <code>/{t.slug}</code>
                  </span>
                  <span class="badge">{t.role}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section class="account-card">
        <h2>Create a team</h2>
        <p class="account-card-sub">
          The slug becomes the first part of every team clip URL.
        </p>
        <div class="account-card-body">
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
            <button type="submit" class="btn btn-primary">
              Create team
            </button>
          </form>
        </div>
      </section>
    </AccountShell>
  );
}

interface AccountDeveloperPageProps extends AccountUserProps {
  apiKeys: { id: string; name: string | null; createdAt: number }[];
  notice?: string;
}

export function AccountDeveloperPage({
  user,
  apiKeys,
  counts,
  notice,
}: AccountDeveloperPageProps) {
  return (
    <AccountShell
      user={user}
      tab="developer"
      title="Developer"
      subtitle="Keys for the REST API and scripts."
      counts={counts}
    >
      {notice && <p class="success">{notice}</p>}

      <section class="account-card">
        <h2>Create an API key</h2>
        <p class="account-card-sub">
          Send it as <code>Authorization: Bearer webklip_…</code>. The key is shown once.
        </p>
        <div class="account-card-body">
          <form
            hx-post="/account/api-keys"
            hx-target="#new-key-panel"
            hx-swap="innerHTML"
            class="inline-form"
          >
            <input type="text" name="name" placeholder="Key name" class="slug-input" />
            <button type="submit" class="btn btn-primary">
              Create key
            </button>
          </form>
          <div id="new-key-panel"></div>
        </div>
      </section>

      <section class="account-card">
        <h2>Your keys</h2>
        <div class="account-card-body">
          {apiKeys.length === 0 ? (
            <p class="account-empty">
              <strong>No API keys</strong>
              Create one above to use Webklip from scripts and automation.
            </p>
          ) : (
            <ul class="team-list">
              {apiKeys.map((k) => (
                <li class="team-member">
                  <span>
                    {k.name ?? "default"}{" "}
                    <span class="muted">
                      added {new Date(k.createdAt * 1000).toLocaleDateString()}
                    </span>
                  </span>
                  <form method="post" action={`/account/api-keys/${k.id}/delete`}>
                    <button type="submit" class="btn btn-ghost btn-small">
                      Delete
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </AccountShell>
  );
}

interface AccountSettingsPageProps extends AccountUserProps {
  deleteError?: string;
  error?: string;
  notice?: string;
  /** False for OAuth-only accounts, which set a first password instead. */
  hasPassword?: boolean;
  emailChangeAvailable?: boolean;
}

export function AccountSettingsPage({
  user,
  deleteError,
  error,
  notice,
  hasPassword = true,
  emailChangeAvailable = false,
  counts,
}: AccountSettingsPageProps) {
  return (
    <AccountShell
      user={user}
      tab="settings"
      title="Settings"
      subtitle="Your profile, sign-in, sessions, and account removal."
      counts={counts}
    >
      {error && <p class="pin-error">{error}</p>}
      {notice && <p class="success">{notice}</p>}

      <section class="account-card">
        <h2>Profile</h2>
        <p class="account-card-sub">The name shown on clips you author.</p>
        <div class="account-card-body">
          <form method="post" action="/account/profile" class="inline-form">
            <input
              type="text"
              name="name"
              value={user.name ?? ""}
              placeholder="Display name"
              maxlength={64}
              class="slug-input"
              required
            />
            <button type="submit" class="btn btn-primary">
              Save name
            </button>
          </form>
        </div>
      </section>

      <section class="account-card">
        <h2>{hasPassword ? "Change password" : "Set a password"}</h2>
        <p class="account-card-sub">
          {hasPassword
            ? "Signs out every other device. This one stays signed in."
            : "You signed up with Google or GitHub. Adding a password lets you sign in with your email as well."}
        </p>
        <div class="account-card-body">
          <form method="post" action="/account/password" class="home-form">
            {hasPassword && (
              <PasswordField
                name="current_password"
                placeholder="Current password"
                autocomplete="current-password"
                required
              />
            )}
            <PasswordField
              name="new_password"
              placeholder="New password (min 8 characters)"
              autocomplete="new-password"
              minlength={8}
              required
            />
            <PasswordField
              name="confirm_password"
              placeholder="Repeat new password"
              autocomplete="new-password"
              required
            />
            <button type="submit" class="btn btn-primary">
              {hasPassword ? "Change password" : "Set password"}
            </button>
          </form>
        </div>
      </section>

      <section class="account-card">
        <h2>Email address</h2>
        {emailChangeAvailable ? (
          <>
            <p class="account-card-sub">
              Currently <strong>{user.email}</strong>. A confirmation link goes to the new
              address — nothing changes until you follow it.
            </p>
            <div class="account-card-body">
              <form method="post" action="/account/email" class="home-form">
                <input
                  type="email"
                  name="email"
                  placeholder="New email address"
                  class="slug-input"
                  required
                />
                {hasPassword && (
                  <PasswordField
                    name="password"
                    placeholder="Current password"
                    autocomplete="current-password"
                    required
                  />
                )}
                <button type="submit" class="btn btn-primary">
                  Send confirmation
                </button>
              </form>
            </div>
          </>
        ) : (
          <div class="account-card-body">
            <p class="account-card-sub">
              Currently <strong>{user.email}</strong>. Changing it needs email delivery,
              which this instance has not configured.
            </p>
          </div>
        )}
      </section>

      <section class="account-card">
        <h2>Sessions</h2>
        <p class="account-card-sub">
          Sessions expire 30 days after sign-in. Sign out everywhere if you used a shared
          device or think a session was copied.
        </p>
        <div class="account-card-body account-actions">
          <form method="post" action="/logout">
            <button type="submit" class="btn btn-ghost">
              Logout
            </button>
          </form>
          <form method="post" action="/account/logout-all">
            <button type="submit" class="btn btn-ghost">
              Sign out everywhere
            </button>
          </form>
        </div>
      </section>

      <section class="account-card account-card--danger">
        <h2>Delete account</h2>
        <p class="account-card-sub">
          Permanently removes your account, API keys, teams you own, and every clip you
          created — including uploaded files. This cannot be undone.
        </p>
        {deleteError && <p class="pin-error">{deleteError}</p>}
        <form method="post" action="/account/delete" class="home-form account-card-body">
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
    </AccountShell>
  );
}

