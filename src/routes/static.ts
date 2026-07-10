import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";

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
  return c.html(readPage(filename));
});

export { staticPages, loadRoutes };
