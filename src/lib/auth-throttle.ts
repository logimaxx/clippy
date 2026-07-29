import { rateLimit, getClientIp } from "./rate-limit";

const MAX_LOGIN_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;
const REGISTER_PER_IP = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const RESET_PER_IP = 5;
const RESET_PER_EMAIL = 3;
const RESET_WINDOW_MS = 60 * 60 * 1000;

const attempts = new Map<string, { count: number; resetAt: number }>();

/**
 * Failed logins are counted per IP and per email separately, so a spray across
 * many accounts and a focused attack on one account both hit a wall.
 */
function keysFor(ip: string, email: string): string[] {
  return [`ip:${ip}`, `email:${email}`];
}

function isLocked(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry || Date.now() >= entry.resetAt) return false;
  return entry.count >= MAX_LOGIN_ATTEMPTS;
}

export function canAttemptLogin(headers: Headers, email: string): boolean {
  const ip = getClientIp(headers);
  return !keysFor(ip, email).some(isLocked);
}

export function recordLoginFailure(headers: Headers, email: string) {
  const ip = getClientIp(headers);
  const now = Date.now();
  for (const key of keysFor(ip, email)) {
    let entry = attempts.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + LOCKOUT_MS };
    }
    entry.count += 1;
    attempts.set(key, entry);
  }
}

export function clearLoginFailures(headers: Headers, email: string) {
  const ip = getClientIp(headers);
  for (const key of keysFor(ip, email)) attempts.delete(key);
}

export function canRegister(headers: Headers): boolean {
  const ip = getClientIp(headers);
  return rateLimit(`register:${ip}`, REGISTER_PER_IP, REGISTER_WINDOW_MS).allowed;
}

/** Caps reset emails so the form cannot be used to spam an inbox. */
export function canRequestPasswordReset(headers: Headers, email: string): boolean {
  const ip = getClientIp(headers);
  const perIp = rateLimit(`reset-ip:${ip}`, RESET_PER_IP, RESET_WINDOW_MS).allowed;
  const perEmail = rateLimit(`reset-email:${email}`, RESET_PER_EMAIL, RESET_WINDOW_MS)
    .allowed;
  return perIp && perEmail;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now >= entry.resetAt) attempts.delete(key);
  }
}, 5 * 60 * 1000);
