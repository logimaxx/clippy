/** @jsxImportSource hono/jsx */
import { Hono, type Context } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { teams, teamMembers, users } from "../db/schema";
import {
  resolveAuth,
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  bumpSessionVersion,
  getUserByEmail,
  createApiKeyRaw,
  hashApiKey,
} from "../lib/session";
import {
  canAttemptLogin,
  recordLoginFailure,
  clearLoginFailures,
  canConfirmPassword,
  canRegister,
  canRequestEmailChange,
  canRequestPasswordReset,
  clearPasswordConfirmFailures,
  recordPasswordConfirmFailure,
} from "../lib/auth-throttle";
import { deleteUserAccount } from "../lib/account-delete";
import { isMailerConfigured, mailerRecentlyFailed, sendMail } from "../lib/mailer";
import {
  consumeVerificationToken,
  isEmailVerificationRequired,
  markEmailVerified,
  sendVerificationEmail,
} from "../lib/email-verification";
import {
  consumeResetToken,
  createResetToken,
  invalidateResetTokens,
  isResetTokenValid,
  resetUrl,
} from "../lib/password-reset";
import {
  addTeamMember,
  getMemberRole,
  getTeamById,
  getTeamBySlug,
  isAdminRole,
  listTeamMembers,
  listUserTeams,
  removeTeamMember,
  renameTeam,
  transferTeamOwnership,
  updateTeamMemberRole,
} from "../lib/teams";
import { deleteTeam } from "../lib/team-delete";
import {
  consumeEmailChange,
  createEmailChange,
  isEmailChangeAvailable,
  sendEmailChangeEmail,
} from "../lib/email-change";
import {
  consumeInvite,
  createInvite,
  findInviteByToken,
  inviteUrl,
  isInvitableRole,
  listPendingInvites,
  revokeInvite,
  sendInviteEmail,
} from "../lib/team-invites";
import { isReservedSlug, safeNext } from "../lib/constants";
import { apiKeys, type TeamRole } from "../db/schema";
import {
  AccountDeveloperPage,
  AccountSettingsPage,
  AccountTeamsPage,
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from "../views/Account";
import { MyClipsPage, type ClipsDensity, type MyClipsFilters } from "../views/MyClips";
import { TeamInvitePage, TeamPage } from "../views/Team";
import { enabledOauthProviders } from "../lib/oauth";
import { countOwnedClips, listOwnedClips } from "../store/clips";
import { getCookie, setCookie } from "hono/cookie";
import type { AccountCounts } from "../views/partials/AccountShell";

const account = new Hono();

/** Sidebar counts, so each section says how much is in it. */
async function accountCounts(userId: string): Promise<AccountCounts> {
  const [clips, userTeams, keys] = await Promise.all([
    countOwnedClips(userId),
    listUserTeams(userId),
    db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId)),
  ]);
  return { clips, teams: userTeams.length, apiKeys: keys.length };
}

const DENSITY_COOKIE = "webklip_clips_density";

function parseDensity(raw: string | undefined | null): ClipsDensity {
  return raw === "cards" ? "cards" : "list";
}

function resolveDensity(c: Context, queryValue: string | undefined): ClipsDensity {
  const fromQuery = queryValue === "list" || queryValue === "cards" ? queryValue : null;
  if (fromQuery) {
    setCookie(c, DENSITY_COOKIE, fromQuery, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "Lax",
      httpOnly: false,
    });
    return fromQuery;
  }
  return parseDensity(getCookie(c, DENSITY_COOKIE));
}

function parseMyClipsFilters(c: Context): MyClipsFilters {
  const teamRaw = (c.req.query("team") ?? "all").trim();
  const team =
    teamRaw === "personal" || /^[a-z0-9-]{2,32}$/.test(teamRaw) ? teamRaw : "all";
  const visibilityRaw = c.req.query("visibility") ?? "all";
  const visibility =
    visibilityRaw === "private" || visibilityRaw === "public" ? visibilityRaw : "all";
  return {
    team: team as MyClipsFilters["team"],
    visibility,
    expiringSoon: c.req.query("soon") === "1",
    density: resolveDensity(c, c.req.query("density")),
  };
}

