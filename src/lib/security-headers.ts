import { umamiScriptOrigin } from "./umami";

// Inline script hash reported by browser CSP on production (not from app source).
const KNOWN_INLINE_SCRIPT_HASHES = [
  "'sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU='",
];

// Extra hashes from browser CSP reports (comma-separated sha256-... values).
function extraScriptHashes(): string[] {
  const raw = process.env.CSP_SCRIPT_HASHES?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (value.startsWith("'") ? value : `'${value}'`));
}

const DEFAULT_SECRETS = new Set([
  "webklip-dev-secret-change-me",
  "change-me-in-production",
]);

export function isWeakSessionSecret(secret: string | undefined): boolean {
  if (!secret || secret.length < 32) return true;
  return DEFAULT_SECRETS.has(secret);
}

export function validateProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;

  const secret = process.env.SESSION_SECRET;
  if (isWeakSessionSecret(secret)) {
    console.error(
      "FATAL: SESSION_SECRET must be set to a strong random value (32+ chars) in production."
    );
    process.exit(1);
  }
}

function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function securityHeaders(): Record<string, string> {
  const umamiOrigin = umamiScriptOrigin();
  const scriptParts = ["'self'"];
  if (umamiOrigin) scriptParts.push(umamiOrigin);
  scriptParts.push(...KNOWN_INLINE_SCRIPT_HASHES);
  scriptParts.push(...extraScriptHashes());
  // Allow arbitrary inline scripts only in development (htmx swaps, ad-hoc debugging).
  if (isDevelopment()) scriptParts.push("'unsafe-inline'");
  const scriptSrc = scriptParts.join(" ");
  const connectSrc = umamiOrigin
    ? `'self' wss: ws: ${umamiOrigin}`
    : "'self' wss: ws:";

  return {
    "Content-Security-Policy":
      `default-src 'self'; script-src ${scriptSrc}; script-src-elem ${scriptSrc}; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src ${connectSrc}; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}
