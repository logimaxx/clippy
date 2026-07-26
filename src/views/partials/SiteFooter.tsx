/** @jsxImportSource hono/jsx */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contactEmail } from "../../lib/contact";
import { isUmamiEnabled } from "../../lib/umami";

interface LandingPageMeta {
  slug: string;
  h1: string;
}

let cachedResourceLinks: LandingPageMeta[] | null = null;

function landingResourceLinks(): LandingPageMeta[] {
  if (cachedResourceLinks) return cachedResourceLinks;
  try {
    const raw = readFileSync(join(process.cwd(), "static", "landing-pages.json"), "utf-8");
    const pages = JSON.parse(raw) as LandingPageMeta[];
    cachedResourceLinks = pages.map((p) => ({ slug: p.slug, h1: p.h1 }));
  } catch {
    cachedResourceLinks = [];
  }
  return cachedResourceLinks;
}

export function SiteFooter() {
  const email = contactEmail();
  const year = new Date().getFullYear();
  const tracking = isUmamiEnabled()
    ? " Privacy-friendly site analytics."
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