const LOGIN_NOTICES: Record<string, string> = {
  deleted: "Your account and everything in it have been deleted.",
  "signed-out": "Signed out of every device.",
  "password-changed": "Password updated. Sign in with your new password.",
  "email-verified": "Email confirmed. You can sign in now.",
  "email-changed": "Email address updated. Sign in with your new address.",
};

/**
 * Settings outcomes travel as fixed keys rather than free text, so the query
 * string can never put words of its own on the page.
 */
const SETTINGS_NOTICES: Record<string, string> = {
  "name-updated": "Display name updated.",
  "password-changed": "Password updated. Every other device has been signed out.",
  "password-set": "Password set. You can now sign in with an email and password.",
  "email-pending": "Check the new address for a confirmation link.",
  "email-changed": "Email address updated.",
  "key-deleted": "API key deleted.",
};

const SETTINGS_ERRORS: Record<string, string> = {
  "name-invalid": "Display name must be 1–64 characters.",
  "password-short": "New password must be at least 8 characters.",
  "password-mismatch": "The two new passwords do not match.",
  "password-wrong": "Incorrect current password.",
  "email-invalid": "Enter a valid email address.",
  "email-same": "That is already your email address.",
  "email-taken": "That address was claimed before you confirmed. Try another.",
  "email-throttled": "Too many change requests. Try again later.",
  "password-throttled": "Too many incorrect passwords. Try again in a few minutes.",
  "email-token": "That confirmation link is invalid or has expired.",
};

function settingsRedirect(c: Context, kind: "notice" | "error", key: string) {
  return c.redirect(`/account/settings?${kind}=${key}`, 302);
}

account.get("/login", (c) =>
  c.html(
    <LoginPage
      notice={LOGIN_NOTICES[c.req.query("notice") ?? ""]}
      oauthProviders={enabledOauthProviders()}
      resetEnabled={isMailerConfigured()}
      next={safeNext(c.req.query("next"))}
    />
  )
);

account.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = typeof body.email === "string" ? body.email.toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const headers = c.req.raw.headers;

  if (!canAttemptLogin(headers, email)) {
    return c.html(
      <LoginPage
        error="Too many failed attempts. Try again in 15 minutes."
        oauthProviders={enabledOauthProviders()}
        resetEnabled={isMailerConfigured()}
        next={safeNext(body.next)}
      />,
      429
    );
  }

  const user = await getUserByEmail(email);
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    recordLoginFailure(headers, email);
    return c.html(
      <LoginPage
        error="Invalid email or password"
        oauthProviders={enabledOauthProviders()}
        resetEnabled={isMailerConfigured()}
        next={safeNext(body.next)}
      />,
      401
    );
  }

  clearLoginFailures(headers, email);

  if (isEmailVerificationRequired() && !user.emailVerifiedAt) {
    return c.html(<VerifyEmailPage email={email} pending />, 403);
  }

  setSessionCookie(c, user.id, user.sessionVersion);
  return c.redirect(safeNext(body.next) ?? "/account", 302);
});

account.get("/register", (c) =>
  c.html(
    <LoginPage
      mode="register"
      oauthProviders={enabledOauthProviders()}
      next={safeNext(c.req.query("next"))}
    />
  )
);

account.post("/register", async (c) => {
  const body = await c.req.parseBody();
  const email = typeof body.email === "string" ? body.email.toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name : "";

  if (!canRegister(c.req.raw.headers)) {
    return c.html(
      <LoginPage
        mode="register"
        error="Too many accounts created from this network. Try again later."
        oauthProviders={enabledOauthProviders()}
      />,
      429
    );
  }

  if (!email.includes("@") || password.length < 8) {
    return c.html(
      <LoginPage
        mode="register"
        error="Valid email and password (8+ chars) required"
        oauthProviders={enabledOauthProviders()}
      />,
      400
    );
  }

  if (await getUserByEmail(email)) {
    return c.html(
      <LoginPage
        mode="register"
        error="Email already registered"
        oauthProviders={enabledOauthProviders()}
      />,
      409
    );
  }

  const id = crypto.randomUUID();
  const needsVerification = isEmailVerificationRequired();
  await db.insert(users).values({
    id,
    email,
    name: name || null,
    passwordHash: await hashPassword(password),
    emailVerifiedAt: needsVerification ? null : Math.floor(Date.now() / 1000),
  });

  if (needsVerification) {
    // The account is already in the database, so a delivery failure is worth
    // saying out loud — there is no existence to hide at this point.
    const sent = await sendVerificationEmail(id, email);
    if (!sent) return c.html(<VerifyEmailPage email={email} sendFailed />, 502);
    return c.html(<VerifyEmailPage email={email} />);
  }

  setSessionCookie(c, id);
  return c.redirect(safeNext(body.next) ?? "/account", 302);
});

