import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  APP_ACCESS_URL,
  getUmamiConfig,
  isUmamiEnabled,
  trackAppAccess,
  umamiApiOrigin,
  umamiScriptOrigin,
} from "./umami";

const ENV_KEYS = [
  "UMAMI_WEBSITE_ID",
  "UMAMI_SCRIPT_URL",
  "UMAMI_URL",
  "SITE_URL",
] as const;

const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
const originalFetch = globalThis.fetch;

function snapshotEnv(): void {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
  }
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearUmamiEnv(): void {
  delete process.env.UMAMI_WEBSITE_ID;
  delete process.env.UMAMI_SCRIPT_URL;
  delete process.env.UMAMI_URL;
}

snapshotEnv();

afterEach(() => {
  restoreEnv();
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("getUmamiConfig", () => {
  test("returns null when website id is unset", () => {
    clearUmamiEnv();
    expect(getUmamiConfig()).toBeNull();
    expect(isUmamiEnabled()).toBe(false);
  });

  test("returns null when script url cannot be derived", () => {
    clearUmamiEnv();
    process.env.UMAMI_WEBSITE_ID = "website-id";
    expect(getUmamiConfig()).toBeNull();
  });

  test("derives script url from UMAMI_URL", () => {
    clearUmamiEnv();
    process.env.UMAMI_WEBSITE_ID = "website-id";
    process.env.UMAMI_URL = "https://umami.example.com/";
    expect(getUmamiConfig()).toEqual({
      websiteId: "website-id",
      scriptUrl: "https://umami.example.com/script.js",
    });
    expect(umamiScriptOrigin()).toBe("https://umami.example.com");
    expect(umamiApiOrigin()).toBe("https://umami.example.com");
  });

  test("umamiApiOrigin is null without UMAMI_URL", () => {
    clearUmamiEnv();
    process.env.UMAMI_WEBSITE_ID = "website-id";
    process.env.UMAMI_SCRIPT_URL = "https://umami.example.com/script.js";
    expect(umamiApiOrigin()).toBeNull();
  });
});

describe("trackAppAccess", () => {
  test("does not call fetch when Umami is disabled", () => {
    clearUmamiEnv();
    const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    trackAppAccess({ userAgent: "TestAgent/1.0" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("does not call fetch when only UMAMI_SCRIPT_URL is set", () => {
    clearUmamiEnv();
    process.env.UMAMI_WEBSITE_ID = "website-id";
    process.env.UMAMI_SCRIPT_URL = "https://umami.example.com/script.js";

    const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    trackAppAccess({ userAgent: "TestAgent/1.0" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("POSTs a pageview to /api/send with /app url", async () => {
    clearUmamiEnv();
    process.env.UMAMI_WEBSITE_ID = "website-id";
    process.env.UMAMI_URL = "https://umami.example.com";
    process.env.SITE_URL = "https://webklip.com";

    const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    trackAppAccess({
      userAgent: "Mozilla/5.0 (Test)",
      language: "en-US,en;q=0.9",
      referrer: "https://example.com/ref",
    });

    await Bun.sleep(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://umami.example.com/api/send");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(
      "Mozilla/5.0 (Test)"
    );
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );

    const body = JSON.parse(String(init.body)) as {
      type: string;
      payload: {
        website: string;
        hostname: string;
        url: string;
        language?: string;
        referrer?: string;
        name?: string;
      };
    };
    expect(body.type).toBe("event");
    expect(body.payload.website).toBe("website-id");
    expect(body.payload.hostname).toBe("webklip.com");
    expect(body.payload.url).toBe(APP_ACCESS_URL);
    expect(body.payload.language).toBe("en-US,en;q=0.9");
    expect(body.payload.referrer).toBe("https://example.com/ref");
    expect(body.payload.name).toBeUndefined();
  });

  test("swallows fetch errors", async () => {
    clearUmamiEnv();
    process.env.UMAMI_WEBSITE_ID = "website-id";
    process.env.UMAMI_URL = "https://umami.example.com";

    globalThis.fetch = mock(() =>
      Promise.reject(new Error("network down"))
    ) as unknown as typeof fetch;

    expect(() => trackAppAccess()).not.toThrow();
    await Bun.sleep(0);
  });
});
