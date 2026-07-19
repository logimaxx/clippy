import type { Context, Next } from "hono";
import { timingSafeEqual } from "node:crypto";

const ADMIN_PATH_RE = /^\/[a-zA-Z0-9][a-zA-Z0-9_/-]*$/;

let cachedPath: string | null = null;

export function normalizeAdminPath(raw: string | undefined): string {
  let path = (raw ?? "/admin").trim() || "/admin";
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path === "/" || !ADMIN_PATH_RE.test(path)) {
    throw new Error(
      "ADMIN_PATH must be a path like /admin or /internal/stats (letters, numbers, _, -, /)"
    );
  }
  return path;
}

export function getAdminPath(): string {
  if (cachedPath === null) {
    cachedPath = normalizeAdminPath(process.env.ADMIN_PATH);
  }
  return cachedPath;
}

export function isAdminEnabled(): boolean {
  const user = process.env.ADMIN_USER?.trim();
  const password = process.env.ADMIN_PASSWORD;
  return Boolean(user && password);
}

export function getAdminReservedSegments(): Set<string> {
  const segments = new Set<string>();
  for (const part of getAdminPath().split("/").filter(Boolean)) {
    segments.add(part.toLowerCase());
  }
  return segments;
}

export function isAdminPathSegment(segment: string): boolean {
  return getAdminReservedSegments().has(segment.toLowerCase());
}

function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function adminBasicAuth() {
  const expectedUser = process.env.ADMIN_USER?.trim() ?? "";
  const expectedPassword = process.env.ADMIN_PASSWORD ?? "";

  return async (c: Context, next: Next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Basic ")) {
      return unauthorized(c);
    }

    let decoded: string;
    try {
      decoded = atob(header.slice(6));
    } catch {
      return unauthorized(c);
    }

    const colon = decoded.indexOf(":");
    if (colon < 0) return unauthorized(c);

    const user = decoded.slice(0, colon);
    const password = decoded.slice(colon + 1);

    if (!safeEqual(user, expectedUser) || !safeEqual(password, expectedPassword)) {
      return unauthorized(c);
    }

    await next();
  };
}

function unauthorized(c: Context) {
  c.header("WWW-Authenticate", 'Basic realm="Webklip Admin", charset="UTF-8"');
  return c.text("Unauthorized", 401);
}