account.get("/verify-email/:token", async (c) => {
  if (!isEmailVerificationRequired()) return c.notFound();

  const userId = await consumeVerificationToken(c.req.param("token"));
  if (!userId) return c.html(<VerifyEmailPage invalid />, 400);

  return c.redirect("/login?notice=email-verified", 302);
});

account.post("/verify-email/resend", async (c) => {
  if (!isEmailVerificationRequired()) return c.notFound();

  const body = await c.req.parseBody();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email.includes("@")) {
    return c.html(<VerifyEmailPage error="Enter a valid email address." />, 400);
  }

  if (!canRequestPasswordReset(c.req.raw.headers, email)) {
    return c.html(<VerifyEmailPage error="Too many requests. Try again later." />, 429);
  }

  const user = await getUserByEmail(email);
  if (user && !user.emailVerifiedAt) {
    await sendVerificationEmail(user.id, user.email);
  }

  // Same answer whether or not the address is waiting on a confirmation. The
  // outage warning is global, so it does not turn into an existence oracle.
  return c.html(
    <VerifyEmailPage email={email} resent mailerDown={mailerRecentlyFailed()} />
  );
});

account.get("/forgot-password", (c) => {
  if (!isMailerConfigured()) return c.notFound();
  return c.html(<ForgotPasswordPage />);
});

account.post("/forgot-password", async (c) => {
  if (!isMailerConfigured()) return c.notFound();

  const body = await c.req.parseBody();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email.includes("@")) {
    return c.html(<ForgotPasswordPage error="Enter a valid email address." />, 400);
  }

  if (!canRequestPasswordReset(c.req.raw.headers, email)) {
    return c.html(
      <ForgotPasswordPage error="Too many reset requests. Try again later." />,
      429
    );
  }

  const user = await getUserByEmail(email);
  // A password-less account is OAuth-only; sending a reset link would let email
  // access alone bypass the provider.
  if (user?.passwordHash) {
    const token = await createResetToken(user.id);
    await sendMail({
      to: user.email,
      subject: "Reset your Webklip password",
      text: [
        "Someone asked to reset the password for your Webklip account.",
        "",
        `Open this link to choose a new one: ${resetUrl(token)}`,
        "",
        "The link works once and expires in one hour.",
        "If this wasn't you, ignore this email — your password stays unchanged.",
      ].join("\n"),
    });
  }

  // The same response either way, so the form cannot confirm who has an account.
  return c.html(<ForgotPasswordPage sent mailerDown={mailerRecentlyFailed()} />);
});

account.get("/reset-password/:token", async (c) => {
  if (!isMailerConfigured()) return c.notFound();

  const token = c.req.param("token");
  if (!(await isResetTokenValid(token))) {
    return c.html(<ResetPasswordPage invalid />, 400);
  }
  return c.html(<ResetPasswordPage token={token} />);
});

account.post("/reset-password/:token", async (c) => {
  if (!isMailerConfigured()) return c.notFound();

  const token = c.req.param("token");
  const body = await c.req.parseBody();
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.password_confirm === "string" ? body.password_confirm : "";

  if (password.length < 8) {
    return c.html(
      <ResetPasswordPage token={token} error="Password must be at least 8 characters." />,
      400
    );
  }
  if (password !== confirm) {
    return c.html(
      <ResetPasswordPage token={token} error="The two passwords do not match." />,
      400
    );
  }

  const userId = await consumeResetToken(token);
  if (!userId) return c.html(<ResetPasswordPage invalid />, 400);

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, userId));

  // Completing a reset proves control of the inbox, which is all verification
  // asks for — no point sending a second email.
  await markEmailVerified(userId);
  await invalidateResetTokens(userId);
  // Anyone holding a stolen session loses it along with the old password.
  await bumpSessionVersion(userId);
  clearSessionCookie(c);

  return c.redirect("/login?notice=password-changed", 302);
});

