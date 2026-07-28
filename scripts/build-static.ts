import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const STATIC = join(ROOT, "static");
const OUT = join(ROOT, "dist", "pages");
const STRUCTURED_DATA_DIR = join(OUT, "structured-data");

interface LandingCompareRow {
  feature: string;
  left: string;
  right: string;
}

interface LandingCompare {
  leftLabel: string;
  rightLabel: string;
  rows: LandingCompareRow[];
  footnote?: string;
}

interface LandingPage {
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  paragraphs: string[];
  benefits: string[];
  useCases: string[];
  relatedSlugs: string[];
  /** Hero CTA: paste textarea (default) or file upload drop zone */
  heroVariant?: "paste" | "file";
  /** Optional side-by-side comparison table (e.g. competitor vs Webklip) */
  compare?: LandingCompare;
  /** Override for the benefits section heading */
  benefitsHeading?: string;
}

interface BuildContext {
  siteUrl: string;
  assetBase: string;
  contactEmail: string;
  year: string;
  legalUpdated: string;
  umamiScript: string;
  footerTracking: string;
  trustAnalytics: string;
  resourceLinks: string;
  umami: {
    analyticsSection: string;
    cookieConsent: string;
  };
}

/** Public site origin from SITE_URL (no trailing slash). */
function siteOrigin(): string {
  return (process.env.SITE_URL ?? "https://webklip.com").trim().replace(/\/$/, "");
}

