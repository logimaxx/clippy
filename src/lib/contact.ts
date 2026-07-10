export function contactEmail(): string {
  return process.env.CONTACT_EMAIL ?? "security@example.com";
}

export const LEGAL_LAST_UPDATED = "July 7, 2026";
