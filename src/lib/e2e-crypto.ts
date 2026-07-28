/**
 * Passphrase-protected E2E primitives (PBKDF2 + AES-GCM wrapped DEK).
 * Mirrored in assets/src/e2e.js for the browser.
 */

export const E2E_PBKDF2_ITERS = 600_000;
export const E2E_SALT_BYTES = 16;
export const E2E_DEK_BYTES = 32;
export const E2E_IV_BYTES = 12;

export type E2eKdfParams = {
  alg: "PBKDF2";
  hash: "SHA-256";
  iters: number;
};

export function defaultE2eKdf(iters = E2E_PBKDF2_ITERS): E2eKdfParams {
  return { alg: "PBKDF2", hash: "SHA-256", iters };
}

export function isWeakPassphrase(passphrase: string): boolean {
  const t = passphrase.trim();
  if (t.length < 8) return true;
  if (/^\d+$/.test(t)) return true;
  return false;
}

function bytesToB64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytes(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importAesKey(
  raw: Uint8Array,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, usages);
}

export async function deriveKek(
  passphrase: string,
  salt: Uint8Array,
  iters: number
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: iters,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function wrapDek(
  dek: Uint8Array,
  kek: CryptoKey
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(E2E_IV_BYTES));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, dek);
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return bytesToB64Url(out);
}

export async function unwrapDek(
  wrappedB64: string,
  kek: CryptoKey
): Promise<Uint8Array> {
  const data = b64UrlToBytes(wrappedB64);
  if (data.length < E2E_IV_BYTES + 16) throw new Error("Wrapped key too short");
  const iv = data.slice(0, E2E_IV_BYTES);
  const ct = data.slice(E2E_IV_BYTES);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, kek, ct);
  return new Uint8Array(pt);
}

export async function encryptWithDek(
  plaintext: string,
  dek: Uint8Array
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(E2E_IV_BYTES));
  const key = await importAesKey(dek, ["encrypt"]);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return bytesToB64Url(out);
}

export async function decryptWithDek(
  payload: string,
  dek: Uint8Array
): Promise<string> {
  const data = b64UrlToBytes(payload.trim());
  if (data.length < E2E_IV_BYTES + 1) throw new Error("Ciphertext too short");
  const iv = data.slice(0, E2E_IV_BYTES);
  const ct = data.slice(E2E_IV_BYTES);
  const key = await importAesKey(dek, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

export type EnabledProtection = {
  saltB64: string;
  wrappedKeyB64: string;
  kdf: E2eKdfParams;
  dek: Uint8Array;
};

/** Create salt + random DEK wrapped with a passphrase-derived KEK. */
export async function enablePassphraseProtection(
  passphrase: string,
  iters = E2E_PBKDF2_ITERS
): Promise<EnabledProtection> {
  const salt = crypto.getRandomValues(new Uint8Array(E2E_SALT_BYTES));
  const dek = crypto.getRandomValues(new Uint8Array(E2E_DEK_BYTES));
  const kdf = defaultE2eKdf(iters);
  const kek = await deriveKek(passphrase, salt, kdf.iters);
  const wrappedKeyB64 = await wrapDek(dek, kek);
  return {
    saltB64: bytesToB64Url(salt),
    wrappedKeyB64,
    kdf,
    dek,
  };
}

/** Unwrap DEK from stored salt + wrapped key using the passphrase. */
export async function unlockPassphraseProtection(
  passphrase: string,
  saltB64: string,
  wrappedKeyB64: string,
  kdf: E2eKdfParams
): Promise<Uint8Array> {
  const salt = b64UrlToBytes(saltB64);
  const kek = await deriveKek(passphrase, salt, kdf.iters);
  return unwrapDek(wrappedKeyB64, kek);
}

export { bytesToB64Url, b64UrlToBytes };
