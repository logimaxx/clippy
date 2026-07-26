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
  settingsToastMessage,
  MAX_TTL,
  clipContentSchema,
  MAX_FILES_PER_CLIP,
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
import {
  isClipOwner,
  setOwnerCookie,
  checkOwnerClaimAttempts,
  recordOwnerClaimFailure,
  clearOwnerClaimAttempts,
  remainingOwnerClaimAttempts,
  verifyOwnerPassword,
  OWNER_PASSWORD_MIN_LEN,
} from "../lib/owner";
import { getTeamBySlug, canReadClip, canWriteClip } from "../lib/teams";
import {
  ensureClip,
  updateSettings,
  getClip,
  updateContent,
  deleteClip,
  recordView,
  listPublicClips,
  getClipFiles,
  isListablePublic,
} from "../store/clips";
import { listVersions, getVersion } from "../store/versions";
import { ClipPage } from "../views/ClipPage";
import { ClipLinkPreview } from "../views/ClipLinkPreview";
import { ClipGone } from "../views/ClipGone";
import { PinGate } from "../views/PinGate";
import { OwnerClaim } from "../views/OwnerClaim";
import { KlipwallPage } from "../views/Klipwall";
import { SettingsPanel } from "../views/partials/Settings";
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
    hasOwnerPassword: !!clip.ownerPasswordHash,
    webhookUrl: clip.webhookUrl,
    encrypted: clip.encrypted,
    visibility: clip.visibility === "public" ? ("public" as const) : ("private" as const),
    devices: 1,
    versions,
    files: getClipFiles(clip),
  };
}

function toastHeader(message: string) {
  return JSON.stringify({ showToast: { message } }).replace(/[^\x20-\x7E]/g, "-");
}

function clipCountsAsRead(clip: Clip): boolean {
  return clip.burnOnRead || (clip.maxViews !== null && clip.maxViews > 0);
}

async function viewerCanWrite(
  c: Context,
  clip: Clip,
  userId: string | null
): Promise<boolean> {
  const owner = isClipOwner(c, clip.slug, userId, clip.ownerId);
  return canWriteClip(clip, userId, owner);
}

async function renderClipPage(c: Context, slug: string) {
  const authUser = await resolveAuth(c);
  const userAgent = c.req.header("user-agent");
  const crawler = isLinkPreviewCrawler(userAgent);

  const hadClip = await getClip(slug);
  let clip = await ensureClip(slug, {
    ownerId: authUser?.id ?? null,
  });
  // Creator is owner on this request; Set-Cookie is not visible to getCookie yet.
  const createdNow = !hadClip;
  if (createdNow) setOwnerCookie(c, slug);

  if (!(await canReadClip(clip, authUser?.id ?? null))) {
    return c.text("Forbidden", 403);
  }

  if (clip.pinHash && !isUnlocked(c, slug)) {
    if (crawler) return c.html(<ClipLinkPreview slug={slug} />);
    return c.html(<PinGate slug={slug} />);
  }

  if (crawler) {
    if (isListablePublic(clip) && clip.content.trim()) {
      return c.html(<ClipLinkPreview slug={slug} content={clip.content} />);
    }
    return c.html(<ClipLinkPreview slug={slug} />);
  }

  const owner =
    createdNow || isClipOwner(c, slug, authUser?.id ?? null, clip.ownerId);
  const canWrite = await canWriteClip(clip, authUser?.id ?? null, owner);

  // Heal legacy PIN+E2E (prefer E2E).
  if (owner && clip.pinHash && clip.encrypted) {
    const healed = await updateSettings(slug, {});
    if (healed) clip = healed;
  }

  let content = clip.content;
  let readOnly = !canWrite;
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
      hasOwnerPassword={!!clip.ownerPasswordHash}
      isOwner={owner}
      webhookUrl={clip.webhookUrl}
      encrypted={clip.encrypted}
      visibility={clip.visibility === "public" ? "public" : "private"}
      devices={rooms.roomSize(slug)}
      clip={clip}
      versions={versions}
      readOnly={readOnly}
      burned={burned}
    />
  );
}

pages.get("/klipwall", async (c) => {
  const clips = await listPublicClips(50);
  return c.html(<KlipwallPage clips={clips} />);
});

pages.get("/explore", (c) => c.redirect("/klipwall", 301));

pages.get("/demo", async (c) => renderClipPage(c, "demo"));

function collectUploadFiles(body: Record<string, unknown>): File[] {
  const raw = body.file;
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  return list.filter((f): f is File => f instanceof File && f.size > 0);
}

