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
  await page.getByRole("button", { name: /Create a? clip/i }).click();
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
  opts: {
    ttl?: number;
    burnOnRead?: boolean;
    visibility?: "private" | "public";
    ownerPassword?: string;
  } = {}
) {
  const res = await request.post(`/api/v1/clips/${slug}`, {
    data: { content, ...opts },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function openMoreSettings(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator("#sheet-settings.is-open")).toBeVisible();
}

test.describe("Webklip E2E", () => {
  test.describe("Public pages", () => {
    test("home page loads and links work", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveTitle(/Webklip/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        /WhatsApp/i
      );
      await expect(page.getByRole("banner").getByRole("link", { name: "Security" })).toBeVisible();
    });

    test("public pages default to light theme", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

      await page.getByRole("button", { name: "Switch to dark theme" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    });

    test("legal pages load", async ({ page }) => {
      for (const path of ["/about", "/privacy", "/terms", "/security"]) {
        await page.goto(path);
        await expect(page.getByRole("main")).toBeVisible();
        await expect(page).toHaveTitle(/Webklip/i);
      }
    });

    test("API docs page loads", async ({ page }) => {
      await page.goto("/docs/api");
      await expect(page.getByRole("heading", { name: "REST API" })).toBeVisible();
      await expect(page.getByText("/api/v1/clips/:slug").first()).toBeVisible();
    });

    test("klipwall page loads", async ({ page }) => {
      await page.goto("/klipwall");
      await expect(page.getByRole("heading", { name: "Klipwall" })).toBeVisible();
      await expect(page).toHaveTitle(/Klipwall/i);
      await expect(page.getByRole("search")).toBeVisible();
      await expect(page.getByLabel("Search Klipwall")).toBeVisible();
      await expect(page.locator(".site-header .site-nav a[href='/klipwall']")).toBeVisible();
      await expect(page.locator(".site-footer a[href='/about']")).toBeVisible();
    });

    test("klipwall search finds public clips by content", async ({ page }) => {
      const needle = `klipsearch-${Date.now().toString(36)}`;
      const slug = uniqueSlug("kwsearch");
      await createClipViaApi(page.request, slug, `Unique phrase ${needle} on Klipwall`, {
        visibility: "public",
        burnOnRead: false,
        ttl: 3600,
        ownerPassword: "ownerpass1",
      });

      await page.goto("/klipwall");
      await page.getByLabel("Search Klipwall").fill(needle);
      await page.getByRole("button", { name: "Search" }).click();
      await expect(page).toHaveURL(new RegExp(`[?&]q=${needle}`));
      await expect(page.locator(`a[href="/${slug}"]`)).toBeVisible();

      await page.getByLabel("Search Klipwall").fill("no-such-klipwall-hit-zzzz");
      await page.getByRole("button", { name: "Search" }).click();
      await expect(page.getByText(/No public clips match/i)).toBeVisible();
      await expect(page.locator(`a[href="/${slug}"]`)).toHaveCount(0);
    });

    test("klipwall paginates public clips", async ({ page }) => {
      const marker = `kwpage-${Date.now().toString(36)}`;
      const pageSize = 20;
      const slugs: string[] = [];
      for (let i = 0; i < pageSize + 1; i++) {
        const slug = uniqueSlug(`kwp${String(i).padStart(2, "0")}`);
        slugs.push(slug);
        await createClipViaApi(page.request, slug, `${marker} clip ${i}`, {
          visibility: "public",
          burnOnRead: false,
          ttl: 3600,
          ownerPassword: "ownerpass1",
        });
      }

      await page.goto(`/klipwall?q=${encodeURIComponent(marker)}`);
      await expect(page.getByText(new RegExp(`${pageSize + 1} results`))).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Klipwall pages" })).toBeVisible();
      await expect(page.locator(".explore-list .explore-item")).toHaveCount(pageSize);

      await page.getByRole("link", { name: /Older/i }).click();
      await expect(page).toHaveURL(/[?&]page=2/);
      await expect(page).toHaveURL(new RegExp(`[?&]q=${marker}`));
      await expect(page.locator(".explore-list .explore-item")).toHaveCount(1);

      const page2Href = await page.locator(".explore-list a.explore-link").getAttribute("href");
      expect(page2Href).toBeTruthy();
      expect(slugs.map((s) => `/${s}`)).toContain(page2Href);

      await page.getByRole("link", { name: /Newer/i }).click();
      await expect(page).toHaveURL(new RegExp(`[?&]q=${marker}`));
      await expect(page).not.toHaveURL(/[?&]page=/);
      await expect(page.locator(".explore-list .explore-item")).toHaveCount(pageSize);
      await expect(page.locator(`a[href="${page2Href}"]`)).toHaveCount(0);
    });

    test("home shows Klipwall teaser", async ({ page }) => {
      await page.goto("/");
      const section = page.locator("#klipwall");
      await expect(section.getByRole("heading", { name: /public/i })).toBeVisible();
      await expect(section.getByRole("link", { name: /Browse all on Klipwall/i })).toBeVisible();
      await expect(page.locator(".site-footer a[href='/klipwall']")).toBeVisible();
    });

    test("SEO endpoints respond", async ({ request }) => {
      const sitemap = await request.get("/sitemap.xml");
      expect(sitemap.ok()).toBeTruthy();
      expect(await sitemap.text()).toContain("<urlset");

      const robots = await request.get("/robots.txt");
      expect(robots.ok()).toBeTruthy();
      expect(await robots.text()).toMatch(/Sitemap|User-agent/i);
    });

    test("sitemap lists public clips", async ({ request }) => {
      const slug = uniqueSlug("seo-map");
      await createClipViaApi(request, slug, "Index me please for sitemap coverage", {
        visibility: "public",
        burnOnRead: false,
        ttl: 3600,
        ownerPassword: "ownerpass1",
      });

      const sitemap = await request.get("/sitemap.xml");
      expect(sitemap.ok()).toBeTruthy();
      expect(await sitemap.text()).toContain(`/${slug}`);
    });

    test("search crawlers see public clip content", async ({ request }) => {
      const slug = uniqueSlug("seo-bot");
      const body = "Unique SEO phrase xyzzy-public-clip-body";
      await createClipViaApi(request, slug, body, {
        visibility: "public",
        burnOnRead: false,
        ttl: 3600,
        ownerPassword: "ownerpass1",
      });

      const preview = await request.get(`/${slug}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
      });
      expect(preview.ok()).toBeTruthy();
      const html = await preview.text();
      expect(html).toContain(body);
      expect(html).toContain('name="description"');
      expect(html).not.toContain('content="noindex');
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

    test("creates clip from home with pasted content", async ({ page }) => {
      const slug = uniqueSlug("paste");
      const text = `Hero paste ${Date.now()}`;
      await page.goto("/");
      await page.locator("#home-paste").fill(text);
      await page.fill('input[name="slug"]', slug);
      await page.getByRole("button", { name: /Create a? clip/i }).click();
      await expect(page).toHaveURL(new RegExp(`/${slug}$`));
      await expect(page.locator("#clip-content")).toHaveValue(text);
    });

    test("first direct visit to a new slug is editable (not burned)", async ({ page }) => {
      const slug = uniqueSlug("firsthit");
      await page.goto(`/${slug}`);
      await expect(page.locator(".burn-banner")).toHaveCount(0);
      await expect(page.locator("#clip-content")).toBeEditable();
      await expect(page.locator("#settings-root")).toBeVisible();
      await page.locator("#clip-content").fill("first visit edit");
      await expect(page.locator("#clip-content")).toHaveValue("first visit edit");
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

      await openMoreSettings(page);
      await page.selectOption("#m-language", "javascript");
      await expect(page.locator("#m-language")).toHaveValue("javascript");
    });

    test("TTL setting updates", async ({ page }) => {
      const slug = uniqueSlug("ttl");
      await createClipViaApi(page.request, slug, "", { burnOnRead: false, ttl: 3600 });
      await page.goto(`/${slug}`);

      await page.selectOption("#ttl", "900");
      await expect(page.locator("#ttl")).toHaveValue("900");
      await expect(page.locator(".toast")).toContainText("15 min");
    });

    test("15 minutes is the default expires option", async ({ page }) => {
      const slug = uniqueSlug("ttldef");
      await createClipViaApi(page.request, slug);
      await page.goto(`/${slug}`);

      await expect(page.locator("#ttl")).toHaveValue("900");
    });

    test("custom expiry can be set from the modal", async ({ page }) => {
      const slug = uniqueSlug("ttlcustom");
      await createClipViaApi(page.request, slug, "", { burnOnRead: false, ttl: 3600 });
      await page.goto(`/${slug}`);

      await page.selectOption("#ttl", "custom");
      const modal = page.locator("#custom-expires-modal");
      await expect(modal).toBeVisible();

      const when = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const local = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
      await modal.locator("#custom-expires-at").fill(local);
      await modal.getByRole("button", { name: "Save" }).click();

      await expect(page.locator(".toast")).toContainText(/Expires/i);
      await expect(page.locator("#ttl")).toHaveValue("custom");
    });

    test("can switch expires to burn after read", async ({ page }) => {
      const slug = uniqueSlug("burnsw");
      await createClipViaApi(page.request, slug, "", { burnOnRead: false, ttl: 3600 });
      await page.goto(`/${slug}`);

      await page.selectOption("#ttl", "burn");
      await expect(page.locator("#ttl")).toHaveValue("burn");
      await expect(page.locator(".toast")).toContainText("Burn after read");
    });

    test("can list a clip on Klipwall", async ({ page }) => {
      const slug = uniqueSlug("public");
      await createClipViaApi(page.request, slug, "hello explore", {
        burnOnRead: false,
        ttl: 3600,
      });
      await page.goto(`/${slug}`);

      await openMoreSettings(page);
      await page.locator("#settings-form-mobile [data-public-toggle]").click({ force: true });
      const modal = page.locator("#public-publish-modal");
      await expect(modal).toBeVisible();
      await modal.locator("#public-owner-password").fill("ownerpass1");
      await modal.getByRole("button", { name: "Publish" }).click();
      await expect(page.locator(".toast")).toContainText(/public|Klipwall|Published/i);
      await expect(
        page.locator("#settings-form-mobile [data-public-toggle]")
      ).toBeChecked();
      await page.reload();
      await expect(page.locator(".header-cluster .chip--public")).toBeVisible();
      await expect(page.locator("#ttl")).not.toHaveValue("burn");
      await expect(page.locator("#ttl option[value='burn']")).toHaveCount(0);
      await openMoreSettings(page);
      await expect(page.locator("[data-protect-section]")).toHaveCount(0);

      await page.goto("/klipwall");
      await expect(page.getByRole("heading", { name: "Klipwall" })).toBeVisible();
      await expect(page.locator(`a[href="/${slug}"]`)).toBeVisible();
    });

    test("canceling public modal leaves Public off", async ({ page }) => {
      const slug = uniqueSlug("pubcancel");
      await createClipViaApi(page.request, slug, "stay private", {
        burnOnRead: false,
        ttl: 3600,
      });
      await page.goto(`/${slug}`);

      await openMoreSettings(page);
      await page.locator("#settings-form-mobile [data-public-toggle]").click({ force: true });
      const modal = page.locator("#public-publish-modal");
      await expect(modal).toBeVisible();
      await modal.getByRole("button", { name: "Cancel" }).click();
      await expect(modal).toBeHidden();
      await expect(page.locator("#settings-form-mobile [data-public-toggle]")).not.toBeChecked();
      await expect(page.locator(".header-cluster .chip--public")).toHaveCount(0);
    });

    test("publishing with PIN asks to clear protections first", async ({ page }) => {
      const slug = uniqueSlug("pubpin");
      await createClipViaApi(page.request, slug, "protected then public", {
        burnOnRead: false,
        ttl: 3600,
      });
      await page.goto(`/${slug}`);

      await openMoreSettings(page);
      await page.locator('[data-protect-option="pin"]').check({ force: true });
      await page.fill("#m-pin", "secretpin");
      await page.locator("#settings-form-mobile .settings-pin-save").click();
      await expect(page.getByRole("button", { name: "Remove PIN" })).toBeVisible({
        timeout: 5_000,
      });

      await page.locator("#settings-form-mobile [data-public-toggle]").click({ force: true });
      const clearModal = page.locator("#public-clear-protections-modal");
      await expect(clearModal).toBeVisible();
      await expect(clearModal).toContainText(/PIN/i);
      await clearModal.getByRole("button", { name: "Cancel" }).click();
      await expect(clearModal).toBeHidden();
      await expect(page.locator("#settings-form-mobile [data-public-toggle]")).not.toBeChecked();
      await expect(page.getByRole("button", { name: "Remove PIN" })).toBeVisible();

      await page.locator("#settings-form-mobile [data-public-toggle]").click({ force: true });
      await expect(clearModal).toBeVisible();
      await clearModal.getByRole("button", { name: "Continue" }).click();
      const publishModal = page.locator("#public-publish-modal");
      await expect(publishModal).toBeVisible();
      await publishModal.locator("#public-owner-password").fill("ownerpass1");
      await publishModal.getByRole("button", { name: "Publish" }).click();
      await expect(page.getByText(/Published on Klipwall/i)).toBeVisible();
      await expect(
        page.locator("#settings-form-mobile [data-public-toggle]")
      ).toBeChecked();
      await expect(page.locator("[data-protect-section]")).toHaveCount(0);
      await page.reload();
      await expect(page.locator(".header-cluster .chip--public")).toBeVisible();
    });

    test("PIN and E2E are mutually exclusive", async ({ page }) => {
      const slug = uniqueSlug("xorprot");
      await createClipViaApi(page.request, slug, "one protection", {
        burnOnRead: false,
        ttl: 3600,
      });
      await page.goto(`/${slug}`);
      await openMoreSettings(page);

      await page.locator('[data-protect-option="pin"]').check({ force: true });
      await page.fill("#m-pin", "secretpin");
      await page.locator("#settings-form-mobile .settings-pin-save").click();
      await expect(page.getByRole("button", { name: "Remove PIN" })).toBeVisible({
        timeout: 5_000,
      });

      await page.locator('[data-protect-option="e2e"]').click({ force: true });
      const switchModal = page.locator("#protect-switch-modal");
      await expect(switchModal).toBeVisible();
      await switchModal.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByText(/encryption enabled/i)).toBeVisible();
      await expect(page.locator('[data-protect-option="e2e"]')).toBeChecked();
      await expect(page.getByRole("button", { name: "Remove PIN" })).toHaveCount(0);
      await expect(page.locator(".header-cluster .chip--secure")).toBeVisible();
    });

    test("API burn demotes a public clip from Klipwall", async ({ page }) => {
      const slug = uniqueSlug("pubburn");
      await createClipViaApi(page.request, slug, "public then burn", {
        visibility: "public",
        burnOnRead: false,
        ttl: 3600,
        ownerPassword: "ownerpass1",
      });

      await page.goto(`/${slug}`);
      await expect(page.locator(".header-cluster .chip--public")).toBeVisible();
      await expect(page.locator("#ttl option[value='burn']")).toHaveCount(0);

      const demote = await page.request.post(`/${slug}/settings`, {
        form: { ttl: "burn" },
      });
      expect(demote.ok()).toBeTruthy();
      expect(demote.headers()["hx-trigger"] ?? "").toMatch(/removed from Klipwall/i);

      await page.reload();
      await expect(page.locator(".header-cluster .chip--public")).toHaveCount(0);
      await expect(page.locator("#ttl")).toHaveValue("burn");

      await page.goto("/klipwall");
      await expect(page.locator(`a[href="/${slug}"]`)).toHaveCount(0);
    });

    test("public clip is view-only without owner cookie", async ({ browser, page }) => {
      const slug = uniqueSlug("pubro");
      await createClipViaApi(page.request, slug, "owner content", {
        visibility: "public",
        burnOnRead: false,
        ttl: 3600,
        ownerPassword: "ownerpass1",
      });

      await page.goto(`/${slug}`);
      await expect(page.locator("#clip-content")).toBeEditable();
      await expect(page.locator(".header-cluster .chip--public")).toBeVisible();

      const visitor = await browser.newContext();
      const visitorPage = await visitor.newPage();
      await visitorPage.goto(`/${slug}`);
      await expect(visitorPage.getByText(/view-only/i)).toBeVisible();
      await expect(visitorPage.locator("#clip-content")).toBeDisabled();
      await expect(visitorPage.locator("#settings-root")).toHaveCount(0);

      const put = await visitorPage.request.put(`/api/v1/clips/${slug}`, {
        data: { content: "hacker edit" },
      });
      expect(put.status()).toBe(403);

      const still = await page.request.get(`/api/v1/clips/${slug}`);
      expect((await still.json()).content).toBe("owner content");

      await visitor.close();
    });

    test("visitor can clone a public clip", async ({ browser, page }) => {
      const slug = uniqueSlug("pubclone");
      const body = "clone-me-public-content";
      await createClipViaApi(page.request, slug, body, {
        visibility: "public",
        burnOnRead: false,
        ttl: 3600,
        ownerPassword: "ownerpass1",
      });

      const visitor = await browser.newContext();
      const visitorPage = await visitor.newPage();
      await visitorPage.goto(`/${slug}`);
      await expect(visitorPage.locator("#clone-clip-banner-btn")).toBeVisible();
      await visitorPage.locator("#clone-clip-banner-btn").click();
      await expect(visitorPage.locator("#clone-modal")).toBeVisible();
      await visitorPage.locator("#clone-clip-submit").click();

      await expect(visitorPage).toHaveURL(/\/[a-zA-Z0-9_-]{3,64}$/);
      const clonedSlug = new URL(visitorPage.url()).pathname.slice(1);
      expect(clonedSlug).not.toBe(slug);
      await expect(visitorPage.locator("#clip-content")).toBeEditable();
      await expect(visitorPage.locator("#clip-content")).toHaveValue(body);
      await expect(visitorPage.locator(".header-cluster .chip--public")).toHaveCount(0);
      await expect(visitorPage.locator("#settings-root")).toBeVisible();

      const source = await page.request.get(`/api/v1/clips/${slug}`);
      expect((await source.json()).content).toBe(body);

      await visitor.close();
    });

    test("visitor can clone a public clip with a custom slug", async ({ browser, page }) => {
      const slug = uniqueSlug("pubcust");
      const customSlug = uniqueSlug("mycopy");
      await createClipViaApi(page.request, slug, "custom clone body", {
        visibility: "public",
        burnOnRead: false,
        ttl: 3600,
        ownerPassword: "ownerpass1",
      });

      const visitor = await browser.newContext();
      const visitorPage = await visitor.newPage();
      await visitorPage.goto(`/${slug}`);
      await visitorPage.locator("#clone-clip-banner-btn").click();
      await visitorPage.locator("#clone-slug").fill(customSlug);
      await visitorPage.locator("#clone-clip-submit").click();

      await expect(visitorPage).toHaveURL(new RegExp(`/${customSlug}$`));
      await expect(visitorPage.locator("#clip-content")).toHaveValue("custom clone body");
      await expect(visitorPage.locator("#clip-content")).toBeEditable();

      await visitor.close();
    });

    test("clone rejects a taken custom slug", async ({ browser, page }) => {
      const slug = uniqueSlug("pubtaken");
      const taken = uniqueSlug("taken");
      await createClipViaApi(page.request, taken, "already here", {
        burnOnRead: false,
        ttl: 3600,
      });
      await createClipViaApi(page.request, slug, "clone source", {
        visibility: "public",
        burnOnRead: false,
        ttl: 3600,
        ownerPassword: "ownerpass1",
      });

      const visitor = await browser.newContext();
      const visitorPage = await visitor.newPage();
      await visitorPage.goto(`/${slug}`);
      await visitorPage.locator("#clone-clip-banner-btn").click();
      await visitorPage.locator("#clone-slug").fill(taken);
      await visitorPage.locator("#clone-clip-submit").click();

      await expect(visitorPage).toHaveURL(new RegExp(`/${slug}\\?`));
      await expect(visitorPage.locator("#clone-modal")).toBeVisible();
      await expect(visitorPage.getByText(/already taken/i)).toBeVisible();
      await expect(visitorPage.locator("#clone-slug")).toHaveValue(taken);

      await visitor.close();
    });

    test("private clip cannot be cloned", async ({ page }) => {
      const slug = uniqueSlug("privclone");
      await createClipViaApi(page.request, slug, "secret private", {
        burnOnRead: false,
        ttl: 3600,
      });
      const res = await page.request.post(`/${slug}/clone`);
      expect(res.status()).toBe(404);
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

      const filePath1 = join(tmpdir(), `webklip-e2e-a-${Date.now()}.txt`);
      const filePath2 = join(tmpdir(), `webklip-e2e-b-${Date.now()}.txt`);
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

    test("creates clip with file from temporary-file-sharing landing", async ({
      page,
    }) => {
      const slug = uniqueSlug("landfile");
      const filePath = join(tmpdir(), `webklip-e2e-land-${Date.now()}.txt`);
      const body = `landing upload ${Date.now()}`;
      writeFileSync(filePath, body);

      try {
        await page.goto("/temporary-file-sharing");
        await page
          .locator(".landing-hero-upload input[type='file']")
          .setInputFiles(filePath);
        await expect(page.locator(".landing-file-names")).toContainText(
          "webklip-e2e-land"
        );
        await page.fill('.landing-hero-upload input[name="slug"]', slug);
        await page
          .locator(".landing-hero-upload")
          .getByRole("button", { name: /Create a? clip/i })
          .click();
        await expect(page).toHaveURL(new RegExp(`/${slug}$`));
        await expect(page.locator(".file-attachment, .file-card")).toHaveCount(1);
        await expect(page.locator(".file-attachment, .file-card")).toContainText(
          "webklip-e2e-land"
        );
      } finally {
        unlinkSync(filePath);
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
      await openMoreSettings(setupPage);
      await setupPage.locator('[data-protect-option="pin"]').check({ force: true });
      await setupPage.fill("#m-pin", pin);
      await setupPage.locator("#settings-form-mobile .settings-pin-save").click();
      await expect(setupPage.getByRole("button", { name: "Remove PIN" })).toBeVisible({
        timeout: 5_000,
      });
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
    test("docs open in a modal from the clip app", async ({ page }) => {
      const slug = uniqueSlug("docs-modal");
      await createClipViaApi(page.request, slug, "docs modal");
      await page.goto(`/${slug}`);

      await openMoreSettings(page);
      await page.getByRole("button", { name: /REST API/i }).click();
      const dialog = page.locator("#docs-modal");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("/api/v1/clips/:slug").first()).toBeVisible();

      await dialog.getByRole("button", { name: "Webhooks" }).click();
      await expect(dialog.getByRole("heading", { name: "Webhooks" })).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });

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
      expect(html).toContain("noindex");

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
      await ownerPage.getByRole("button", { name: /Create a? clip/i }).click();
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
