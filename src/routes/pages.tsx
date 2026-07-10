/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import {
  generateSlug,
  isValidSlug,
  parseVanitySlug,
  clipSettingsSchema,
  remainingSeconds,
  RESERVED_SLUGS,
  isReservedSlug,
  clipFromExpiresMode,
  clipFromReadAccess,
  expiresModeFromClip,
  settingsToastMessage,
} from "../lib/constants";
import { getClientIp } from "../lib/rate-limit";
import {
  hashPin,
  verifyPin,
  isUnlocked,
  setUnlockCookie,
  checkPinAttempts,
  recordPinFailure,
  clearPinAttempts,
  remainingPinAttempts,
} from "../lib/pin";
import { resolveAuth } from "../lib/session";
import { isLinkPreviewCrawler } from "../lib/crawler";
import { isClipOwner, setOwnerCookie } from "../lib/owner";
import { getTeamBySlug, canReadClip, canWriteClip } from "../lib/teams";
import {
  ensureClip,
  updateSettings,
  getClip,
  updateContent,
  deleteClip,
  recordView,
} from "../store/clips";
import { listVersions, getVersion } from "../store/versions";
import { ClipPage } from "../views/ClipPage";
import { ClipLinkPreview } from "../views/ClipLinkPreview";
import { ClipGone } from "../views/ClipGone";
import { PinGate } from "../views/PinGate";
import { SettingsPanel } from "../views/partials/Settings";
import { getClipFiles } from "../store/clips";
import * as rooms from "../ws/rooms";
import type { Clip } from "../db/schema";

const pages = new Hono();

function settingsPanelProps(slug: string, clip: Clip, versions: Awaited<ReturnType<typeof listVersions>>) {
  return {
    slug,
    expiresAt: clip.expiresAt,
    burnOnRead: clip.burnOnRead,
    language: clip.language,
    maxViews: clip.maxViews,
    hasPin: !!clip.pinHash,
    webhookUrl: clip.webhookUrl,
    encrypted: clip.encrypted,
    devices: 1,
    versions,
    files: getClipFiles(clip),
  };
}

function clipCountsAsRead(clip: Clip): boolean {
  return clip.burnOnRead || (clip.maxViews !== null && clip.maxViews > 0);
}

async function renderClipPage(c: Context, slug: string) {
  const authUser = await resolveAuth(c);
  const userAgent = c.req.header("user-agent");
  const crawler = isLinkPreviewCrawler(userAgent);

  const hadClip = await getClip(slug);
  const clip = await ensureClip(slug, {
    ownerId: authUser?.id ?? null,
  });
  if (!hadClip) setOwnerCookie(c, slug);

  if (!(await canReadClip(clip, authUser?.id ?? null))) {
    return c.text("Forbidden", 403);
  }

  if (clip.pinHash && !isUnlocked(c, slug)) {
    if (crawler) return c.html(<ClipLinkPreview slug={slug} />);
    return c.html(<PinGate slug={slug} />);
  }

  if (crawler) return c.html(<ClipLinkPreview slug={slug} />);

  const owner = isClipOwner(c, slug, authUser?.id ?? null, clip.ownerId);
  let content = clip.content;
  let readOnly = false;
  let burned = false;

  if (!owner && clipCountsAsRead(clip)) {
    const viewed = await recordView(slug);
    if (!viewed) return c.html(<ClipGone slug={slug} />);

    content = viewed.content;
    const stillExists = await getClip(slug);
    burned = !stillExists;
    if (burned) readOnly = true;
  }

  const versions = await listVersions(slug);

  return c.html(
    <ClipPage
      slug={clip.slug}
      content={content}
      expiresAt={clip.expiresAt}
      burnOnRead={clip.burnOnRead}
      language={clip.language}
      maxViews={clip.maxViews}
      hasPin={!!clip.pinHash}
      webhookUrl={clip.webhookUrl}
      encrypted={clip.encrypted}
      devices={rooms.roomSize(slug)}
      clip={clip}
      versions={versions}
      readOnly={readOnly}
      burned={burned}
    />
  );
}

pages.get("/demo", async (c) => renderClipPage(c, "demo"));

