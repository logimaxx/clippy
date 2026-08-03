/** @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import { Layout } from "../Layout";
import { SiteHeader } from "./SiteHeader";
import { accountInitials } from "../../lib/auth-nav";
import type { AuthUser } from "../../lib/session";

export type AccountTab = "clips" | "teams" | "settings" | "developer";

type AccountUser = Pick<AuthUser, "id" | "email" | "name">;

export interface AccountCounts {
  clips?: number;
  teams?: number;
  apiKeys?: number;
}

interface AccountShellProps {
  user: AccountUser;
  tab: AccountTab;
  title: string;
  /** One line telling the user what this area is for. */
  subtitle?: string;
  /** Primary action(s) rendered next to the page title. */
  actions?: Child;
  counts?: AccountCounts;
  children: Child;
}

const TABS: {
  id: AccountTab;
  href: string;
  label: string;
  desc: string;
  count: keyof AccountCounts;
}[] = [
  { id: "clips", href: "/account", label: "My clips", desc: "Clips you own", count: "clips" },
  { id: "teams", href: "/account/teams", label: "Teams", desc: "Shared clip spaces", count: "teams" },
  { id: "settings", href: "/account/settings", label: "Settings", desc: "Sessions and account", count: "apiKeys" },
  { id: "developer", href: "/account/developer", label: "Developer", desc: "API keys", count: "apiKeys" },
];

export function AccountShell({
  user,
  tab,
  title,
  subtitle,
  actions,
  counts = {},
  children,
}: AccountShellProps) {
  return (
    <Layout
      title={`${title} — Webklip`}
      themeToggle="none"
      bodyClass="with-chrome"
      robots="noindex"
    >
      <SiteHeader variant="app" user={user} />
      <main class="account-layout">
        <aside class="account-side">
          <a
            href="/account/settings"
            class={`account-identity${tab === "settings" ? " is-active" : ""}`}
            aria-current={tab === "settings" ? "page" : undefined}
          >
            <span class="account-avatar" aria-hidden="true">
              {accountInitials(user)}
            </span>
            <span class="account-identity-text">
              {user.name && <span class="account-identity-name">{user.name}</span>}
              <span class="account-identity-email" title={user.email}>
                {user.email}
              </span>
            </span>
            <span class="account-identity-go" aria-hidden="true">
              ›
            </span>
            <span class="sr-only">Open account settings</span>
          </a>

          <nav class="account-nav" aria-label="Account sections">
            {TABS.map((t) => {
              const count = t.id === "settings" ? undefined : counts[t.count];
              return (
                <a
                  href={t.href}
                  class={`account-nav-item${tab === t.id ? " is-active" : ""}`}
                  aria-current={tab === t.id ? "page" : undefined}
                >
                  <span class="account-nav-top">
                    <span>{t.label}</span>
                    {count !== undefined && (
                      <span class="account-nav-count">{count}</span>
                    )}
                  </span>
                  <span class="account-nav-desc">{t.desc}</span>
                </a>
              );
            })}
          </nav>
        </aside>

        <div class="account-content">
          <header class="account-head">
            <div>
              <h1>{title}</h1>
              {subtitle && <p class="account-head-sub">{subtitle}</p>}
            </div>
            {actions && <div class="account-head-actions">{actions}</div>}
          </header>

          {children}
        </div>
      </main>
    </Layout>
  );
}