account.post("/logout", async (c) => {
  clearSessionCookie(c);
  return c.redirect("/", 302);
});

account.post("/account/logout-all", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.redirect("/login", 302);

  await bumpSessionVersion(user.id);
  clearSessionCookie(c);
  return c.redirect("/login?notice=signed-out", 302);
});

account.post("/account/delete", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.redirect("/login", 302);

  const body = await c.req.parseBody();
  const confirmEmail =
    typeof body.confirm_email === "string" ? body.confirm_email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const row = rows[0];
  if (!row) return c.redirect("/login", 302);

  const renderError = async (error: string) =>
    c.html(
      <AccountSettingsPage
        user={user}
        deleteError={error}
        counts={await accountCounts(user.id)}
        hasPassword={!!row.passwordHash}
        emailChangeAvailable={isEmailChangeAvailable()}
      />,
      400
    );

  if (confirmEmail !== row.email) {
    return renderError("Type your email address exactly to confirm deletion.");
  }

  // OAuth-only accounts have no password to check — the email confirmation and
  // the session are the proof of ownership.
  if (row.passwordHash && !(await verifyPassword(password, row.passwordHash))) {
    return renderError("Incorrect password.");
  }

  await deleteUserAccount(user.id);
  clearSessionCookie(c);
  return c.redirect("/login?notice=deleted", 302);
});

account.get("/account", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.redirect("/login", 302);

  const filters = parseMyClipsFilters(c);
  const [userTeams, clips, counts] = await Promise.all([
    listUserTeams(user.id),
    listOwnedClips(user.id, {
      team: filters.team,
      visibility: filters.visibility,
      expiringSoon: filters.expiringSoon,
    }),
    accountCounts(user.id),
  ]);

  return c.html(
    <MyClipsPage
      user={user}
      clips={clips}
      teams={userTeams}
      filters={filters}
      counts={counts}
      createError={c.req.query("create_error")}
      createSlug={c.req.query("create_slug")}
      createNotice={c.req.query("notice")}
    />
  );
});

account.get("/account/teams", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.redirect("/login", 302);
  const [userTeams, counts] = await Promise.all([
    listUserTeams(user.id),
    accountCounts(user.id),
  ]);
  return c.html(<AccountTeamsPage user={user} teams={userTeams} counts={counts} />);
});

account.get("/account/settings", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.redirect("/login", 302);

  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return c.html(
    <AccountSettingsPage
      user={user}
      counts={await accountCounts(user.id)}
      hasPassword={!!rows[0]?.passwordHash}
      emailChangeAvailable={isEmailChangeAvailable()}
      notice={SETTINGS_NOTICES[c.req.query("notice") ?? ""]}
      error={SETTINGS_ERRORS[c.req.query("error") ?? ""]}
    />
  );
});

account.post("/account/profile", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.redirect("/login", 302);

  const body = await c.req.parseBody();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 64) {
    return settingsRedirect(c, "error", "name-invalid");
  }

  await db.update(users).set({ name }).where(eq(users.id, user.id));
  return settingsRedirect(c, "notice", "name-updated");
});

account.post("/account/password", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.redirect("/login", 302);

  const body = await c.req.parseBody();
  const current = typeof body.current_password === "string" ? body.current_password : "";
  const next = typeof body.new_password === "string" ? body.new_password : "";
  const confirm = typeof body.confirm_password === "string" ? body.confirm_password : "";

  const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const row = rows[0];
  if (!row) return c.redirect("/login", 302);

  if (next.length < 8) return settingsRedirect(c, "error", "password-short");
  if (next !== confirm) return settingsRedirect(c, "error", "password-mismatch");

  // OAuth-only accounts have no password to prove; holding the session is what
  // authorises setting a first one.
  const hadPassword = !!row.passwordHash;
  if (hadPassword) {
    if (!canConfirmPassword(user.id)) {
      return settingsRedirect(c, "error", "password-throttled");
    }
    if (!(await verifyPassword(current, row.passwordHash))) {
      recordPasswordConfirmFailure(user.id);
      return settingsRedirect(c, "error", "password-wrong");
    }
    clearPasswordConfirmFailures(user.id);
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, user.id));
  await invalidateResetTokens(user.id);

  // Other devices lose their session, but the tab making the change keeps one:
  // being signed out of the page you just used is a surprise, not a safeguard.
  const version = await bumpSessionVersion(user.id);
  setSessionCookie(c, user.id, version);

  return settingsRedirect(c, "notice", hadPassword ? "password-changed" : "password-set");
});

