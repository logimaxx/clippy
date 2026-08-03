/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";
import { AccountShell, type AccountCounts } from "./partials/AccountShell";
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

/** `owner` is absent on purpose: it moves only through an ownership transfer. */
const ASSIGNABLE_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

interface TeamPageProps {
  team: { slug: string; name: string; ownerId: string };
  viewer: { id: string; role: TeamRole };
  user: { id: string; email: string; name: string | null };
  counts?: AccountCounts;
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
  user,
  counts,
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
  const transferCandidates = members.filter((m) => m.userId !== team.ownerId);

  return (
    <AccountShell
      user={user}
      tab="teams"
      title={team.name}
      subtitle={`Team clips live at /${team.slug}/your-clip · you are ${viewer.role}`}
      counts={counts}
      actions={
        <a href={`/account?team=${encodeURIComponent(team.slug)}`} class="btn btn-ghost">
          View team clips
        </a>
      }
    >
      {error && <p class="pin-error">{error}</p>}
      {notice && <p class="success">{notice}</p>}

      {viewer.role !== "viewer" && (
        <section class="account-card">
          <h2>New team clip</h2>
          <p class="account-card-sub">
            Pick a name — the clip opens at <code>/{team.slug}/name</code>.
          </p>
          <div class="account-card-body">
            <form
              action={`/${team.slug}/new-clip`}
              method="post"
              class="home-form home-form--row"
            >
              <div class="my-clips-create-row">
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
              </div>
            </form>
          </div>
        </section>
      )}

      <section class="account-card">
        <h2>Members</h2>
        <p class="account-card-sub">
          Admins manage members; viewers get read-only access to team clips.
        </p>
        <div class="account-card-body">
          <ul class="team-list">
            {members.map((m) => (
              <li class="team-member">
                <span>
                  {m.name ? `${m.name} · ` : ""}
                  {m.email} <span class="badge">{m.role}</span>
                  {m.userId === viewer.id && <span class="muted"> (you)</span>}
                </span>
                {isAdmin && m.role !== "owner" && m.userId !== viewer.id && (
                  <span class="team-member-actions">
                    <form
                      method="post"
                      action={`/teams/${team.slug}/members/${m.userId}/role`}
                      class="inline-form"
                    >
                      <select name="role" class="slug-input">
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option value={r.value} selected={m.role === r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button type="submit" class="btn btn-ghost btn-small">
                        Save
                      </button>
                    </form>
                    <form
                      method="post"
                      action={`/teams/${team.slug}/members/${m.userId}/remove`}
                    >
                      <button type="submit" class="btn btn-ghost btn-small">
                        Remove
                      </button>
                    </form>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {isAdmin && (
        <section class="account-card">
          <h2>Invite someone</h2>
          <p class="account-card-sub">
            Invites are bound to the address, single-use, and expire in 7 days.
          </p>
          <div class="account-card-body">
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
          </div>
        </section>
      )}

      {isOwner && (
        <section class="account-card">
          <h2>Team settings</h2>
          <p class="account-card-sub">
            The slug <code>/{team.slug}</code> is fixed — every team clip URL is built
            from it.
          </p>
          <div class="account-card-body">
            <form
              method="post"
              action={`/teams/${team.slug}/settings`}
              class="inline-form"
            >
              <input
                type="text"
                name="name"
                value={team.name}
                placeholder="Team name"
                minlength={2}
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
      )}

      {isOwner && transferCandidates.length > 0 && (
        <section class="account-card">
          <h2>Transfer ownership</h2>
          <p class="account-card-sub">
            The new owner takes over the team and you become an admin. Only the owner can
            transfer or delete a team.
          </p>
          <div class="account-card-body">
            <form method="post" action={`/teams/${team.slug}/transfer`} class="home-form">
              <select name="user_id" class="slug-input" required>
                {transferCandidates.map((m) => (
                  <option value={m.userId}>{m.name ? `${m.name} · ${m.email}` : m.email}</option>
                ))}
              </select>
              <button type="submit" class="btn btn-danger">
                Transfer team
              </button>
            </form>
          </div>
        </section>
      )}

      {isOwner && (
        <section class="account-card account-card--danger">
          <h2>Delete this team</h2>
          <p class="account-card-sub">
            Permanently removes the team, every clip under <code>/{team.slug}/</code>{" "}
            including uploaded files, its members, and any pending invites. This cannot be
            undone.
          </p>
          <form method="post" action={`/teams/${team.slug}/delete`} class="home-form account-card-body">
            <input
              type="text"
              name="confirm_slug"
              placeholder={`Type ${team.slug} to confirm`}
              class="slug-input"
              required
            />
            <button type="submit" class="btn btn-danger">
              Delete team
            </button>
          </form>
        </section>
      )}

      {!isOwner && (
        <section class="account-card account-card--danger">
          <h2>Leave this team</h2>
          <p class="account-card-sub">
            You lose access to team clips. An admin can invite you again later.
          </p>
          <div class="account-card-body">
            <form method="post" action={`/teams/${team.slug}/leave`}>
              <button type="submit" class="btn btn-danger">
                Leave team
              </button>
            </form>
          </div>
        </section>
      )}
    </AccountShell>
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
              <a href="/account/teams">← Teams</a>
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
