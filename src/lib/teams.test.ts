import { describe, expect, test } from "bun:test";
import { isInvitableRole, inviteUrl, INVITABLE_ROLES } from "./team-invites";
import { isAdminRole } from "./teams";
import { isReservedSlug, RESERVED_SLUGS, safeNext } from "./constants";

describe("team roles", () => {
  test("only owner and admin manage members", () => {
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("member")).toBe(false);
    expect(isAdminRole("viewer")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });

  test("owner cannot be handed out through an invite", () => {
    expect(INVITABLE_ROLES).not.toContain("owner");
    expect(isInvitableRole("owner")).toBe(false);
    expect(isInvitableRole("admin")).toBe(true);
    expect(isInvitableRole("member")).toBe(true);
    expect(isInvitableRole("viewer")).toBe(true);
  });

  test("rejects made-up roles", () => {
    expect(isInvitableRole("superuser")).toBe(false);
    expect(isInvitableRole("")).toBe(false);
  });
});

describe("team slugs", () => {
  test("built-in routes cannot be claimed as a team", () => {
    for (const slug of ["api", "login", "account", "docs", "explore", "klipwall"]) {
      expect(isReservedSlug(slug)).toBe(true);
    }
  });

  test("SEO landing pages are protected too", () => {
    expect(isReservedSlug("online-clipboard")).toBe(true);
    expect(RESERVED_SLUGS.has("live-sync")).toBe(true);
  });

  test("an ordinary name is still available", () => {
    expect(isReservedSlug("acme")).toBe(false);
    expect(isReservedSlug("my-team")).toBe(false);
  });
});

describe("post-login redirect", () => {
  test("keeps ordinary in-app paths", () => {
    expect(safeNext("/teams/invite/abc")).toBe("/teams/invite/abc");
    expect(safeNext("/account")).toBe("/account");
  });

  test("refuses anything that could leave the site", () => {
    expect(safeNext("//evil.example")).toBeUndefined();
    expect(safeNext("https://evil.example")).toBeUndefined();
    expect(safeNext("/\\evil.example")).toBeUndefined();
    expect(safeNext("javascript:alert(1)")).toBeUndefined();
    expect(safeNext("/ok\nSet-Cookie: x=1")).toBeUndefined();
  });

  test("ignores empty and non-string input", () => {
    expect(safeNext("")).toBeUndefined();
    expect(safeNext(undefined)).toBeUndefined();
    expect(safeNext(42)).toBeUndefined();
  });
});

describe("invite links", () => {
  test("point at the public site", () => {
    const prev = process.env.SITE_URL;
    process.env.SITE_URL = "https://example.test/";
    expect(inviteUrl("tok")).toBe("https://example.test/teams/invite/tok");
    if (prev === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = prev;
  });
});