account.post("/account/email", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.redirect("/login", 302);
  if (!isEmailChangeAvailable()) return c.notFound();

  const body = await c.req.parseBody();
  const newEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const row = rows[0];
  if (!row) return c.redirect("/login", 302);

  if (!newEmail.includes("@")) return settingsRedirect(c, "error", "email-invalid");
  if (newEmail === row.email) return settingsRedirect(c, "error", "email-same");

  if (row.passwordHash) {
    if (!canConfirmPassword(user.id)) {
      return settingsRedirect(c, "error", "password-throttled");
    }
    if (!(await verifyPassword(password, row.passwordHash))) {
      recordPasswordConfirmFailure(user.id);
      return settingsRedirect(c, "error", "password-wrong");
    }
    clearPasswordConfirmFailures(user.id);
  }

  if (!canRequestEmailChange(user.id, newEmail)) {
    return settingsRedirect(c, "error", "email-throttled");
  }

  // An address that already has an account produces the same answer as a free
  // one, so this form cannot be used to find out who is registered.
  const taken = await getUserByEmail(newEmail);
  if (!taken) {
    const token = await createEmailChange(user.id, newEmail);
    await sendEmailChangeEmail(newEmail, token);
  }

  return settingsRedirect(c, "notice", "email-pending");
});

account.get("/account/email/confirm/:token", async (c) => {
  const result = await consumeEmailChange(c.req.param("token"));
  const user = await resolveAuth(c);

  // The link may well be opened in the browser that reads the new mailbox
  // rather than the one holding the session.
  if (!user) {
    return c.redirect(result.ok ? "/login?notice=email-changed" : "/login", 302);
  }
  if (!result.ok) {
    return settingsRedirect(c, "error", result.reason === "taken" ? "email-taken" : "email-token");
  }
  return settingsRedirect(c, "notice", "email-changed");
});

