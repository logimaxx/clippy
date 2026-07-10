import { umamiScriptOrigin } from "./umami";

const DEFAULT_SECRETS = new Set([
  "clippy-dev-secret-change-me",
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
  // JSON-LD and other inline scripts are blocked under strict script-src in dev.
  if (isDevelopment()) scriptParts.push("'unsafe-inline'");
  const scriptSrc = scriptParts.join(" ");
  const connectSrc = umamiOrigin
    ? `'self' wss: ws: ${umamiOrigin}`
    : "'self' wss: ws:";

  return {
    "Content-Security-Policy":
      `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src ${connectSrc}; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}
