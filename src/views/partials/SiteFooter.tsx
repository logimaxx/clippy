/** @jsxImportSource hono/jsx */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { contactEmail } from "../../lib/contact";
import { isUmamiEnabled } from "../../lib/umami";

interface LandingPageMeta {
  slug: string;
  h1: string;
}

let cachedResourceLinks: LandingPageMeta[] | null = null;

/** Prefer built manifest so the running app does not need website source. */
function landingResourceLinks(): LandingPageMeta[] {
  if (cachedResourceLinks) return cachedResourceLinks;
  const candidates = [
    join(process.cwd(), "dist", "pages", "resource-links.json"),
    join(process.cwd(), "website", "static", "landing-pages.json"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const pages = JSON.parse(readFileSync(path, "utf-8")) as LandingPageMeta[];
      cachedResourceLinks = pages
        .filter((p) => p.slug && p.h1)
        .map((p) => ({ slug: p.slug, h1: p.h1 }));
      return cachedResourceLinks;
    } catch {
      /* try next */
    }
  }
  cachedResourceLinks = [];
  return cachedResourceLinks;
}

export function SiteFooter() {
  const email = contactEmail();
  const year = new Date().getFullYear();
  const tracking = isUmamiEnabled()
    ? " Anonymous usage logs when enabled."
    : " No tracking.";
  const resources = landingResourceLinks();

  return (
    <footer class="site-footer">
      <div class="site-footer-inner">
        <p class="site-footer-trust">
          Ephemeral by design. No ads.{tracking} Expires in 15&nbsp;min by default. Data deleted
          on expiry.
        </p>
        <nav class="site-footer-links site-footer-legal">
          <a href="/about">About</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/security">Security</a>
          <a href={`mailto:${email}`}>Contact</a>
        </nav>
        <nav class="site-footer-links site-footer-resources">
          <span class="site-footer-label">Resources</span>
          <a href="/klipwall">Klipwall</a>
          <a href="/docs">API &amp; docs</a>
          {resources.map((page) => (
            <a href={`/${page.slug}`}>{page.h1}</a>
          ))}
        </nav>
        <p class="site-footer-copy">
          &copy; {year} Webklip. A{" "}
          <a href="https://logimaxx.ro/" rel="noopener noreferrer">
            LogiMaxx Systems
          </a>{" "}
          product. <a href={`mailto:${email}`}>{email}</a>
        </p>
      </div>
    </footer>
  );
}