pages.post("/new", async (c) => {
  const authUser = await resolveAuth(c);
  const body = await c.req.parseBody({ all: true });
  const custom = typeof body.slug === "string" ? body.slug.trim() : "";
  const slug =
    custom && isValidSlug(custom) && !isReservedSlug(custom)
      ? custom
      : generateSlug(10);
  const rawContent = typeof body.content === "string" ? body.content : "";
  const parsed = clipContentSchema.safeParse({ content: rawContent });
  if (!parsed.success) return c.text("Content too large", 400);
  const files = collectUploadFiles(body as Record<string, unknown>);
  await ensureClip(slug, {
    ownerId: authUser?.id ?? null,
    content: parsed.data.content,
  });
  setOwnerCookie(c, slug);

  if (files.length > 0) {
    const { attachFileToClip } = await import("./files");
    for (const file of files.slice(0, MAX_FILES_PER_CLIP)) {
      const result = await attachFileToClip(slug, file);
      if (!result.ok) return c.text(result.error, 400);
    }
  }

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
  if (rem >= 86400) {
    const days = Math.floor(rem / 86400);
    const hours = Math.floor((rem % 86400) / 3600);
    return c.text(hours > 0 ? `${days}d ${hours}h` : `${days}d`);
  }
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
  if (!clip || !(await viewerCanWrite(c, clip, authUser?.id ?? null))) {
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

async function renderOwnerClaimGet(c: Context, slug: string) {
  const clip = await getClip(slug);
  if (!clip?.ownerPasswordHash) {
    return c.html(
      <OwnerClaim
        slug={slug}
        error="This clip has no owner password. Create one from Settings while you still have access."
      />
    );
  }

  const authUser = await resolveAuth(c);
  if (isClipOwner(c, slug, authUser?.id ?? null, clip.ownerId)) {
    return c.redirect(`/${slug}`, 302);
  }

  return c.html(<OwnerClaim slug={slug} />);
}

async function renderOwnerClaimPost(c: Context, slug: string) {
  const clip = await getClip(slug);
  if (!clip?.ownerPasswordHash) {
    return c.html(
      <OwnerClaim slug={slug} error="This clip has no owner password set." />,
      400
    );
  }

  const ip = getClientIp(c.req.raw.headers);
  if (!checkOwnerClaimAttempts(ip, slug)) {
    return c.html(
      <OwnerClaim
        slug={slug}
        error="Too many attempts. Try again in 15 minutes."
        remaining={0}
      />,
      429
    );
  }

  const body = await c.req.parseBody();
  const password = typeof body.ownerPassword === "string" ? body.ownerPassword : "";

  if (!(await verifyOwnerPassword(password, clip.ownerPasswordHash))) {
    recordOwnerClaimFailure(ip, slug);
    return c.html(
      <OwnerClaim
        slug={slug}
        error="Incorrect owner password"
        remaining={remainingOwnerClaimAttempts(ip, slug)}
      />,
      401
    );
  }

  clearOwnerClaimAttempts(ip, slug);
  setOwnerCookie(c, slug);
  return c.redirect(`/${slug}`, 302);
}

pages.get("/:slug/claim", async (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug) || isReservedSlug(slug)) return c.notFound();
  return renderOwnerClaimGet(c, slug);
});

pages.post("/:slug/claim", async (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug) || isReservedSlug(slug)) return c.notFound();
  return renderOwnerClaimPost(c, slug);
});

pages.get("/:team/:name/claim", async (c) => {
  const slug = parseVanitySlug(c.req.param("team"), c.req.param("name"));
  if (!slug) return c.notFound();
  return renderOwnerClaimGet(c, slug);
});

