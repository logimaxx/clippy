import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function uniqueSlug(prefix = "e2e") {
  return `${prefix}-${Date.now().toString(36)}`;
}

async function createClipViaUi(page: Page, slug?: string) {
  await page.goto("/");
  if (slug) {
    await page.fill('input[name="slug"]', slug);
  }
  await page.getByRole("button", { name: "Create clip" }).click();
  if (slug) {
    await expect(page).toHaveURL(new RegExp(`/${slug}$`));
    return slug;
  }
  await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]{3,64}$/);
  return new URL(page.url()).pathname.slice(1);
}

async function createClipViaApi(
  request: APIRequestContext,
  slug: string,
  content = "",
  opts: { ttl?: number; burnOnRead?: boolean } = {}
) {
  const res = await request.post(`/api/v1/clips/${slug}`, {
    data: { content, ...opts },
  });
  expect(res.ok()).toBeTruthy();
}

async function openMoreSettings(page: Page) {
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.locator("#sheet-settings.is-open")).toBeVisible();
}

test.describe("Clippy E2E", () => {
  test.describe("Public pages", () => {
    test("home page loads and links work", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveTitle(/Clippy/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        /share text and files/i
      );
      await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
    });

    test("legal pages load", async ({ page }) => {
      for (const path of ["/privacy", "/terms", "/security"]) {
        await page.goto(path);
        await expect(page.getByRole("main")).toBeVisible();
        await expect(page).toHaveTitle(/Clippy/i);
      }
    });

    test("SEO endpoints respond", async ({ request }) => {
      const sitemap = await request.get("/sitemap.xml");
      expect(sitemap.ok()).toBeTruthy();
      expect(await sitemap.text()).toContain("<urlset");

      const robots = await request.get("/robots.txt");
      expect(robots.ok()).toBeTruthy();
      expect(await robots.text()).toMatch(/Sitemap|User-agent/i);
    });

    test("landing page loads", async ({ page }) => {
      await page.goto("/online-clipboard");
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "Online Clipboard"
      );
    });

    test("login and register pages load", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("heading")).toBeVisible();

      await page.goto("/register");
      await expect(page.getByRole("heading")).toBeVisible();
    });
  });

  test.describe("Clip creation", () => {
    test("creates clip from home with random slug", async ({ page }) => {
      const slug = await createClipViaUi(page);
      await expect(page.locator("#clip-content")).toBeVisible();
      await expect(page.locator("#settings-root")).toBeVisible();
      await expect(page).toHaveURL(`/${slug}`);
    });

    test("creates clip with custom slug", async ({ page }) => {
      const slug = uniqueSlug("custom");
      await createClipViaUi(page, slug);
      await expect(page.locator("#device-count-desktop")).toContainText(/device/i);
    });

    test("demo clip loads", async ({ page }) => {
      await page.goto("/demo");
      await expect(page.locator("#clip-content")).toBeVisible();
      await expect(page.locator("#clip-content")).not.toHaveValue("");
    });
  });

  test.describe("Editor and settings", () => {
    test("edits clip content", async ({ page }) => {
      const slug = uniqueSlug("edit");
      await createClipViaApi(page.request, slug);
      await page.goto(`/${slug}`);

      const text = `Playwright edit ${Date.now()}`;
      await page.locator("#clip-content").fill(text);
      await expect(page.locator("#clip-content")).toHaveValue(text);
    });

    test("syntax language setting updates", async ({ page }) => {
      const slug = uniqueSlug("syntax");
      await createClipViaApi(page.request, slug, "const x = 1;");
      await page.goto(`/${slug}`);

      await page.selectOption("#language", "javascript");
      await expect(page.locator("#language")).toHaveValue("javascript");
    });

    test("TTL setting updates", async ({ page }) => {
      const slug = uniqueSlug("ttl");
      await createClipViaApi(page.request, slug, "", { burnOnRead: false, ttl: 3600 });
      await page.goto(`/${slug}`);

      await page.selectOption("#ttl", "900");
      await expect(page.locator("#ttl")).toHaveValue("900");
      await expect(page.locator(".toast")).toContainText("15 min");
    });

    test("burn after read is the default expires option", async ({ page }) => {
      const slug = uniqueSlug("burn");
      await createClipViaApi(page.request, slug);
      await page.goto(`/${slug}`);

      await expect(page.locator("#ttl")).toHaveValue("burn");
    });

    test("can switch expires to burn after read", async ({ page }) => {
      const slug = uniqueSlug("burnsw");
      await createClipViaApi(page.request, slug, "", { burnOnRead: false, ttl: 3600 });
      await page.goto(`/${slug}`);

      await page.selectOption("#ttl", "burn");
      await expect(page.locator("#ttl")).toHaveValue("burn");
      await expect(page.locator(".toast")).toContainText("Burn after read");
    });

    test("copy link button is present", async ({ page }) => {
      const slug = uniqueSlug("copy");
      await createClipViaApi(page.request, slug);
      await page.goto(`/${slug}`);
      await expect(page.locator("#share-trigger")).toBeVisible();
      await expect(page.locator("#copy-link-btn")).toBeAttached();
    });

    test("QR code endpoint returns SVG", async ({ request }) => {
      const slug = uniqueSlug("qr");
      await createClipViaApi(request, slug);
      const res = await request.get(`/${slug}/qr`);
      expect(res.ok()).toBeTruthy();
      expect(res.headers()["content-type"]).toContain("image/svg+xml");
      expect(await res.text()).toContain("<svg");
    });

    test("delete clip button removes clip", async ({ page, request }) => {
      const slug = uniqueSlug("del");
      await createClipViaApi(request, slug);
      await page.goto(`/${slug}`);

      await openMoreSettings(page);
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator("#delete-clip-btn").click();
      await expect(page).toHaveURL("/");

      const gone = await request.get(`/api/v1/clips/${slug}`);
      expect(gone.status()).toBe(404);
    });
  });

  test.describe("Real-time sync", () => {
    test("syncs text between two tabs via WebSocket", async ({ browser }) => {
      const slug = uniqueSlug("sync");
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await createClipViaApi(pageA.request, slug);
      await pageA.goto(`/${slug}`);
      await pageB.goto(`/${slug}`);

      await expect(pageA.locator("#device-count-desktop")).toContainText("2 devices", {
        timeout: 10_000,
      });

      const message = `ws-sync-${Date.now()}`;
      await pageA.locator("#clip-content").fill(message);
      await expect(pageB.locator("#clip-content")).toHaveValue(message, {
        timeout: 5_000,
      });

      await contextA.close();
      await contextB.close();
    });
  });

  test.describe("File attachment", () => {
    test("uploads multiple files and can remove one", async ({ page }) => {
      const slug = uniqueSlug("file");
      await createClipViaApi(page.request, slug);
      await page.goto(`/${slug}`);

      const filePath1 = join(tmpdir(), `clippy-e2e-a-${Date.now()}.txt`);
      const filePath2 = join(tmpdir(), `clippy-e2e-b-${Date.now()}.txt`);
      writeFileSync(filePath1, `e2e upload a ${Date.now()}`);
      writeFileSync(filePath2, `e2e upload b ${Date.now()}`);

      try {
        await page.locator("#drop-zone input[type='file']").setInputFiles([filePath1, filePath2]);
        await expect(page.locator(".upload-status .success")).toContainText(
          "Uploaded",
          { timeout: 10_000 }
        );
        await expect(page.locator(".file-attachment, .file-card")).toHaveCount(2);
        await expect(page.locator(".file-delete-btn")).toHaveCount(2);

        await page.locator(".file-delete-btn").first().click();
        await expect(page.locator(".file-attachment, .file-card")).toHaveCount(1);
        await expect(page.locator(".file-delete-btn")).toHaveCount(1);
      } finally {
        unlinkSync(filePath1);
        unlinkSync(filePath2);
      }
    });
  });

  test.describe("PIN protection", () => {
    test("PIN gate blocks access and unlock works", async ({ browser }) => {
      const slug = uniqueSlug("pin");
      const pin = "test1234";

      const setup = await browser.newContext();
      const setupPage = await setup.newPage();
      await createClipViaApi(setupPage.request, slug);
      await setupPage.goto(`/${slug}`);
      await setupPage.fill("#pin", pin);
      await setupPage.locator("#settings-form-desktop .settings-pin-save").click();
      await expect(setupPage.getByRole("button", { name: "Remove PIN" })).toBeVisible({
        timeout: 5_000,
      });
      await expect(setupPage.locator("#pin")).not.toBeVisible();
      await setup.close();

      const locked = await browser.newContext();
      const lockedPage = await locked.newPage();
      await lockedPage.goto(`/${slug}`);
      await expect(lockedPage.getByRole("heading", { name: /PIN required/i })).toBeVisible();
      await lockedPage.fill('input[name="pin"]', pin);
      await lockedPage.getByRole("button", { name: "Unlock" }).click();
      await expect(lockedPage.locator("#clip-content")).toBeVisible();
      await locked.close();
    });
  });

  test.describe("Version history", () => {
    test("auto-saves version and restore works", async ({ page }) => {
      const slug = uniqueSlug("ver");
      await createClipViaApi(page.request, slug, "version one");
      await page.goto(`/${slug}`);

      await page.locator("#clip-content").fill("version two");
      await page.waitForTimeout(6_000);

      await openMoreSettings(page);
      await page.getByRole("button", { name: "Refresh" }).click();
      await expect(page.locator(".version-list li")).toHaveCount(1, {
        timeout: 5_000,
      });

      await page.getByRole("button", { name: "Restore" }).click();
      await expect(page.locator("#clip-content")).toHaveValue("version two");
    });
  });

  test.describe("REST API", () => {
    test("health check", async ({ request }) => {
      const res = await request.get("/api/health");
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.status).toBe("ok");
    });

    test("create, read, update, delete clip", async ({ request }) => {
      const slug = uniqueSlug("api");

      const create = await request.post(`/api/v1/clips/${slug}`, {
        data: { content: "hello api", ttl: 3600 },
      });
      expect(create.status()).toBe(201);

      const get = await request.get(`/api/v1/clips/${slug}`);
      expect(get.ok()).toBeTruthy();
      const clip = await get.json();
      expect(clip.content).toBe("hello api");

      const put = await request.put(`/api/v1/clips/${slug}`, {
        data: { content: "updated api" },
      });
      expect(put.ok()).toBeTruthy();

      const get2 = await request.get(`/api/v1/clips/${slug}`);
      expect((await get2.json()).content).toBe("updated api");

      const del = await request.delete(`/api/v1/clips/${slug}`);
      expect(del.ok()).toBeTruthy();

      const gone = await request.get(`/api/v1/clips/${slug}`);
      expect(gone.status()).toBe(404);
    });

    test("invalid slug returns 400", async ({ request }) => {
      const res = await request.get("/api/v1/clips/bad slug!");
      expect(res.status()).toBe(400);
    });

    test("link preview crawlers do not burn clips via API", async ({ request }) => {
      const slug = uniqueSlug("crawler-api");
      await createClipViaApi(request, slug, "secret", { burnOnRead: true });

      const preview = await request.get(`/api/v1/clips/${slug}`, {
        headers: { "User-Agent": "facebookexternalhit/1.1" },
      });
      expect(preview.ok()).toBeTruthy();
      const body = await preview.json();
      expect(body.preview).toBe(true);
      expect(body.content).toBeUndefined();

      const stillThere = await request.get(`/api/v1/clips/${slug}`);
      expect(stillThere.ok()).toBeTruthy();
      expect((await stillThere.json()).content).toBe("secret");
    });
  });

  test.describe("Burn after read", () => {
    test("link preview crawlers do not burn clips on web", async ({ request }) => {
      const slug = uniqueSlug("crawler-web");
      await createClipViaApi(request, slug, "top secret", { burnOnRead: true });

      const preview = await request.get(`/${slug}`, {
        headers: { "User-Agent": "WhatsApp/2.23.20.0" },
      });
      expect(preview.ok()).toBeTruthy();
      const html = await preview.text();
      expect(html).not.toContain("top secret");
      expect(html).toContain("og:title");

      const api = await request.get(`/api/v1/clips/${slug}`);
      expect(api.ok()).toBeTruthy();
      expect((await api.json()).content).toBe("top secret");
    });

    test("human visit burns clip but owner cookie is exempt", async ({ browser, request }) => {
      const owner = await browser.newContext();
      const ownerPage = await owner.newPage();
      const slug = uniqueSlug("burn-owner");
      await ownerPage.goto("/");
      await ownerPage.fill('input[name="slug"]', slug);
      await ownerPage.getByRole("button", { name: "Create clip" }).click();
      await expect(ownerPage).toHaveURL(new RegExp(`/${slug}$`));
      await ownerPage.locator("#clip-content").fill("burn me");

      const stillThere = await request.get(`/api/v1/clips/${slug}`);
      expect(stillThere.ok()).toBeTruthy();

      const recipient = await browser.newContext();
      const recipientPage = await recipient.newPage();
      await recipientPage.goto(`/${slug}`);
      await expect(recipientPage.locator(".burn-banner")).toBeVisible();
      await expect(recipientPage.locator("#clip-content")).toHaveValue("burn me");

      const gone = await request.get(`/api/v1/clips/${slug}`);
      expect(gone.status()).toBe(404);

      await owner.close();
      await recipient.close();
    });
  });
});
