import { eq, isNull, lt, and, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { emailVerifications, users } from "../db/schema";
import { siteUrl } from "./constants";
import { isMailerConfigured, sendMail } from "./mailer";
import { deleteUserAccount } from "./account-delete";
import {
  consumeToken,
  invalidateTokens,
  issueToken,
  purgeExpiredTokens,
} from "./user-tokens";

const TOKEN_TTL_S = 24 * 60 * 60;
/** Unverified sign-ups are dropped so a squatted address frees itself up. */
const UNVERIFIED_MAX_AGE_S = 7 * 24 * 60 * 60;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Verification is only meaningful when we can actually send mail. Without a
 * mailer every account is treated as verified, so sign-in keeps working.
 */
export function isEmailVerificationRequired(): boolean {
  return isMailerConfigured();
}

export function verifyUrl(token: string): string {
  return `${siteUrl()}/verify-email/${token}`;
}

export async function sendVerificationEmail(
  userId: string,
  email: string
): Promise<boolean> {
  const token = await issueToken(emailVerifications, userId, TOKEN_TTL_S);
  return sendMail({
    to: email,
    subject: "Confirm your Webklip email address",
    text: [
      "Someone created a Webklip account with this email address.",
      "",
      `Confirm it here: ${verifyUrl(token)}`,
      "",
      "The link works once and expires in 24 hours.",
      "If this wasn't you, ignore this email — the account is deleted automatically",
      "if it is never confirmed.",
    ].join("\n"),
  });
}

export async function markEmailVerified(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ emailVerifiedAt: nowSeconds() })
    .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
  await invalidateTokens(emailVerifications, userId);
}

/** Redeems a verification link and returns the user it belonged to. */
export async function consumeVerificationToken(raw: string): Promise<string | null> {
  const userId = await consumeToken(emailVerifications, raw);
  if (!userId) return null;
  await markEmailVerified(userId);
  return userId;
}

export async function purgeExpiredVerificationTokens(): Promise<void> {
  await purgeExpiredTokens(emailVerifications);
}

/**
 * Removes sign-ups that were never confirmed. They cannot sign in, so they own
 * no clips or teams — only the row and its tokens need to go.
 */
export async function purgeUnverifiedAccounts(): Promise<void> {
  if (!isEmailVerificationRequired()) return;

  const cutoff = nowSeconds() - UNVERIFIED_MAX_AGE_S;
  const stale = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        isNull(users.emailVerifiedAt),
        lt(users.createdAt, cutoff),
        // Password-less rows come from OAuth and are verified on arrival; this
        // guard keeps an unexpected one from being swept up.
        isNotNull(users.passwordHash)
      )
    );

  for (const user of stale) {
    await db.delete(emailVerifications).where(eq(emailVerifications.userId, user.id));
    // Goes through the full cascade rather than a bare row delete, so nothing is
    // orphaned if an unverified account ever gains data.
    await deleteUserAccount(user.id);
  }
}
