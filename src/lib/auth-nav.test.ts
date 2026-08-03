import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { accountInitials, injectAuthNav } from "./auth-nav";

const HEADER_PARTIAL = readFileSync(
  join(import.meta.dir, "..", "..", "website", "static", "partials", "header.html"),
  "utf-8"
);

describe("account initials", () => {
  test("uses the display name when there is one", () => {
    expect(accountInitials({ name: "Ada Lovelace", email: "ada@example.com" })).toBe("AL");
  });

  /** Case comes from the source string; the avatar uppercases in CSS. */
  test("falls back to the email local part", () => {
    expect(accountInitials({ name: null, email: "ada.lovelace@example.com" })).toBe("al");
    expect(accountInitials({ name: "  ", email: "ada@example.com" })).toBe("ae");
  });
});

describe("marketing header auth region", () => {
  test("the prebuilt header ships the signed-out cluster inside the markers", () => {
    expect(HEADER_PARTIAL).toContain("<!--AUTH_NAV-->");
    expect(HEADER_PARTIAL).toContain("<!--/AUTH_NAV-->");
    expect(HEADER_PARTIAL).toContain('href="/register"');
  });

  test("a session swaps the region for the account pill", () => {
    const html = injectAuthNav(HEADER_PARTIAL, {
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(html).toContain('href="/account"');
    expect(html).toContain("AL");
    expect(html).not.toContain('href="/register"');
    expect(html).not.toContain("<!--AUTH_NAV-->");
  });

  test("signed-out pages are left untouched", () => {
    expect(injectAuthNav(HEADER_PARTIAL, null)).toBe(HEADER_PARTIAL);
  });

  test("account labels cannot inject markup", () => {
    const html = injectAuthNav(HEADER_PARTIAL, {
      name: '"><script>alert(1)</script>',
      email: "x@example.com",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
