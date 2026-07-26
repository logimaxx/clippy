/** @jsxImportSource hono/jsx */
import { ThemeToggle } from "../ThemeToggle";

export function SiteHeader() {
  return (
    <header class="site-header">
      <div class="site-header-inner">
        <a href="/" class="logo">
          webklip
        </a>
        <div class="site-header-end">
          <nav id="site-nav" class="site-nav" aria-label="Main">
            <a href="/klipwall">Klipwall</a>
            <a href="/#features">Features</a>
            <a href="/about">About</a>
            <a href="/docs">API</a>
            <a href="/security">Security</a>
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