/** Absolute URL for a site path (canonical, sitemap, JSON-LD). */
function absoluteUrl(origin: string, path: string): string {
  if (!path || path === "/") return `${origin}/`;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function loadManifest(): string {
  const path = join(ROOT, "dist", "asset-manifest.json");
  if (!existsSync(path)) {
    return "/assets/dev";
  }
  const { base } = JSON.parse(readFileSync(path, "utf-8")) as { base: string };
  return base;
}

function umamiConfig(): { script: string } | null {
  const websiteId = process.env.UMAMI_WEBSITE_ID?.trim();
  if (!websiteId) return null;

  const scriptUrl =
    process.env.UMAMI_SCRIPT_URL?.trim() ||
    (process.env.UMAMI_URL?.trim()
      ? `${process.env.UMAMI_URL.replace(/\/$/, "")}/script.js`
      : "");

  if (!scriptUrl) return null;

  try {
    new URL(scriptUrl);
  } catch {
    return null;
  }

  return {
    script: `<script defer src="${scriptUrl}" data-website-id="${websiteId}"></script>`,
  };
}

function replaceVars(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function writeJsonLd(filename: string, data: Record<string, unknown>): string {
  writeFileSync(join(STRUCTURED_DATA_DIR, filename), JSON.stringify(data));
  return `<script type="application/ld+json" src="/structured-data/${filename}"></script>`;
}

function renderDocsNav(activePath: string): string {
  const items = [
    { path: "/docs", label: "Overview" },
    { path: "/docs/api", label: "REST API" },
    { path: "/docs/webhooks", label: "Webhooks" },
  ];
  const navItems = items
    .map(
      (item) =>
        `<a href="${item.path}"${item.path === activePath ? ' class="is-active"' : ""}>${item.label}</a>`
    )
    .join("\n  ");
  return replaceVars(readFileSync(join(STATIC, "partials", "docs-nav.html"), "utf-8"), {
    DOCS_NAV_ITEMS: navItems,
  });
}

function buildDocsBody(activePath: string, content: string): string {
  return `<main class="docs-page">
  ${renderDocsNav(activePath)}
  <article class="docs-prose legal-prose">
    ${content}
  </article>
</main>`;
}

function buildContext(): BuildContext {
  const umami = umamiConfig();
  const landingPages = JSON.parse(
    readFileSync(join(STATIC, "landing-pages.json"), "utf-8")
  ) as LandingPage[];

  const resourceLinks = landingPages
    .map((p) => `<a href="/${p.slug}">${p.h1}</a>`)
    .join("\n    ");

  return {
    siteUrl: siteOrigin(),
    assetBase: loadManifest(),
    contactEmail: process.env.CONTACT_EMAIL ?? "contact@logimaxx.ro",
    year: String(new Date().getFullYear()),
    legalUpdated: "July 26, 2026",
    umamiScript: umami?.script ?? "",
    footerTracking: umami
      ? " Privacy-friendly site analytics."
      : " No tracking.",
    trustAnalytics: umami
      ? "Privacy-friendly site analytics only — no app usage tracking"
      : "No analytics trackers",
    resourceLinks,
    umami: {
      analyticsSection: umami
        ? `<p>
      We use <a href="https://umami.is" rel="noopener noreferrer">Umami</a> to measure
      visits to our public website (marketing pages, docs, and similar). Umami is
      privacy-friendly: it does not use cookies for analytics, does not build personal
      profiles, and does not do cross-site advertising tracking.
    </p>
    <p>
      We do <strong>not</strong> use Umami (or any other analytics tool) to track usage
      of the clipboard app itself — for example, we do not record which clips you open,
      what you paste, or how you use editor features.
    </p>`
        : `<p>
      We do not run analytics or advertising trackers on Webklip.
    </p>`,
      cookieConsent: umami
        ? " We do not use non-essential analytics cookies; Umami measures anonymous site visits without analytics cookies."
        : " We do not use non-essential cookies, so no cookie consent banner is shown.",
    },
  };
}

function renderPage(
  layout: string,
  header: string,
  footer: string,
  body: string,
  ctx: BuildContext,
  meta: {
    title: string;
    description: string;
    canonical?: string;
    ogTitle?: string;
    ogDescription?: string;
    jsonLd?: Record<string, unknown>;
    jsonLdFile?: string;
    bodyClass?: string;
  }
): string {
  const canonical = meta.canonical
    ? `<link rel="canonical" href="${absoluteUrl(ctx.siteUrl, meta.canonical)}" />`
    : "";
  let jsonLd = "";
  if (meta.jsonLd && meta.jsonLdFile) {
    const data = { ...meta.jsonLd };
    if (typeof data.url === "string") {
      data.url = absoluteUrl(ctx.siteUrl, data.url);
    }
    jsonLd = writeJsonLd(meta.jsonLdFile, data);
  }

  const footerHtml = replaceVars(footer, {
    CONTACT_EMAIL: ctx.contactEmail,
    YEAR: ctx.year,
    FOOTER_TRACKING: ctx.footerTracking,
    RESOURCE_LINKS: ctx.resourceLinks,
  });

  return replaceVars(layout, {
    TITLE: meta.title,
    DESCRIPTION: meta.description,
    CANONICAL: canonical,
    OG_TITLE: meta.ogTitle ?? meta.title,
    OG_DESCRIPTION: meta.ogDescription ?? meta.description,
    JSON_LD: jsonLd,
    ASSET_BASE: ctx.assetBase,
    UMAMI: ctx.umamiScript,
    BODY_CLASS: meta.bodyClass ?? "with-chrome",
    HEADER: header,
    BODY: body,
    FOOTER: footerHtml,
  });
}

function buildLandingSlugBar(statusId: string): string {
  return `<div class="landing-hero-paste-bar">
  <input
    type="text"
    name="slug"
    placeholder="custom-name (optional)"
    pattern="[a-zA-Z0-9_-]{3,64}"
    class="slug-input"
    autocomplete="off"
    aria-label="Custom clip name (optional)"
    aria-describedby="${statusId}"
  />
  <button type="submit" class="btn btn-primary btn-lg">Create a Clip</button>
</div>
<p class="landing-create-status" id="${statusId}" hidden role="status"></p>`;
}

function buildLandingPasteForm(id: string): string {
  return `<form action="/new" method="post" class="home-form landing-cta landing-hero-paste">
  <label class="sr-only" for="${id}">Paste text to share</label>
  <textarea
    id="${id}"
    name="content"
    class="home-paste-input"
    rows="9"
    placeholder="Paste text here…"
    spellcheck="false"
  ></textarea>
  ${buildLandingSlugBar(`${id}-slug-status`)}
</form>`;
}

function buildLandingFileForm(id: string): string {
  return `<form action="/new" method="post" enctype="multipart/form-data" class="home-form landing-cta landing-hero-paste landing-hero-upload">
  <label class="drop-zone landing-drop-zone" for="${id}-file">
    <span class="landing-drop-zone-title">Drop, paste (Ctrl+V), or browse</span>
    <span class="landing-drop-zone-hint">Images, PDFs, text, zip, JSON, Markdown — paste a screenshot</span>
    <input
      type="file"
      id="${id}-file"
      name="file"
      class="file-input"
      accept="image/*,.pdf,.txt,.zip,.json,.md"
      multiple
    />
  </label>
  <p class="landing-file-names" id="${id}-names" hidden></p>
  <label class="sr-only" for="${id}">Optional note</label>
  <textarea
    id="${id}"
    name="content"
    class="home-paste-input home-paste-input--compact"
    rows="4"
    placeholder="Optional note to go with the file…"
    spellcheck="false"
  ></textarea>
  ${buildLandingSlugBar(`${id}-slug-status`)}
</form>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildCompareSection(compare: LandingCompare): string {
  const rows = compare.rows
    .map(
      (row) => `      <tr>
        <td>${escapeHtml(row.feature)}</td>
        <td>${escapeHtml(row.left)}</td>
        <td>${escapeHtml(row.right)}</td>
      </tr>`
    )
    .join("\n");
  const footnote = compare.footnote
    ? `\n  <p class="compare-footnote">${escapeHtml(compare.footnote)}</p>`
    : "";

  return `<section class="landing-section compare-section">
  <h2>Side-by-side</h2>
  <div class="compare-table-wrap">
    <table class="compare-table">
      <thead>
        <tr>
          <th scope="col">Feature</th>
          <th scope="col">${escapeHtml(compare.leftLabel)}</th>
          <th scope="col">${escapeHtml(compare.rightLabel)}</th>
        </tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </div>${footnote}
</section>`;
}

function buildLandingBody(page: LandingPage, allPages: LandingPage[]): string {
  const related = page.relatedSlugs
    .map((slug) => allPages.find((p) => p.slug === slug))
    .filter((p): p is LandingPage => p !== undefined);

  const paragraphs = page.paragraphs.map((p) => `<p>${p}</p>`).join("\n    ");
  const benefits = page.benefits.map((b) => `<li>${b}</li>`).join("\n      ");
  const useCases = page.useCases.map((u) => `<li>${u}</li>`).join("\n      ");
  const relatedLinks = related
    .map((r) => `<a href="/${r.slug}">${r.h1}</a>`)
    .concat('<a href="/">Webklip homepage</a>')
    .join("\n      ");
  const formId = `landing-paste-${page.slug}`;
  const heroForm =
    page.heroVariant === "file"
      ? buildLandingFileForm(formId)
      : buildLandingPasteForm(formId);
  const ctaText =
    page.heroVariant === "file"
      ? "Upload or paste a screenshot above, or create an empty clip to attach files later."
      : "Paste above, or create an empty clip to start sharing.";
  const benefitsHeading =
    page.benefitsHeading ?? `Why use Webklip for ${page.h1.toLowerCase()}?`;
  const compareSection = page.compare ? `\n\n${buildCompareSection(page.compare)}` : "";

  return `<section class="seo-landing-hero">
  <h1>${page.h1}</h1>
  <p class="seo-landing-intro">${page.intro}</p>
  ${heroForm}
</section>

<section class="landing-section seo-landing-prose">
  ${paragraphs}
</section>${compareSection}

<section class="landing-section">
  <h2>${escapeHtml(benefitsHeading)}</h2>
  <ul class="trust-list">
    ${benefits}
  </ul>
</section>

<section class="landing-section">
  <h2>Common use cases</h2>
  <ul class="seo-use-cases">
    ${useCases}
  </ul>
</section>

<section class="landing-section seo-landing-related">
  <h2>Related</h2>
  <nav class="seo-related-links">
    ${relatedLinks}
  </nav>
</section>

<section class="landing-section seo-landing-cta">
  <h2>Ready to try it?</h2>
  <p class="seo-landing-cta-text">${ctaText}</p>
  <form action="/new" method="post" class="home-form landing-cta">
    <button type="submit" class="btn btn-primary btn-lg">Create a Clip</button>
  </form>
</section>`;
}

function buildSitemap(baseUrl: string, routes: string[]): string {
  const base = baseUrl.replace(/\/$/, "");
  const urls = routes
    .map((path) => {
      const loc = `${base}${path === "/" ? "/" : path}`;
      return `  <url><loc>${loc}</loc></url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function buildRobots(baseUrl: string): string {
  return `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;
}

const layout = readFileSync(join(STATIC, "layout.html"), "utf-8");
const header = readFileSync(join(STATIC, "partials", "header.html"), "utf-8");
const footer = readFileSync(join(STATIC, "partials", "footer.html"), "utf-8");
const landingPages = JSON.parse(
  readFileSync(join(STATIC, "landing-pages.json"), "utf-8")
) as LandingPage[];

const ctx = buildContext();
mkdirSync(OUT, { recursive: true });
mkdirSync(STRUCTURED_DATA_DIR, { recursive: true });

const routes: Record<string, string> = {};

function writePage(urlPath: string, filename: string, html: string) {
  writeFileSync(join(OUT, filename), html);
  routes[urlPath] = filename;
}

// Homepage
const homeBody = replaceVars(readFileSync(join(STATIC, "pages", "home.html"), "utf-8"), {
  TRUST_ANALYTICS: ctx.trustAnalytics,
});
writePage(
  "/",
  "index.html",
  renderPage(layout, header, footer, homeBody, ctx, {
    title: "Webklip — Temporary Workspace for Instant Text & File Sharing",
    description:
      "Stop sending yourself links through WhatsApp. Share text and files instantly between devices with a temporary private link. No account, real-time sync, expires in 15 minutes by default.",
    canonical: "/",
    ogTitle: "Webklip — Stop sending yourself links through WhatsApp",
    ogDescription:
      "Share text and files instantly between devices with a temporary private link. No accounts. Expires in 15 minutes by default.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Webklip",
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description:
        "A free temporary workspace for instant text and file sharing between devices. No sign-up required. Clips expire in 15 minutes by default.",
    },
    jsonLdFile: "index.json",
  })
);

// Legal pages
const legalPages = [
  {
    path: "/about",
    file: "about.html",
    src: "about.html",
    title: "About — Webklip",
    description:
      "Who builds Webklip, why clips are ephemeral by default, and how to contact us.",
  },
  {
    path: "/privacy",
    file: "privacy.html",
    src: "privacy.html",
    title: "Privacy Policy — Webklip",
    description:
      "How Webklip handles clip content, accounts, cookies, retention, and optional site analytics.",
  },
  {
    path: "/terms",
    file: "terms.html",
    src: "terms.html",
    title: "Terms and Conditions — Webklip",
    description: "Terms and conditions governing use of the Webklip web clipboard service.",
  },
  {
    path: "/security",
    file: "security.html",
    src: "security.html",
    title: "Security — Webklip",
    description:
      "How Webklip protects your data: ephemeral storage, passphrase E2E, rate limits, and encryption options.",
  },
] as const;

for (const page of legalPages) {
  let body = readFileSync(join(STATIC, "pages", page.src), "utf-8");
  body = replaceVars(body, {
    CONTACT_EMAIL: ctx.contactEmail,
    LEGAL_UPDATED: ctx.legalUpdated,
    UMAMI_ANALYTICS_SECTION: ctx.umami.analyticsSection,
    COOKIE_CONSENT_NOTE: ctx.umami.cookieConsent,
  });
  writePage(
    page.path,
    page.file,
    renderPage(layout, header, footer, body, ctx, {
      title: page.title,
      description: page.description,
      canonical: page.path,
    })
  );
}

// SEO landing pages
for (const page of landingPages) {
  const body = buildLandingBody(page, landingPages);
  writePage(
    `/${page.slug}`,
    `${page.slug}.html`,
    renderPage(layout, header, footer, body, ctx, {
      title: page.title,
      description: page.description,
      canonical: `/${page.slug}`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: page.h1,
        description: page.description,
        url: `/${page.slug}`,
      },
      jsonLdFile: `${page.slug}.json`,
    })
  );
}

// Developer docs
const docsPages = [
  {
    path: "/docs",
    file: "docs-index.html",
    src: "docs/index.html",
    title: "Developer Docs — Webklip",
    description: "REST API and webhooks for automating Webklip.",
  },
  {
    path: "/docs/api",
    file: "docs-api.html",
    src: "docs/api.html",
    title: "REST API — Webklip Docs",
    description: "Webklip REST API reference for clips, files, and authentication.",
  },
  {
    path: "/docs/webhooks",
    file: "docs-webhooks.html",
    src: "docs/webhooks.html",
    title: "Webhooks — Webklip Docs",
    description: "Webhook events and payloads for Webklip clips.",
  },
] as const;

for (const page of docsPages) {
  const content = readFileSync(join(STATIC, "pages", page.src), "utf-8");
  const body = buildDocsBody(page.path, content);
  writePage(
    page.path,
    page.file,
    renderPage(layout, header, footer, body, ctx, {
      title: page.title,
      description: page.description,
      canonical: page.path,
    })
  );
}

const sitemapPaths = [...Object.keys(routes), "/klipwall"].sort((a, b) => {
  if (a === "/") return -1;
  if (b === "/") return 1;
  return a.localeCompare(b);
});
writeFileSync(join(OUT, "sitemap-paths.json"), JSON.stringify(sitemapPaths, null, 2));

writeFileSync(join(OUT, "sitemap.xml"), buildSitemap(ctx.siteUrl, sitemapPaths));
writeFileSync(join(OUT, "robots.txt"), buildRobots(ctx.siteUrl));

writeFileSync(join(OUT, "routes.json"), JSON.stringify(routes, null, 2));

console.log(`Static pages built → ${OUT} (${Object.keys(routes).length} pages)`);

export { buildSitemap, buildRobots, sitemapPaths };
