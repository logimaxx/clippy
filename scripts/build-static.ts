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
}

interface BuildContext {
  assetBase: string;
  contactEmail: string;
  year: string;
  legalUpdated: string;
  umamiScript: string;
  footerTracking: string;
  trustAnalytics: string;
  resourceLinks: string;
  umami: {
    cookiesNote: string;
    analyticsLi: string;
    notDoLi: string;
    cookieConsent: string;
  };
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
    { path: "/docs/cli", label: "CLI" },
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
    assetBase: loadManifest(),
    contactEmail: process.env.CONTACT_EMAIL ?? "contact@logimaxx.ro",
    year: String(new Date().getFullYear()),
    legalUpdated: "July 7, 2026",
    umamiScript: umami?.script ?? "",
    footerTracking: umami
      ? " Privacy-friendly analytics."
      : " No tracking.",
    trustAnalytics: umami
      ? "Privacy-friendly analytics only — no cross-site trackers"
      : "No analytics trackers",
    resourceLinks,
    umami: {
      cookiesNote: umami
        ? " Umami analytics does not use cookies."
        : " No analytics or advertising cookies.",
      analyticsLi: umami
        ? `<li><strong>Website analytics</strong> — aggregated page views via <a href="https://umami.is" rel="noopener noreferrer">Umami</a>. Clip opens are counted under generic paths (for example <code>/clip</code>); we do not record which clip was opened. No personal profiles, no cross-site tracking, no ad cookies.</li>`
        : "",
      notDoLi: umami
        ? "<li>We do not use Google Analytics or other invasive analytics platforms.</li>"
        : "<li>We do not run third-party advertising or analytics trackers.</li>",
      cookieConsent: umami
        ? " Umami collects anonymous page-view statistics without cookies."
        : " No cookie consent banner is required because we do not use non-essential cookies.",
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
    ? `<link rel="canonical" href="${meta.canonical}" />`
    : "";
  let jsonLd = "";
  if (meta.jsonLd && meta.jsonLdFile) {
    jsonLd = writeJsonLd(meta.jsonLdFile, meta.jsonLd);
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

  return `<section class="seo-landing-hero">
  <h1>${page.h1}</h1>
  <p class="seo-landing-intro">${page.intro}</p>
  <form action="/new" method="post" class="home-form landing-cta">
    <button type="submit" class="btn btn-primary btn-lg">Create clip</button>
  </form>
</section>

<section class="landing-section seo-landing-prose">
  ${paragraphs}
</section>

<section class="landing-section">
  <h2>Why use Webklip for ${page.h1.toLowerCase()}?</h2>
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
  <p class="seo-landing-cta-text">Create a free clip in one click. No sign-up required.</p>
  <form action="/new" method="post" class="home-form landing-cta">
    <button type="submit" class="btn btn-primary btn-lg">Create clip</button>
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
    title: "Webklip — Online Web Clipboard for Instant Text Sharing",
    description:
      "Share text and files between devices with a free online clipboard. No sign-up, real-time sync, automatic deletion. Create a secure web clipboard in one click.",
    canonical: "/",
    ogTitle: "Webklip — The fastest way to share text and files between devices",
    ogDescription:
      "Free online clipboard with real-time sync. No account required — your link is the key.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Webklip",
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description:
        "A free online clipboard for instant text sharing and temporary file sharing between devices. No sign-up required.",
    },
    jsonLdFile: "index.json",
  })
);

// Legal pages
const legalPages = [
  {
    path: "/privacy",
    file: "privacy.html",
    src: "privacy.html",
    title: "Privacy Policy — Webklip",
    description: "How Webklip collects, uses, and deletes your data.",
  },
  {
    path: "/terms",
    file: "terms.html",
    src: "terms.html",
    title: "Terms of Service — Webklip",
    description: "Terms governing use of the Webklip web clipboard service.",
  },
  {
    path: "/security",
    file: "security.html",
    src: "security.html",
    title: "Security — Webklip",
    description:
      "How Webklip protects your data: ephemeral storage, PINs, rate limits, and encryption options.",
  },
] as const;

for (const page of legalPages) {
  let body = readFileSync(join(STATIC, "pages", page.src), "utf-8");
  body = replaceVars(body, {
    CONTACT_EMAIL: ctx.contactEmail,
    LEGAL_UPDATED: ctx.legalUpdated,
    COOKIES_ANALYTICS_NOTE: ctx.umami.cookiesNote,
    UMAMI_ANALYTICS_LI: ctx.umami.analyticsLi,
    UMAMI_NOT_DO_LI: ctx.umami.notDoLi,
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
    description: "REST API, CLI, and webhooks for automating Webklip.",
  },
  {
    path: "/docs/api",
    file: "docs-api.html",
    src: "docs/api.html",
    title: "REST API — Webklip Docs",
    description: "Webklip REST API reference for clips, files, and authentication.",
  },
  {
    path: "/docs/cli",
    file: "docs-cli.html",
    src: "docs/cli.html",
    title: "CLI — Webklip Docs",
    description: "Command-line interface for creating and reading clips.",
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

const sitemapPaths = Object.keys(routes).sort((a, b) => {
  if (a === "/") return -1;
  if (b === "/") return 1;
  return a.localeCompare(b);
});
writeFileSync(join(OUT, "sitemap-paths.json"), JSON.stringify(sitemapPaths, null, 2));

const siteUrl = (process.env.SITE_URL ?? "https://webklip.com").trim().replace(/\/$/, "");
writeFileSync(join(OUT, "sitemap.xml"), buildSitemap(siteUrl, sitemapPaths));
writeFileSync(join(OUT, "robots.txt"), buildRobots(siteUrl));

writeFileSync(join(OUT, "routes.json"), JSON.stringify(routes, null, 2));

console.log(`Static pages built → ${OUT} (${Object.keys(routes).length} pages)`);

export { buildSitemap, buildRobots, sitemapPaths };
