import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { getUmamiConfig, umamiScriptTag } from "../lib/umami";

const PAGES_DIR = join(process.cwd(), "dist", "pages");

let routes: Record<string, string> | null = null;

function loadRoutes(): Record<string, string> {
  if (routes) return routes;
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

const staticPages = new Hono();

staticPages.get("/sitemap.xml", (c) => {
  const base = new URL(c.req.url).origin;
  const paths = existsSync(join(PAGES_DIR, "sitemap-paths.json"))
    ? (JSON.parse(readFileSync(join(PAGES_DIR, "sitemap-paths.json"), "utf-8")) as string[])
    : ["/"];
  const urls = paths.map((path) => `  <url><loc>${base}${path}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  return c.body(xml, 200, { "Content-Type": "application/xml" });
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
  const base = new URL(c.req.url).origin;
  return c.text(`User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
`);
});

staticPages.get("*", (c, next) => {
  const filename = loadRoutes()[c.req.path];
  if (!filename || !existsSync(join(PAGES_DIR, filename))) {
    return next();
  }
  return c.html(injectRuntimeScripts(readPage(filename)));
});

export { staticPages, loadRoutes };
