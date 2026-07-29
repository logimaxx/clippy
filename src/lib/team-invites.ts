import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { teamInvites, type TeamInvite, type TeamRole } from "../db/schema";
import { siteUrl } from "./constants";
import { sendMail } from "./mailer";

const INVITE_TTL_S = 7 * 24 * 60 * 60;

/** Roles an invite may hand out — "owner" is bound to the team creator. */
export const INVITABLE_ROLES: TeamRole[] = ["admin", "member", "viewer"];

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function isInvitableRole(value: string): value is TeamRole {
  return (INVITABLE_ROLES as string[]).includes(value);
}

export function inviteUrl(token: string): string {
  return `${siteUrl()}/teams/invite/${token}`;
}

/**
 * Creates (or replaces) the pending invite for an address and returns the raw
 * token. Only its hash is stored, so the link cannot be recovered from the DB.
 */
export async function createInvite(params: {
  teamId: string;
  email: string;
  role: TeamRole;
  invitedBy: string;
}): Promise<string> {
  const raw = randomBytes(32).toString("base64url");

  // Re-inviting the same address supersedes the previous link.
  await db
    .delete(teamInvites)
    .where(
      and(eq(teamInvites.teamId, params.teamId), eq(teamInvites.email, params.email))
    );

  await db.insert(teamInvites).values({
    id: crypto.randomUUID(),
    teamId: params.teamId,
    email: params.email,
    role: params.role,
    tokenHash: hashToken(raw),
    invitedBy: params.invitedBy,
    expiresAt: nowSeconds() + INVITE_TTL_S,
  });

  return raw;
}

export async function sendInviteEmail(params: {
  email: string;
  teamName: string;
  inviterEmail: string;
  token: string;
}): Promise<boolean> {
  return sendMail({
    to: params.email,
    subject: `You've been invited to the ${params.teamName} team on Webklip`,
    text: [
      `${params.inviterEmail} invited you to join the "${params.teamName}" team on Webklip.`,
      "",
      `Accept here: ${inviteUrl(params.token)}`,
      "",
      "The link expires in 7 days and only works for this email address.",
      "If you don't have a Webklip account yet, create one with this address first.",
    ].join("\n"),
  });
}

/** Reads an invite without redeeming it, for rendering the accept page. */
export async function findInviteByToken(raw: string): Promise<TeamInvite | null> {
  if (!raw) return null;
  const rows = await db
    .select()
    .from(teamInvites)
    .where(eq(teamInvites.tokenHash, hashToken(raw)))
    .limit(1);

  const invite = rows[0];
  if (!invite || invite.expiresAt < nowSeconds()) return null;
  return invite;
}

/**
 * Redeems an invite. The delete is what enforces single use — a second attempt
 * finds nothing to remove and gets null.
 */
export async function consumeInvite(raw: string): Promise<TeamInvite | null> {
  const invite = await findInviteByToken(raw);
  if (!invite) return null;

  const deleted = await db
    .delete(teamInvites)
    .where(eq(teamInvites.id, invite.id))
    .returning({ id: teamInvites.id });
  if (deleted.length === 0) return null;

  return invite;
}

export async function listPendingInvites(teamId: string) {
  return db
    .select({
      id: teamInvites.id,
      email: teamInvites.email,
      role: teamInvites.role,
      expiresAt: teamInvites.expiresAt,
    })
    .from(teamInvites)
    .where(eq(teamInvites.teamId, teamId));
}

export async function revokeInvite(teamId: string, inviteId: string): Promise<void> {
  await db
    .delete(teamInvites)
    .where(and(eq(teamInvites.teamId, teamId), eq(teamInvites.id, inviteId)));
}

export async function purgeExpiredInvites(): Promise<void> {
  await db.delete(teamInvites).where(lt(teamInvites.expiresAt, nowSeconds()));
}
