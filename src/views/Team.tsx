/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";
import type { TeamRole } from "../db/schema";

interface Member {
  userId: string;
  email: string;
  name: string | null;
  role: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: number;
}

interface TeamPageProps {
  team: { slug: string; name: string; ownerId: string };
  viewer: { id: string; role: TeamRole };
  members: Member[];
  invites: PendingInvite[];
  /** Shown once, right after an invite is created, so it can be shared by hand. */
  inviteLink?: string;
  inviteEmailed?: boolean;
  /** A mailer is configured but the send failed, as opposed to none being set. */
  inviteEmailFailed?: boolean;
  error?: string;
  notice?: string;
}

export function TeamPage({
  team,
  viewer,
  members,
  invites,
  inviteLink,
  inviteEmailed,
  inviteEmailFailed,
  error,
  notice,
}: TeamPageProps) {
  const isAdmin = viewer.role === "owner" || viewer.role === "admin";
  const isOwner = viewer.role === "owner";

  return (
    <Layout title={`Team ${team.name} — Webklip`}>
      <main class="home account-page">
        <h1>{team.name}</h1>
        <p class="tagline">
          Vanity clips: <code>/{team.slug}/your-clip</code>
        </p>

        {error && <p class="pin-error">{error}</p>}
        {notice && <p class="success">{notice}</p>}

        {viewer.role !== "viewer" && (
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
        )}

        <section class="account-section">
          <h2>Members</h2>
          <ul class="team-list">
            {members.map((m) => (
              <li class="team-member">
                <span>
                  {m.name ? `${m.name} · ` : ""}
                  {m.email} <span class="badge">{m.role}</span>
                  {m.userId === viewer.id && <span class="muted"> (you)</span>}
                </span>
                {isAdmin && m.role !== "owner" && m.userId !== viewer.id && (
                  <form
                    method="post"
                    action={`/teams/${team.slug}/members/${m.userId}/remove`}
                  >
                    <button type="submit" class="btn btn-ghost btn-small">
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>

        {isAdmin && (
          <section class="account-section">
            <h2>Invite someone</h2>
            {inviteLink && (
              <div class="key-reveal">
                <p class={inviteEmailFailed ? "pin-error" : "success"}>
                  {inviteEmailed
                    ? "Invite sent. You can also share this link directly:"
                    : inviteEmailFailed
                      ? "Invite created, but the email failed to go out. Share this link instead:"
                      : "Invite created. Share this link — it was not emailed because no mailer is configured:"}
                </p>
                <code class="api-key-code">{inviteLink}</code>
              </div>
            )}
            <form method="post" action={`/teams/${team.slug}/invites`} class="home-form">
              <input
                type="email"
                name="email"
                placeholder="Email address"
                class="slug-input"
                required
              />
              <select name="role" class="slug-input">
                <option value="member">Member — can read and write clips</option>
                <option value="admin">Admin — can also manage members</option>
                <option value="viewer">Viewer — read only</option>
              </select>
              <button type="submit" class="btn btn-primary">
                Send invite
              </button>
            </form>

            {invites.length > 0 && (
              <>
                <h3>Pending invites</h3>
                <ul class="team-list">
                  {invites.map((i) => (
                    <li class="team-member">
                      <span>
                        {i.email} <span class="badge">{i.role}</span>{" "}
                        <span class="muted">
                          expires {new Date(i.expiresAt * 1000).toLocaleDateString()}
                        </span>
                      </span>
                      <form
                        method="post"
                        action={`/teams/${team.slug}/invites/${i.id}/revoke`}
                      >
                        <button type="submit" class="btn btn-ghost btn-small">
                          Revoke
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {!isOwner && (
          <section class="account-section">
            <form method="post" action={`/teams/${team.slug}/leave`}>
              <button type="submit" class="btn btn-ghost">
                Leave this team
              </button>
            </form>
          </section>
        )}

        <p class="hint">
          <a href="/account">← Account</a>
        </p>
      </main>
    </Layout>
  );
}

interface InvitePageProps {
  teamName?: string;
  invitedEmail?: string;
  state: "accepted" | "invalid" | "wrong-account" | "needs-login";
  token?: string;
  teamSlug?: string;
}

export function TeamInvitePage({
  teamName,
  state,
  token,
  teamSlug,
}: InvitePageProps) {
  return (
    <Layout title="Team invite — Webklip">
      <main class="home account-page">
        {state === "accepted" && (
          <>
            <h1>Welcome to {teamName}</h1>
            <p class="success">You're now a member of this team.</p>
            <p class="hint">
              <a href={`/teams/${teamSlug}`}>Open the team →</a>
            </p>
          </>
        )}

        {state === "invalid" && (
          <>
            <h1>Invite no longer valid</h1>
            <p class="pin-error">
              This invite link is invalid, already used, or expired. Ask a team admin
              to send a new one.
            </p>
            <p class="hint">
              <a href="/account">← Account</a>
            </p>
          </>
        )}

        {state === "wrong-account" && (
          <>
            <h1>Wrong account</h1>
            <p class="pin-error">
              This invite was issued for a different email address. Sign in with the
              account it was sent to, then open the link again.
            </p>
            <form method="post" action="/logout">
              <button type="submit" class="btn btn-ghost">
                Sign out
              </button>
            </form>
          </>
        )}

        {state === "needs-login" && (
          <>
            <h1>You've been invited to {teamName}</h1>
            <p class="hint">
              Sign in — or create an account with the address the invite was sent to —
              and you'll join the team automatically.
            </p>
            <p class="hint">
              <a href={`/login?next=${encodeURIComponent(`/teams/invite/${token}`)}`}>
                Sign in
              </a>
              {" · "}
              <a
                href={`/register?next=${encodeURIComponent(`/teams/invite/${token}`)}`}
              >
                Create account
              </a>
            </p>
          </>
        )}
      </main>
    </Layout>
  );
}