pages.post("/:team/:name/claim", async (c) => {
  const slug = parseVanitySlug(c.req.param("team"), c.req.param("name"));
  if (!slug) return c.notFound();
  return renderOwnerClaimPost(c, slug);
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

  if (!(await viewerCanWrite(c, clip, authUser?.id ?? null))) {
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
  const wasPublic = clip.visibility === "public";
  const owner = isClipOwner(c, slug, authUser?.id ?? null, clip.ownerId);
  const versions = await listVersions(slug);

  const wantsOwnerPassword =
    !!parsed.data.clearOwnerPassword ||
    (!!parsed.data.ownerPassword && parsed.data.ownerPassword.length > 0);
  // Unclaimed clips (no account, no password yet): first setter becomes owner.
  const canManageOwnerPassword =
    owner || (!clip.ownerPasswordHash && !clip.ownerId);

  if (wantsOwnerPassword && !canManageOwnerPassword) {
    c.header("HX-Trigger", toastHeader("Only the owner can change the owner password"));
    return c.html(<SettingsPanel {...settingsPanelProps(slug, clip, versions)} />);
  }

  if (parsed.data.clearOwnerPassword) {
    if (clip.visibility === "public" && !clip.ownerId) {
      c.header(
        "HX-Trigger",
        toastHeader("Keep an owner password while the clip is public")
      );
      return c.html(<SettingsPanel {...settingsPanelProps(slug, clip, versions)} />);
    }
    updates.ownerPasswordHash = null;
  } else if (
    parsed.data.ownerPassword &&
    parsed.data.ownerPassword.length > 0 &&
    parsed.data.visibility !== "public"
  ) {
    // Standalone password updates (not the publish modal).
    if (parsed.data.ownerPassword.length < OWNER_PASSWORD_MIN_LEN) {
      c.header(
        "HX-Trigger",
        toastHeader(`Owner password must be at least ${OWNER_PASSWORD_MIN_LEN} characters`)
      );
      return c.html(<SettingsPanel {...settingsPanelProps(slug, clip, versions)} />);
    }
    updates.ownerPasswordHash = await hashPin(parsed.data.ownerPassword);
    setOwnerCookie(c, slug);
  }

  if (parsed.data.visibility === "public") {
    const password = parsed.data.ownerPassword ?? "";
    if (password.length < OWNER_PASSWORD_MIN_LEN) {
      c.header(
        "HX-Trigger",
        toastHeader(`Owner password must be at least ${OWNER_PASSWORD_MIN_LEN} characters`)
      );
      return c.html(<SettingsPanel {...settingsPanelProps(slug, clip, versions)} />);
    }

    if (clip.ownerPasswordHash) {
      if (!(await verifyOwnerPassword(password, clip.ownerPasswordHash))) {
        c.header("HX-Trigger", toastHeader("Incorrect owner password"));
        return c.html(<SettingsPanel {...settingsPanelProps(slug, clip, versions)} />);
      }
    } else if (!canManageOwnerPassword) {
      c.header("HX-Trigger", toastHeader("Only the owner can publish this clip"));
      return c.html(<SettingsPanel {...settingsPanelProps(slug, clip, versions)} />);
    } else {
      updates.ownerPasswordHash = await hashPin(password);
    }

    setOwnerCookie(c, slug);
    updates.visibility = "public";
  } else if (parsed.data.visibility === "private") {
    updates.visibility = "private";
  }

  if (parsed.data.expiresAt !== undefined) {
    const expiresAt = parsed.data.expiresAt;
    if (expiresAt <= now) {
      c.header("HX-Trigger", toastHeader("Expiry must be in the future"));
      return c.html(<SettingsPanel {...settingsPanelProps(slug, clip, versions)} />);
    }
    if (expiresAt > now + MAX_TTL) {
      c.header("HX-Trigger", toastHeader("Expiry cannot be more than 1 year away"));
      return c.html(<SettingsPanel {...settingsPanelProps(slug, clip, versions)} />);
    }
    updates.burnOnRead = false;
    updates.expiresAt = expiresAt;
    updates.maxViews = null;
  } else if (parsed.data.ttl !== undefined) {
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
  if (parsed.data.protect === "none") {
    updates.pinHash = null;
    updates.encrypted = false;
  } else if (parsed.data.protect === "e2e") {
    updates.encrypted = true;
    updates.pinHash = null;
  } else if (parsed.data.clearPin) {
    updates.pinHash = null;
  } else if (parsed.data.pin && parsed.data.pin.length > 0) {
    updates.pinHash = await hashPin(parsed.data.pin);
    setUnlockCookie(c, slug);
  }
  if (parsed.data.webhook !== undefined) {
    const url = parsed.data.webhook.trim();
    updates.webhookUrl = url.length > 0 ? url : null;
  }
  if ("encrypted" in body && parsed.data.protect === undefined) {
    updates.encrypted = parsed.data.encrypted ?? false;
  }

  const updated = await updateSettings(slug, updates);
  if (!updated) return c.text("Not found", 404);

  const message = settingsToastMessage(
    body as Record<string, unknown>,
    parsed.data,
    updated,
    { wasPublic }
  );
  c.header("HX-Trigger", toastHeader(message));
  return c.html(<SettingsPanel {...settingsPanelProps(slug, updated, versions)} />);
});

pages.post("/:slug/upload", async (c) => {
  const slug = c.req.param("slug");
  const authUser = await resolveAuth(c);
  const clip = await getClip(slug);
  if (clip && !(await viewerCanWrite(c, clip, authUser?.id ?? null))) {
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
  if (clip && !(await viewerCanWrite(c, clip, authUser?.id ?? null))) {
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

  if (!(await viewerCanWrite(c, clip, authUser?.id ?? null))) {
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
