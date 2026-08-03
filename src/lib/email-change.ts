import { randomBytes } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "../db/client";
import { emailChanges, passwordResets, users } from "../db/schema";
import { siteUrl } from "./constants";
import { isMailerConfigured, sendMail } from "./mailer";
import { hashToken } from "./user-tokens";

const TOKEN_TTL_S = 24 * 60 * 60;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Moving to a new address only means something if we can mail that address to
 * prove the user controls it, so the flow is hidden without a mailer.
 */
export function isEmailChangeAvailable(): boolean {
  return isMailerConfigured();
}

export function emailChangeUrl(token: string): string {
  return `${siteUrl()}/account/email/confirm/${token}`;
}

/**
 * Stores a pending change and returns the raw token. Any earlier request stops
 * working, so a mistyped address cannot be confirmed later.
 */
export async function createEmailChange(
  userId: string,
  newEmail: string
): Promise<string> {
  await db
    .delete(emailChanges)
    .where(and(eq(emailChanges.userId, userId), isNull(emailChanges.usedAt)));

  const raw = randomBytes(32).toString("base64url");
  await db.insert(emailChanges).values({
    id: crypto.randomUUID(),
    userId,
    newEmail,
    tokenHash: hashToken(raw),
    expiresAt: nowSeconds() + TOKEN_TTL_S,
  });
  return raw;
}

/** The link goes to the new address — that delivery is the proof of control. */
export async function sendEmailChangeEmail(
  newEmail: string,
  token: string
): Promise<boolean> {
  return sendMail({
    to: newEmail,
    subject: "Confirm your new Webklip email address",
    text: [
      "Someone asked to move a Webklip account to this email address.",
      "",
      `Confirm it here: ${emailChangeUrl(token)}`,
      "",
      "The link works once and expires in 24 hours.",
      "If this wasn't you, ignore this email — nothing changes until the link is used.",
    ].join("\n"),
  });
}

export type EmailChangeResult =
  | { ok: true; newEmail: string }
  | { ok: false; reason: "invalid" | "taken" };

/**
 * Redeems a confirmation link and moves the account to the new address. The
 * uniqueness check is repeated here because the address may have been claimed
 * between the request and the click.
 */
export async function consumeEmailChange(raw: string): Promise<EmailChangeResult> {
  if (!raw) return { ok: false, reason: "invalid" };

  const rows = await db
    .select()
    .from(emailChanges)
    .where(eq(emailChanges.tokenHash, hashToken(raw)))
    .limit(1);

  const token = rows[0];
  if (!token || token.usedAt !== null) return { ok: false, reason: "invalid" };
  if (token.expiresAt < nowSeconds()) return { ok: false, reason: "invalid" };

  const marked = await db
    .update(emailChanges)
    .set({ usedAt: nowSeconds() })
    .where(and(eq(emailChanges.id, token.id), isNull(emailChanges.usedAt)))
    .returning({ id: emailChanges.id });
  if (marked.length === 0) return { ok: false, reason: "invalid" };

  try {
    await db
      .update(users)
      .set({ email: token.newEmail, emailVerifiedAt: nowSeconds() })
      .where(eq(users.id, token.userId));
  } catch {
    return { ok: false, reason: "taken" };
  }

  // Reset links were mailed to the address we just left.
  await db
    .delete(passwordResets)
    .where(and(eq(passwordResets.userId, token.userId), isNull(passwordResets.usedAt)));

  return { ok: true, newEmail: token.newEmail };
}

export async function purgeExpiredEmailChanges(): Promise<void> {
  await db.delete(emailChanges).where(lt(emailChanges.expiresAt, nowSeconds()));
}