account.get("/account/developer", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.redirect("/login", 302);
  const [keys, counts] = await Promise.all([
    db
      .select({ id: apiKeys.id, name: apiKeys.name, createdAt: apiKeys.createdAt })
      .from(apiKeys)
      .where(eq(apiKeys.userId, user.id)),
    accountCounts(user.id),
  ]);
  return c.html(
    <AccountDeveloperPage
      user={user}
      apiKeys={keys}
      counts={counts}
      notice={SETTINGS_NOTICES[c.req.query("notice") ?? ""]}
    />
  );
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

account.post("/account/api-keys/:id/delete", async (c) => {
  const user = await resolveAuth(c);
  if (!user) return c.redirect("/login", 302);

  await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, c.req.param("id")), eq(apiKeys.userId, user.id)));
  return c.redirect("/account/developer?notice=key-deleted", 302);
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

  // A team slug owns the `/{team}/{clip}` namespace, so it must not shadow a
  // built-in route or an SEO landing page.
  if (isReservedSlug(slug)) {
    return c.text("That team slug is reserved", 409);
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

/**
 * Resolves the team behind a slug together with the caller's role. Returns null
 * for non-members so the caller can answer 404 — a team's existence and its
 * member list are both private.
 */
async function resolveTeamAccess(c: Context, slug: string) {
  const user = await resolveAuth(c);
  if (!user) return { user: null, team: null, role: null };

  const team = await getTeamBySlug(slug);
  if (!team) return { user, team: null, role: null };

  const role = await getMemberRole(team.id, user.id);
  if (!role) return { user, team: null, role: null };

  return { user, team, role };
}

async function renderTeamPage(
  c: Context,
  slug: string,
  extra: {
    inviteLink?: string;
    inviteEmailed?: boolean;
    inviteEmailFailed?: boolean;
    error?: string;
    notice?: string;
    status?: 200 | 400 | 403;
  } = {}
) {
  const { user, team, role } = await resolveTeamAccess(c, slug);
  if (!user) return c.redirect("/login", 302);
  if (!team || !role) return c.notFound();

  const [members, invites, counts] = await Promise.all([
    listTeamMembers(team.id),
    isAdminRole(role) ? listPendingInvites(team.id) : Promise.resolve([]),
    accountCounts(user.id),
  ]);

  return c.html(
    <TeamPage
      team={team}
      viewer={{ id: user.id, role }}
      user={user}
      counts={counts}
      members={members}
      invites={invites}
      inviteLink={extra.inviteLink}
      inviteEmailed={extra.inviteEmailed}
      inviteEmailFailed={extra.inviteEmailFailed}
      error={extra.error}
      notice={extra.notice}
    />,
    extra.status ?? 200
  );
}

account.get("/teams/invite/:token", async (c) => {
  const token = c.req.param("token");
  const invite = await findInviteByToken(token);
  if (!invite) return c.html(<TeamInvitePage state="invalid" />, 400);

  const team = await getTeamById(invite.teamId);
  if (!team) return c.html(<TeamInvitePage state="invalid" />, 400);

  const user = await resolveAuth(c);
  if (!user) {
    return c.html(
      <TeamInvitePage state="needs-login" teamName={team.name} token={token} />
    );
  }

  // Bound to the address it was sent to, so a forwarded link is useless to
  // anyone else.
  if (user.email !== invite.email) {
    return c.html(<TeamInvitePage state="wrong-account" />, 403);
  }

  const consumed = await consumeInvite(token);
  if (!consumed) return c.html(<TeamInvitePage state="invalid" />, 400);

  await addTeamMember(consumed.teamId, user.id, consumed.role as TeamRole);

  return c.html(
    <TeamInvitePage state="accepted" teamName={team.name} teamSlug={team.slug} />
  );
});

account.get("/teams/:slug", (c) => renderTeamPage(c, c.req.param("slug")));

account.post("/teams/:slug/invites", async (c) => {
  const slug = c.req.param("slug");
  const { user, team, role } = await resolveTeamAccess(c, slug);
  if (!user) return c.redirect("/login", 302);
  if (!team || !role) return c.notFound();
  if (!isAdminRole(role)) return c.notFound();

  const body = await c.req.parseBody();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const roleInput = typeof body.role === "string" ? body.role : "member";

  if (!email.includes("@")) {
    return renderTeamPage(c, slug, { error: "Enter a valid email address.", status: 400 });
  }
  if (!isInvitableRole(roleInput)) {
    return renderTeamPage(c, slug, { error: "Pick a valid role.", status: 400 });
  }

  const members = await listTeamMembers(team.id);
  if (members.some((m) => m.email === email)) {
    return renderTeamPage(c, slug, {
      error: "That person is already a member.",
      status: 400,
    });
  }

  const token = await createInvite({
    teamId: team.id,
    email,
    role: roleInput,
    invitedBy: user.id,
  });

  const mailerOn = isMailerConfigured();
  const emailed = mailerOn
    ? await sendInviteEmail({
        email,
        teamName: team.name,
        inviterEmail: user.email,
        token,
      })
    : false;

  return renderTeamPage(c, slug, {
    inviteLink: inviteUrl(token),
    inviteEmailed: emailed,
    inviteEmailFailed: mailerOn && !emailed,
  });
});

account.post("/teams/:slug/invites/:id/revoke", async (c) => {
  const slug = c.req.param("slug");
  const { user, team, role } = await resolveTeamAccess(c, slug);
  if (!user) return c.redirect("/login", 302);
  if (!team || !role || !isAdminRole(role)) return c.notFound();

  await revokeInvite(team.id, c.req.param("id"));
  return c.redirect(`/teams/${slug}`, 302);
});

account.post("/teams/:slug/members/:userId/remove", async (c) => {
  const slug = c.req.param("slug");
  const { user, team, role } = await resolveTeamAccess(c, slug);
  if (!user) return c.redirect("/login", 302);
  if (!team || !role || !isAdminRole(role)) return c.notFound();

  const targetId = c.req.param("userId");
  if (targetId === team.ownerId) {
    return renderTeamPage(c, slug, {
      error: "The team owner cannot be removed.",
      status: 400,
    });
  }

  await removeTeamMember(team.id, targetId);
  return c.redirect(`/teams/${slug}`, 302);
});

account.post("/teams/:slug/members/:userId/role", async (c) => {
  const slug = c.req.param("slug");
  const { user, team, role } = await resolveTeamAccess(c, slug);
  if (!user) return c.redirect("/login", 302);
  if (!team || !role || !isAdminRole(role)) return c.notFound();

  const targetId = c.req.param("userId");
  const body = await c.req.parseBody();
  const nextRole = typeof body.role === "string" ? body.role : "";

  // `owner` is deliberately not assignable here — it only moves through a
  // transfer, which keeps `teams.ownerId` and the member row in step.
  if (!isInvitableRole(nextRole)) {
    return renderTeamPage(c, slug, { error: "Pick a valid role.", status: 400 });
  }
  if (targetId === team.ownerId) {
    return renderTeamPage(c, slug, {
      error: "Transfer the team to change who owns it.",
      status: 400,
    });
  }

  const targetRole = await getMemberRole(team.id, targetId);
  if (!targetRole) {
    return renderTeamPage(c, slug, { error: "That person is not a member.", status: 400 });
  }

  await updateTeamMemberRole(team.id, targetId, nextRole);
  return renderTeamPage(c, slug, { notice: "Role updated." });
});

account.post("/teams/:slug/settings", async (c) => {
  const slug = c.req.param("slug");
  const { user, team, role } = await resolveTeamAccess(c, slug);
  if (!user) return c.redirect("/login", 302);
  if (!team || !role) return c.notFound();
  if (user.id !== team.ownerId) return c.notFound();

  const body = await c.req.parseBody();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 64) {
    return renderTeamPage(c, slug, {
      error: "Team name must be 2–64 characters.",
      status: 400,
    });
  }

  await renameTeam(team.id, name);
  return renderTeamPage(c, slug, { notice: "Team name updated." });
});

