/** @jsxImportSource hono/jsx */
import { Hono, type Context } from "hono";
import { eq } from "drizzle-orm";
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
  canRegister,
  canRequestPasswordReset,
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
} from "../lib/teams";
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
  AccountPage,
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from "../views/Account";
import { TeamInvitePage, TeamPage } from "../views/Team";
import { enabledOauthProviders } from "../lib/oauth";

const account = new Hono();

const LOGIN_NOTICES: Record<string, string> = {
  deleted: "Your account and everything in it have been deleted.",
  "signed-out": "Signed out of every device.",
  "password-changed": "Password updated. Sign in with your new password.",
  "email-verified": "Email confirmed. You can sign in now.",
};

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

  const renderError = async (error: string) => {
    const userTeams = await listUserTeams(user.id);
    const keys = await db
      .select({ id: apiKeys.id, name: apiKeys.name, createdAt: apiKeys.createdAt })
      .from(apiKeys)
      .where(eq(apiKeys.userId, user.id));
    return c.html(
      <AccountPage user={user} teams={userTeams} apiKeys={keys} deleteError={error} />,
      400
    );
  };

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

  const [members, invites] = await Promise.all([
    listTeamMembers(team.id),
    isAdminRole(role) ? listPendingInvites(team.id) : Promise.resolve([]),
  ]);

  return c.html(
    <TeamPage
      team={team}
      viewer={{ id: user.id, role }}
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

account.post("/teams/:slug/leave", async (c) => {
  const slug = c.req.param("slug");
  const { user, team, role } = await resolveTeamAccess(c, slug);
  if (!user) return c.redirect("/login", 302);
  if (!team || !role) return c.notFound();

  if (user.id === team.ownerId) {
    return renderTeamPage(c, slug, {
      error: "The owner cannot leave. Delete your account to release the team.",
      status: 400,
    });
  }

  await removeTeamMember(team.id, user.id);
  return c.redirect("/account", 302);
});

export { account };