pages.post("/new", async (c) => {
  const authUser = await resolveAuth(c);
  const body = await c.req.parseBody();
  const custom = typeof body.slug === "string" ? body.slug.trim() : "";
  const slug =
    custom && isValidSlug(custom) && !isReservedSlug(custom)
      ? custom
      : generateSlug(10);
  await ensureClip(slug, { ownerId: authUser?.id ?? null });
  setOwnerCookie(c, slug);
  return c.redirect(`/${slug}`, 302);
});

pages.post("/:team/new-clip", async (c) => {
  const authUser = await resolveAuth(c);
  if (!authUser) return c.redirect("/login", 302);

  const teamSlug = c.req.param("team");
  const team = await getTeamBySlug(teamSlug);
  if (!team) return c.text("Team not found", 404);

  const body = await c.req.parseBody();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const fullSlug = parseVanitySlug(teamSlug, name);
  if (!fullSlug) return c.text("Invalid clip name", 400);

  const existing = await getClip(fullSlug);
  if (existing) return c.text("Clip already exists", 409);

  await ensureClip(fullSlug, {
    ownerId: authUser.id,
    teamId: team.id,
    burnOnRead: false,
  });
  setOwnerCookie(c, fullSlug);

  return c.redirect(`/${fullSlug}`, 302);
});

pages.get("/:slug/countdown", async (c) => {
  const slug = c.req.param("slug");
  const clip = await getClip(slug);
  if (!clip?.expiresAt) return c.text("—");
  const rem = remainingSeconds(clip.expiresAt);
  if (rem === null || rem <= 0) return c.text("expired");
  if (rem >= 3600)
    return c.text(`${Math.floor(rem / 3600)}h ${Math.floor((rem % 3600) / 60)}m`);
  if (rem >= 60) return c.text(`${Math.floor(rem / 60)}m ${rem % 60}s`);
  return c.text(`${rem}s`);
});

pages.get("/:slug/versions", async (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug)) return c.text("Invalid slug", 400);
  const versions = await listVersions(slug);
  const { VersionsPanel } = await import("../views/partials/Versions");
  return c.html(<VersionsPanel slug={slug} versions={versions} />);
});

pages.post("/:slug/versions/:versionId/restore", async (c) => {
  const slug = c.req.param("slug");
  const versionId = c.req.param("versionId");
  if (!isValidSlug(slug)) return c.text("Invalid slug", 400);

  const authUser = await resolveAuth(c);
  const clip = await getClip(slug);
  if (!clip || !(await canWriteClip(clip, authUser?.id ?? null))) {
    return c.text("Forbidden", 403);
  }

  const version = await getVersion(versionId);
  if (!version || version.clipSlug !== slug) return c.text("Not found", 404);

  await updateContent(slug, version.content);

  return c.html(
    <textarea
      id="clip-content"
      name="content"
      class="editor clip-editor"
      data-ws-room={slug}
      data-ws-url={`/ws/${slug}`}
      data-encrypted={clip.encrypted ? "true" : "false"}
    >{version.content}</textarea>
  );
});

pages.get("/:team/:name", async (c) => {
  const teamSlug = c.req.param("team");
  if (RESERVED_SLUGS.has(teamSlug)) return c.notFound();

  const name = c.req.param("name");
  const slug = parseVanitySlug(teamSlug, name);
  if (!slug) return c.text("Invalid slug", 400);

  return renderClipPage(c, slug);
});

pages.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug) || isReservedSlug(slug)) {
    return c.notFound();
  }
  return renderClipPage(c, slug);
});

pages.post("/:slug/unlock", async (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug)) return c.text("Invalid slug", 400);

  const clip = await getClip(slug);
  if (!clip?.pinHash) return c.redirect(`/${slug}`, 302);

  const ip = getClientIp(c.req.raw.headers);
  if (!checkPinAttempts(ip, slug)) {
    return c.html(
      <PinGate slug={slug} error="Too many attempts. Try again in 15 minutes." remaining={0} />
    );
  }

  const body = await c.req.parseBody();
  const pin = typeof body.pin === "string" ? body.pin : "";

  if (!(await verifyPin(pin, clip.pinHash))) {
    recordPinFailure(ip, slug);
    return c.html(
      <PinGate slug={slug} error="Incorrect PIN" remaining={remainingPinAttempts(ip, slug)} />
    );
  }

  clearPinAttempts(ip, slug);
  setUnlockCookie(c, slug);
  return c.redirect(`/${slug}`, 302);
});

