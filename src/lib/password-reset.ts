import { passwordResets } from "../db/schema";
import { siteUrl } from "./constants";
import {
  consumeToken,
  invalidateTokens,
  isTokenValid,
  issueToken,
  purgeExpiredTokens,
} from "./user-tokens";

export function createResetToken(userId: string): Promise<string> {
  return issueToken(passwordResets, userId);
}

export function invalidateResetTokens(userId: string): Promise<void> {
  return invalidateTokens(passwordResets, userId);
}

export function consumeResetToken(raw: string): Promise<string | null> {
  return consumeToken(passwordResets, raw);
}

export function isResetTokenValid(raw: string): Promise<boolean> {
  return isTokenValid(passwordResets, raw);
}

export function resetUrl(token: string): string {
  return `${siteUrl()}/reset-password/${token}`;
}

export function purgeExpiredResetTokens(): Promise<void> {
  return purgeExpiredTokens(passwordResets);
}
