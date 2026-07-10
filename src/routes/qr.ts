import { Hono } from "hono";
import { renderSVG } from "uqr";
import { isValidSlug, parseVanitySlug, RESERVED_SLUGS } from "../lib/constants";

const qr = new Hono();

function buildQrUrl(c: { req: { header: (n: string) => string | undefined } }, path: string) {
  const proto = c.req.header("x-forwarded-proto") ?? "http";
  const host = c.req.header("host") ?? "localhost:3000";
  return `${proto}://${host}${path}`;
}

qr.get("/:team/:name/qr", (c) => {
  const team = c.req.param("team");
  const name = c.req.param("name");
  if (RESERVED_SLUGS.has(team)) return c.text("Invalid", 400);
  const slug = parseVanitySlug(team, name);
  if (!slug) return c.text("Invalid slug", 400);
  const svg = renderSVG(buildQrUrl(c, `/${slug}`), { border: 2, pixelSize: 6 });
  return c.body(svg, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "no-cache",
  });
});

qr.get("/:slug/qr", (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug)) return c.text("Invalid slug", 400);
  const svg = renderSVG(buildQrUrl(c, `/${slug}`), { border: 2, pixelSize: 6 });
  return c.body(svg, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "no-cache",
  });
});

export { qr };
