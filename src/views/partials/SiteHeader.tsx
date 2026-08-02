/** @jsxImportSource hono/jsx */
import { ThemeToggle } from "../ThemeToggle";
import type { AuthUser } from "../../lib/session";

interface SiteHeaderProps {
  /** Marketing chrome links vs product-only nav for the OSS app shell. */
  variant?: "marketing" | "app";
  user?: AuthUser | null;
}

export function SiteHeader({ variant = "marketing", user = null }: SiteHeaderProps) {
  return (
    <header class="site-header">
      <div class="site-header-inner">
        <a href="/" class="logo">
          webklip
        </a>
        <div class="site-header-end">
          <nav id="site-nav" class="site-nav" aria-label="Main">
            <a href="/klipwall">Klipwall</a>
            {variant === "marketing" ? (
              <>
                <a href="/#features">Features</a>
                <a href="/about">About</a>
                <a href="/docs">API</a>
                <a href="/security">Security</a>
              </>
            ) : user ? (
              <a href="/account">Account</a>
            ) : (
              <>
                <a href="/login">Log in</a>
                <a href="/register">Register</a>
              </>
            )}
          </nav>
          <ThemeToggle />
          <button
            type="button"
            class="site-nav-toggle"
            aria-expanded="false"
            aria-controls="site-nav"
            aria-label="Open menu"
          >
            <span class="site-nav-toggle-icon" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <div class="site-nav-backdrop" aria-hidden="true"></div>
    </header>
  );
}