account.post("/teams/:slug/transfer", async (c) => {
  const slug = c.req.param("slug");
  const { user, team, role } = await resolveTeamAccess(c, slug);
  if (!user) return c.redirect("/login", 302);
  if (!team || !role) return c.notFound();
  if (user.id !== team.ownerId) return c.notFound();

  const body = await c.req.parseBody();
  const targetId = typeof body.user_id === "string" ? body.user_id : "";
  if (targetId === user.id) {
    return renderTeamPage(c, slug, { error: "You already own this team.", status: 400 });
  }

  const targetRole = await getMemberRole(team.id, targetId);
  if (!targetRole) {
    return renderTeamPage(c, slug, {
      error: "Pick a current member to hand the team to.",
      status: 400,
    });
  }

  await transferTeamOwnership(team.id, user.id, targetId);
  return renderTeamPage(c, slug, {
    notice: "Ownership transferred. You are an admin of this team now.",
  });
});

account.post("/teams/:slug/delete", async (c) => {
  const slug = c.req.param("slug");
  const { user, team, role } = await resolveTeamAccess(c, slug);
  if (!user) return c.redirect("/login", 302);
  if (!team || !role) return c.notFound();
  if (user.id !== team.ownerId) return c.notFound();

  const body = await c.req.parseBody();
  const confirm = typeof body.confirm_slug === "string" ? body.confirm_slug.trim() : "";
  if (confirm !== team.slug) {
    return renderTeamPage(c, slug, {
      error: `Type ${team.slug} exactly to confirm deletion.`,
      status: 400,
    });
  }

  await deleteTeam(team.id);
  return c.redirect("/account/teams", 302);
});

account.post("/teams/:slug/leave", async (c) => {
  const slug = c.req.param("slug");
  const { user, team, role } = await resolveTeamAccess(c, slug);
  if (!user) return c.redirect("/login", 302);
  if (!team || !role) return c.notFound();

  if (user.id === team.ownerId) {
    return renderTeamPage(c, slug, {
      error: "The owner cannot leave. Transfer the team first, or delete it.",
      status: 400,
    });
  }

  await removeTeamMember(team.id, user.id);
  return c.redirect("/account/teams", 302);
});

export { account };