pages.post("/:slug/settings", async (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug)) return c.text("Invalid slug", 400);

  const authUser = await resolveAuth(c);
  const clip = await getClip(slug);
  if (!clip) return c.text("Not found", 404);

  if (!(await canWriteClip(clip, authUser?.id ?? null))) {
    return c.text("Forbidden", 403);
  }

  if (clip.pinHash && !isUnlocked(c, slug)) {
    return c.text("PIN required", 401);
  }

  const body = await c.req.parseBody();
  const parsed = clipSettingsSchema.safeParse(body);
  if (!parsed.success) return c.text("Invalid settings", 400);

  const now = Math.floor(Date.now() / 1000);
  const updates: Parameters<typeof updateSettings>[1] = {};

  if (parsed.data.ttl !== undefined) {
    const mode = clipFromExpiresMode(String(parsed.data.ttl), now);
    updates.burnOnRead = mode.burnOnRead;
    updates.expiresAt = mode.expiresAt;
    updates.maxViews = mode.maxViews;
  } else if (parsed.data.readAccess !== undefined) {
    const access = clipFromReadAccess(parsed.data.readAccess);
    updates.burnOnRead = access.burnOnRead;
    updates.maxViews = access.maxViews;
  } else if ("burn" in body) {
    updates.burnOnRead = parsed.data.burn ?? false;
  } else if (parsed.data.maxViews !== undefined) {
    updates.maxViews = parsed.data.maxViews === 0 ? null : parsed.data.maxViews;
  }
  if (parsed.data.language !== undefined) updates.language = parsed.data.language || null;
  if (parsed.data.clearPin) updates.pinHash = null;
  else if (parsed.data.pin && parsed.data.pin.length > 0) {
    updates.pinHash = await hashPin(parsed.data.pin);
  }
  if (parsed.data.webhook !== undefined) {
    const url = parsed.data.webhook.trim();
    updates.webhookUrl = url.length > 0 ? url : null;
  }
  if ("encrypted" in body) updates.encrypted = parsed.data.encrypted ?? false;

  const updated = await updateSettings(slug, updates);
  if (!updated) return c.text("Not found", 404);

  const versions = await listVersions(slug);
  const message = settingsToastMessage(
    body as Record<string, unknown>,
    parsed.data,
    updated
  );
  c.header("HX-Trigger", JSON.stringify({ showToast: { message } }));
  return c.html(<SettingsPanel {...settingsPanelProps(slug, updated, versions)} />);
});

pages.post("/:slug/upload", async (c) => {
  const slug = c.req.param("slug");
  const authUser = await resolveAuth(c);
  const clip = await getClip(slug);
  if (clip && !(await canWriteClip(clip, authUser?.id ?? null))) {
    return c.html('<span class="error">Forbidden</span>');
  }
  if (clip?.pinHash && !isUnlocked(c, slug)) {
    return c.html('<span class="error">PIN required</span>');
  }
  const { handleUpload } = await import("./files");
  return handleUpload(c, slug);
});

pages.delete("/:slug/files/:fileId", async (c) => {
  const slug = c.req.param("slug");
  const fileId = c.req.param("fileId");
  const authUser = await resolveAuth(c);
  const clip = await getClip(slug);
  if (clip && !(await canWriteClip(clip, authUser?.id ?? null))) {
    return c.json({ ok: false, error: "Forbidden" }, 403);
  }
  if (clip?.pinHash && !isUnlocked(c, slug)) {
    return c.json({ ok: false, error: "PIN required" }, 401);
  }
  const { handleDelete } = await import("./files");
  return handleDelete(c, slug, fileId);
});

pages.delete("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug)) return c.text("Invalid slug", 400);

  const authUser = await resolveAuth(c);
  const clip = await getClip(slug);
  if (!clip) {
    if (c.req.header("HX-Request")) {
      c.header("HX-Redirect", "/");
      return c.body(null, 204);
    }
    return c.redirect("/", 302);
  }

  if (!(await canWriteClip(clip, authUser?.id ?? null))) {
    return c.text("Forbidden", 403);
  }
  if (clip.pinHash && !isUnlocked(c, slug)) {
    return c.text("PIN required", 401);
  }

  await deleteClip(slug);

  if (c.req.header("HX-Request")) {
    c.header("HX-Redirect", "/");
    return c.body(null, 204);
  }
  if (c.req.header("Accept")?.includes("application/json")) {
    return c.json({ ok: true });
  }
  return c.redirect("/", 302);
});

export { pages };
