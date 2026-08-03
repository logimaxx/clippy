import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "../db/client";
import { emailVerifications, passwordResets } from "../db/schema";

/**
 * Password resets and email verifications are the same primitive: a one-shot,
 * expiring secret mailed to an address. They live in separate tables so one
 * flow can never redeem the other's token.
 */
export type UserTokenTable = typeof passwordResets | typeof emailVerifications;

export const DEFAULT_TTL_S = 60 * 60;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Only the hash is stored, so a database leak hands out no working links. */
export async function issueToken(
  table: UserTokenTable,
  userId: string,
  ttlSeconds = DEFAULT_TTL_S
): Promise<string> {
  // Any earlier link stops working the moment a new one is requested.
  await invalidateTokens(table, userId);

  const raw = randomBytes(32).toString("base64url");
  await db.insert(table).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash: hashToken(raw),
    expiresAt: nowSeconds() + ttlSeconds,
  });
  return raw;
}

export async function invalidateTokens(
  table: UserTokenTable,
  userId: string
): Promise<void> {
  await db.delete(table).where(and(eq(table.userId, userId), isNull(table.usedAt)));
}

/**
 * Returns the user id for a valid token and burns it in the same step. The
 * conditional update is what makes a replay lose the race.
 */
export async function consumeToken(
  table: UserTokenTable,
  raw: string
): Promise<string | null> {
  if (!raw) return null;
  const rows = await db
    .select()
    .from(table)
    .where(eq(table.tokenHash, hashToken(raw)))
    .limit(1);

  const token = rows[0];
  if (!token || token.usedAt !== null) return null;
  if (token.expiresAt < nowSeconds()) return null;

  const marked = await db
    .update(table)
    .set({ usedAt: nowSeconds() })
    .where(and(eq(table.id, token.id), isNull(table.usedAt)))
    .returning({ id: table.id });
  if (marked.length === 0) return null;

  return token.userId;
}

/** Checks a token without burning it, for rendering a form behind the link. */
export async function isTokenValid(
  table: UserTokenTable,
  raw: string
): Promise<boolean> {
  if (!raw) return false;
  const rows = await db
    .select({ expiresAt: table.expiresAt, usedAt: table.usedAt })
    .from(table)
    .where(eq(table.tokenHash, hashToken(raw)))
    .limit(1);

  const token = rows[0];
  return !!token && token.usedAt === null && token.expiresAt >= nowSeconds();
}

export async function purgeExpiredTokens(table: UserTokenTable): Promise<void> {
  await db.delete(table).where(lt(table.expiresAt, nowSeconds()));
}
