import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { getUmamiConfig, umamiScriptTag } from "../lib/umami";
import { listPublicClips } from "../store/clips";
import { renderExplorePreviewHtml } from "../lib/explore-preview";

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

async function injectExplorePreview(html: string): Promise<string> {
  if (!html.includes(EXPLORE_PREVIEW_MARKER)) return html;
  const clips = await listPublicClips(3);
  return html.replace(EXPLORE_PREVIEW_MARKER, renderExplorePreviewHtml(clips));
}

const staticPages = new Hono();

staticPages.get("/sitemap.xml", (c) => {
  const staticPath = join(PAGES_DIR, "sitemap.xml");
  if (existsSync(staticPath)) {
    return c.body(readFileSync(staticPath, "utf-8"), 200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    });
  }

  const base = new URL(c.req.url).origin;
  const paths = existsSync(join(PAGES_DIR, "sitemap-paths.json"))
    ? (JSON.parse(readFileSync(join(PAGES_DIR, "sitemap-paths.json"), "utf-8")) as string[])
    : ["/"];
  const urls = paths.map((path) => `  <url><loc>${base}${path}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  return c.body(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
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

  const base = new URL(c.req.url).origin;
  return c.text(`User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
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
  return c.html(html);
});

export { staticPages, loadRoutes };
