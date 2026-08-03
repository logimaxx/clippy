import type { AuthUser } from "./session";

export type NavUser = Pick<AuthUser, "email" | "name">;

/**
 * Prebuilt marketing pages ship the logged-out cluster between these markers so
 * static hosting still renders a sign-up CTA; the app swaps the region for the
 * account pill when a session cookie resolves.
 */
const AUTH_NAV_REGION = /<!--AUTH_NAV-->[\s\S]*?<!--\/AUTH_NAV-->/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Up to two letters for the header/sidebar avatar. */
export function accountInitials(user: NavUser): string {
  const source = user.name?.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0] ?? "");
  return letters.join("") || "?";
}

function renderAccountNavHtml(user: NavUser): string {
  const label = user.name?.trim() || user.email;
  return `<div class="site-auth">
        <a href="/account" class="site-auth-account" title="${escapeHtml(label)}">
          <span class="site-auth-avatar" aria-hidden="true">${escapeHtml(accountInitials(user))}</span>
          <span class="site-auth-account-label">Account</span>
        </a>
      </div>`;
}

export function injectAuthNav(html: string, user: NavUser | null): string {
  if (!user) return html;
  return html.replace(AUTH_NAV_REGION, renderAccountNavHtml(user));
}
