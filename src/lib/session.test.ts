import { describe, expect, test } from "bun:test";
import { signSession, verifySessionToken } from "./session";
import {
  canAttemptLogin,
  recordLoginFailure,
  clearLoginFailures,
  canRegister,
  canRequestPasswordReset,
} from "./auth-throttle";
import { isMailerConfigured, mailerRecentlyFailed, sendMail } from "./mailer";
import { isEmailVerificationRequired, verifyUrl } from "./email-verification";
import { isReservedSlug } from "./constants";

const USER_ID = "4b385d3c-cbd7-4dbb-8b7e-8d6e70adcf50";
const now = () => Math.floor(Date.now() / 1000);

describe("session token", () => {
  test("round-trips user id, issue time and version", () => {
    const issuedAt = now();
    const claims = verifySessionToken(signSession(USER_ID, issuedAt, 3));
    expect(claims).toEqual({ userId: USER_ID, issuedAt, version: 3 });
  });

  test("rejects a tampered signature", () => {
    const token = signSession(USER_ID, now(), 0);
    const forged = `${token.slice(0, -4)}AAAA`;
    expect(verifySessionToken(forged)).toBeNull();
  });

  test("rejects a token whose claims were edited", () => {
    const token = signSession(USER_ID, now(), 0);
    const sig = token.split(".")[3];
    expect(verifySessionToken(`${USER_ID}.${now()}.99.${sig}`)).toBeNull();
  });

  test("rejects a token older than 30 days", () => {
    const stale = now() - 31 * 86400;
    expect(verifySessionToken(signSession(USER_ID, stale, 0))).toBeNull();
  });

  test("accepts a token just inside the 30 day window", () => {
    const recent = now() - 29 * 86400;
    expect(verifySessionToken(signSession(USER_ID, recent, 0))?.userId).toBe(USER_ID);
  });

  test("rejects the legacy two-part token format", () => {
    expect(verifySessionToken(`${USER_ID}.somesignature`)).toBeNull();
  });
});

function headersFor(ip: string): Headers {
  return new Headers({ "x-forwarded-for": ip });
}

describe("login throttle", () => {
  test("locks the account after repeated failures", () => {
    const headers = headersFor("203.0.113.10");
    const email = "victim@example.com";
    clearLoginFailures(headers, email);

    expect(canAttemptLogin(headers, email)).toBe(true);
    for (let i = 0; i < 8; i++) recordLoginFailure(headers, email);
    expect(canAttemptLogin(headers, email)).toBe(false);
  });

  test("a successful login clears the counter", () => {
    const headers = headersFor("203.0.113.11");
    const email = "user@example.com";
    for (let i = 0; i < 8; i++) recordLoginFailure(headers, email);
    clearLoginFailures(headers, email);
    expect(canAttemptLogin(headers, email)).toBe(true);
  });

  test("a spray from one IP is blocked even across different emails", () => {
    const headers = headersFor("203.0.113.12");
    for (let i = 0; i < 8; i++) recordLoginFailure(headers, `user${i}@example.com`);
    expect(canAttemptLogin(headers, "untouched@example.com")).toBe(false);
  });

  test("one attacked email does not lock out other IPs", () => {
    const attacker = headersFor("203.0.113.13");
    const email = "shared@example.com";
    clearLoginFailures(attacker, email);
    for (let i = 0; i < 8; i++) recordLoginFailure(attacker, email);
    // Same email, but the per-email counter is now tripped, so the real owner is
    // locked too — that is the deliberate trade-off. A different email is fine.
    expect(canAttemptLogin(headersFor("198.51.100.1"), "other@example.com")).toBe(true);
  });
});

describe("registration throttle", () => {
  test("allows a handful then blocks the IP", () => {
    const headers = headersFor("203.0.113.20");
    const results = Array.from({ length: 7 }, () => canRegister(headers));
    expect(results.slice(0, 5)).toEqual([true, true, true, true, true]);
    expect(results.slice(5)).toEqual([false, false]);
  });
});

describe("password reset throttle", () => {
  test("caps reset emails per address", () => {
    const headers = headersFor("203.0.113.30");
    const email = "target@example.com";
    const results = Array.from({ length: 5 }, () =>
      canRequestPasswordReset(headers, email)
    );
    expect(results).toEqual([true, true, true, false, false]);
  });

  test("caps reset requests per IP across addresses", () => {
    const headers = headersFor("203.0.113.31");
    const results = Array.from({ length: 7 }, (_, i) =>
      canRequestPasswordReset(headers, `person${i}@example.com`)
    );
    expect(results.slice(0, 5)).toEqual([true, true, true, true, true]);
    expect(results.slice(5)).toEqual([false, false]);
  });
});

describe("email verification gating", () => {
  test("is required exactly when the mailer can send", () => {
    const prevKey = process.env.RESEND_API_KEY;
    const prevFrom = process.env.MAIL_FROM;

    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
    expect(isEmailVerificationRequired()).toBe(false);

    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM = "Webklip <noreply@webklip.com>";
    expect(isEmailVerificationRequired()).toBe(true);

    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = prevFrom;
  });

  test("builds a confirmation link under SITE_URL", () => {
    const prev = process.env.SITE_URL;
    process.env.SITE_URL = "https://example.test/";
    expect(verifyUrl("abc123")).toBe("https://example.test/verify-email/abc123");
    if (prev === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = prev;
  });

  test("verify-email cannot be taken as a clip slug", () => {
    expect(isReservedSlug("verify-email")).toBe(true);
    expect(isReservedSlug("verify-email/anything")).toBe(true);
  });
});

/** Stands in for the network so the mailer can be driven to a known outcome. */
function stubFetch(status: number): typeof fetch {
  return (async () => new Response("{}", { status })) as unknown as typeof fetch;
}

describe("mailer health signal", () => {
  test("reports healthy before anything has failed", () => {
    expect(mailerRecentlyFailed()).toBe(false);
  });

  test("flags a recent failure, then clears after a success", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    const prevFrom = process.env.MAIL_FROM;
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM = "Webklip <noreply@webklip.com>";

    const realFetch = globalThis.fetch;
    globalThis.fetch = stubFetch(500);
    expect(await sendMail({ to: "a@b.test", subject: "s", text: "t" })).toBe(false);
    expect(mailerRecentlyFailed()).toBe(true);

    globalThis.fetch = stubFetch(200);
    expect(await sendMail({ to: "a@b.test", subject: "s", text: "t" })).toBe(true);
    expect(mailerRecentlyFailed()).toBe(false);

    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = prevFrom;
  });

  test("an unconfigured mailer is not treated as a failure", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    expect(await sendMail({ to: "a@b.test", subject: "s", text: "t" })).toBe(false);
    expect(mailerRecentlyFailed()).toBe(false);

    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
  });
});

describe("mailer configuration", () => {
  test("stays disabled unless both key and sender are set", () => {
    const prevKey = process.env.RESEND_API_KEY;
    const prevFrom = process.env.MAIL_FROM;

    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
    expect(isMailerConfigured()).toBe(false);

    process.env.RESEND_API_KEY = "re_test";
    expect(isMailerConfigured()).toBe(false);

    process.env.MAIL_FROM = "Webklip <noreply@webklip.com>";
    expect(isMailerConfigured()).toBe(true);

    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = prevFrom;
  });
});
