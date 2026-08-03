import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { getUmamiConfig, umamiScriptTag } from "../lib/umami";
import { listPublicClips } from "../store/clips";
import { renderExplorePreviewHtml } from "../lib/explore-preview";
import { siteUrl } from "../lib/constants";
import { injectAuthNav } from "../lib/auth-nav";
import { resolveAuth } from "../lib/session";

const PAGES_DIR = join(process.cwd(), "dist", "pages");
const EXPLORE_PREVIEW_MARKER = "<!--EXPLORE_PREVIEW-->";

let routes: Record<string, string> | null = null;

function loadRoutes(): Record<string, string> {
  const isDev = process.env.WEBKLIP_DEV === "1";
  if (routes && !isDev) return routes;
  const manifestPath = join(PAGES_DIR, "routes.json");
  if (!existsSync(manifestPath)) {
    console.warn("Static pages not built — run: bun run build:static");
    routes = {};
    return routes;
  }
  routes = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, string>;
  return routes;
}

function readPage(filename: string): string {
  return readFileSync(join(PAGES_DIR, filename), "utf-8");
}

function injectRuntimeScripts(html: string): string {
  const tag = umamiScriptTag();
  if (!tag) return html;

  const config = getUmamiConfig();
  if (config && html.includes(config.scriptUrl)) return html;

  return html.replace("</head>", `  ${tag}\n</head>`);
}

/** Article body for in-app docs modal (`?embed=1`). */
function extractDocsEmbed(html: string): string | null {
  const match = html.match(
    /<article class="docs-prose[^"]*"[^>]*>([\s\S]*?)<\/article>/i
  );
  if (!match) return null;
  return `<div class="docs-prose legal-prose docs-embed">${match[1].trim()}</div>`;
}

async function injectExplorePreview(html: string): Promise<string> {
  if (!html.includes(EXPLORE_PREVIEW_MARKER)) return html;
  const clips = await listPublicClips(3);
  return html.replace(EXPLORE_PREVIEW_MARKER, renderExplorePreviewHtml(clips));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadStaticSitemapPaths(): string[] {
  const pathsFile = join(PAGES_DIR, "sitemap-paths.json");
  if (existsSync(pathsFile)) {
    return JSON.parse(readFileSync(pathsFile, "utf-8")) as string[];
  }
  return ["/", "/klipwall", "/contact"];
}

function buildSitemapXml(base: string, paths: string[]): string {
  const urls = paths
    .map((path) => {
      const loc = path === "/" ? `${base}/` : `${base}${path}`;
      return `  <url><loc>${escapeXml(loc)}</loc></url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

const staticPages = new Hono();

staticPages.get("/sitemap.xml", async (c) => {
  const base = siteUrl() || new URL(c.req.url).origin;
  const paths = loadStaticSitemapPaths();
  const publicClips = await listPublicClips(500);
  const clipPaths = publicClips.map((clip) => `/${clip.slug}`);
  const allPaths = [...new Set([...paths, ...clipPaths])].sort((a, b) => {
    if (a === "/") return -1;
    if (b === "/") return 1;
    return a.localeCompare(b);
  });
  const xml = buildSitemapXml(base.replace(/\/$/, ""), allPaths);
  return c.body(xml, 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});

staticPages.get("/structured-data/:file", (c) => {
  const file = c.req.param("file");
  if (!/^[\w-]+\.json$/.test(file)) return c.notFound();

  const path = join(PAGES_DIR, "structured-data", file);
  if (!existsSync(path)) return c.notFound();

  return c.body(readFileSync(path), 200, {
    "Content-Type": "application/ld+json; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});

staticPages.get("/robots.txt", (c) => {
  const staticPath = join(PAGES_DIR, "robots.txt");
  if (existsSync(staticPath)) {
    return c.text(readFileSync(staticPath, "utf-8"), 200, {
      "Cache-Control": "public, max-age=3600",
    });
  }

  const base = siteUrl() || new URL(c.req.url).origin;
  return c.text(`User-agent: *
Allow: /

Sitemap: ${base.replace(/\/$/, "")}/sitemap.xml
`);
});

staticPages.get("*", async (c, next) => {
  const filename = loadRoutes()[c.req.path];
  if (!filename || !existsSync(join(PAGES_DIR, filename))) {
    return next();
  }
  let html = injectRuntimeScripts(readPage(filename));
  if (c.req.path === "/") {
    html = await injectExplorePreview(html);
  }
  if (c.req.query("embed") === "1" && c.req.path.startsWith("/docs")) {
    const embed = extractDocsEmbed(html);
    if (!embed) return c.notFound();
    return c.html(embed, 200, {
      "Cache-Control": "public, max-age=300",
    });
  }
  html = injectAuthNav(html, await resolveAuth(c));
  return c.html(html, 200, { Vary: "Cookie" });
});

export { staticPages, loadRoutes };
