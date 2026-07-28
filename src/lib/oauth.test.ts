import { describe, expect, test } from "bun:test";
import {
  createOauthState,
  enabledOauthProviders,
  getOauthProviderConfig,
  isOauthProvider,
  oauthCallbackUrl,
  verifyOauthState,
} from "./oauth";

describe("isOauthProvider", () => {
  test("accepts google and github only", () => {
    expect(isOauthProvider("google")).toBe(true);
    expect(isOauthProvider("github")).toBe(true);
    expect(isOauthProvider("twitter")).toBe(false);
  });
});

describe("oauth state", () => {
  test("round-trips for matching provider", () => {
    const state = createOauthState("google");
    expect(verifyOauthState(state, "google")).toBe(true);
    expect(verifyOauthState(state, "github")).toBe(false);
    expect(verifyOauthState("tampered." + state, "google")).toBe(false);
  });
});

describe("provider config", () => {
  test("disabled without env credentials", () => {
    const prevGoogleId = process.env.GOOGLE_CLIENT_ID;
    const prevGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;
    const prevGithubId = process.env.GITHUB_CLIENT_ID;
    const prevGithubSecret = process.env.GITHUB_CLIENT_SECRET;

    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;

    expect(getOauthProviderConfig("google")).toBeNull();
    expect(getOauthProviderConfig("github")).toBeNull();
    expect(enabledOauthProviders()).toEqual([]);

    process.env.GOOGLE_CLIENT_ID = "g-id";
    process.env.GOOGLE_CLIENT_SECRET = "g-secret";
    expect(getOauthProviderConfig("google")?.clientId).toBe("g-id");
    expect(enabledOauthProviders()).toEqual(["google"]);

    if (prevGoogleId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = prevGoogleId;
    if (prevGoogleSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = prevGoogleSecret;
    if (prevGithubId === undefined) delete process.env.GITHUB_CLIENT_ID;
    else process.env.GITHUB_CLIENT_ID = prevGithubId;
    if (prevGithubSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET;
    else process.env.GITHUB_CLIENT_SECRET = prevGithubSecret;
  });
});

describe("oauthCallbackUrl", () => {
  test("uses SITE_URL", () => {
    const prev = process.env.SITE_URL;
    process.env.SITE_URL = "https://example.test/";
    expect(oauthCallbackUrl("github")).toBe(
      "https://example.test/auth/github/callback"
    );
    if (prev === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = prev;
  });
});
