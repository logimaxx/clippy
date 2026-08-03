import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { contact } from "../routes/contact";
import { sendMail } from "./mailer";

describe("sendMail replyTo", () => {
  test("includes reply_to in the Resend payload when set", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    const prevFrom = process.env.MAIL_FROM;
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM = "Webklip <noreply@webklip.com>";

    let captured: unknown;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url, init) => {
      captured = JSON.parse(String(init?.body));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    expect(
      await sendMail({
        to: "inbox@example.com",
        replyTo: "user@example.com",
        subject: "s",
        text: "t",
      })
    ).toBe(true);
    expect(captured).toEqual({
      from: "Webklip <noreply@webklip.com>",
      to: ["inbox@example.com"],
      subject: "s",
      text: "t",
      reply_to: "user@example.com",
    });

    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = prevFrom;
  });
});

describe("contact form", () => {
  function app() {
    const h = new Hono();
    h.route("/", contact);
    return h;
  }

  test("GET /contact renders the page", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    const prevFrom = process.env.MAIL_FROM;
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM = "Webklip <noreply@webklip.com>";

    const res = await app().request("/contact");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<h1>Contact</h1>");
    expect(html).toContain('action="/contact"');

    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = prevFrom;
  });

  test("GET /contact falls back to mailto when mailer is off", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    const prevFrom = process.env.MAIL_FROM;
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;

    const res = await app().request("/contact");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<h1>Contact</h1>");
    expect(html).toContain("mailto:");
    expect(html).not.toContain('action="/contact"');

    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = prevFrom;
  });

  test("POST rejects a short message", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    const prevFrom = process.env.MAIL_FROM;
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM = "Webklip <noreply@webklip.com>";

    const body = new URLSearchParams({
      email: "user@example.com",
      message: "too short",
    });
    const res = await app().request("/contact", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("at least 10 characters");

    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = prevFrom;
  });

  test("POST sends mail with reply-to and shows success", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    const prevFrom = process.env.MAIL_FROM;
    const prevContact = process.env.CONTACT_EMAIL;
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM = "Webklip <noreply@webklip.com>";
    process.env.CONTACT_EMAIL = "team@webklip.test";

    let captured: unknown;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url, init) => {
      captured = JSON.parse(String(init?.body));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const body = new URLSearchParams({
      name: "Ada",
      email: "ada@example.com",
      message: "Hello from the contact form test.",
    });
    const res = await app().request("/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Forwarded-For": "203.0.113.50",
      },
      body,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("on its way");
    expect(captured).toMatchObject({
      to: ["team@webklip.test"],
      reply_to: "ada@example.com",
      subject: "Webklip contact from Ada",
    });

    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = prevFrom;
    if (prevContact === undefined) delete process.env.CONTACT_EMAIL;
    else process.env.CONTACT_EMAIL = prevContact;
  });

  test("POST honeypot pretends success without sending", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    const prevFrom = process.env.MAIL_FROM;
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM = "Webklip <noreply@webklip.com>";

    let sent = false;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      sent = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const body = new URLSearchParams({
      company: "Bot Corp",
      email: "bot@example.com",
      message: "This should not be delivered at all.",
    });
    const res = await app().request("/contact", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("on its way");
    expect(sent).toBe(false);

    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = prevFrom;
  });
});
