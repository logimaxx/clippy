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
  contentTooLargeMessage,
  MAX_FILES_PER_CLIP,
} from "../lib/constants";
import { getClientIp, rateLimit } from "../lib/rate-limit";
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
import { getTeamBySlug, getMemberRole, canReadClip, canWriteClip } from "../lib/teams";
import { trackAppAccess } from "../lib/umami";
import {
  ensureClip,
  createClip,
  updateSettings,
  getClip,
  updateContent,
  replaceContent,
  deleteClip,
  recordView,
  listPublicClips,
  countPublicClips,
  KLIPWALL_PAGE_SIZE,
  getClipFiles,
  isListablePublic,
  clonePublicClip,
  needsLegacyPinGate,
  clearE2eFields,
} from "../store/clips";
import { listVersions, getVersion } from "../store/versions";
import { ClipPage } from "../views/ClipPage";
import { ClipLinkPreview } from "../views/ClipLinkPreview";
import { ClipGone } from "../views/ClipGone";
import { PinGate } from "../views/PinGate";
import { OwnerClaim } from "../views/OwnerClaim";
import { KlipwallPage } from "../views/Klipwall";
import { AppHome } from "../views/AppHome";
import { SettingsPanel } from "../views/partials/Settings";
import * as rooms from "../ws/rooms";

function trackClipAppAccess(c: Context): void {
  trackAppAccess({
    userAgent: c.req.header("user-agent"),
    language: c.req.header("accept-language"),
    referrer: c.req.header("referer"),
  });
}
import type { Clip } from "../db/schema";

const pages = new Hono();
const CLIP_CREATE_LIMIT = Number(process.env.RATE_LIMIT_CLIPS_PER_HOUR ?? 30);

function settingsPanelProps(slug: string, clip: Clip, versions: Awaited<ReturnType<typeof listVersions>>) {
  return {
    slug,
    expiresAt: clip.expiresAt,
    burnOnRead: clip.burnOnRead,
    maxViews: clip.maxViews,
    hasPin: !!clip.pinHash,
    hasOwnerPassword: !!clip.ownerPasswordHash,
    webhookUrl: clip.webhookUrl,
    encrypted: clip.encrypted,
    e2eSalt: clip.e2eSalt,
    e2eWrappedKey: clip.e2eWrappedKey,
    e2eKdf: clip.e2eKdf,
    visibility: clip.visibility === "public" ? ("public" as const) : ("private" as const),
    devices: 1,
    versions,
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

  if (needsLegacyPinGate(clip) && !isUnlocked(c, slug)) {
    if (crawler) return c.html(<ClipLinkPreview slug={slug} />);
    trackClipAppAccess(c);
    return c.html(<PinGate slug={slug} />);
  }

  if (crawler) {
    if (isListablePublic(clip) && clip.content.trim()) {
      const { workspacePlainText } = await import("../store/workspace");
      return c.html(
        <ClipLinkPreview slug={slug} content={workspacePlainText(clip.content)} />
      );
    }
    return c.html(<ClipLinkPreview slug={slug} />);
  }

  const owner =
    createdNow || isClipOwner(c, slug, authUser?.id ?? null, clip.ownerId);
  const canWrite = await canWriteClip(clip, authUser?.id ?? null, owner);

  // Heal legacy PIN+E2E → keep E2E, drop server PIN.
  if (owner && clip.pinHash && clip.encrypted) {
    const healed = await updateSettings(slug, { pinHash: null });
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
  const cloneErrorCode = c.req.query("clone_error");
  const cloneSlugValue = (c.req.query("clone_slug") ?? "").trim();
  const cloneError =
    cloneErrorCode === "invalid"
      ? "Use 3–64 letters, numbers, hyphens, or underscores."
      : cloneErrorCode === "reserved"
        ? "That name is reserved. Pick another."
        : cloneErrorCode === "taken"
          ? "That name is already taken. Pick another."
          : null;

  trackClipAppAccess(c);
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
      cloneError={cloneError}
      cloneSlugValue={cloneSlugValue}
      user={authUser}
    />
  );
}

pages.get("/klipwall", async (c) => {
  const query = (c.req.query("q") ?? "").trim();
  const search = query || undefined;
  const total = await countPublicClips(search);
  const totalPages = Math.max(1, Math.ceil(total / KLIPWALL_PAGE_SIZE));
  const requested = Number.parseInt(c.req.query("page") ?? "1", 10);
  const page = Number.isFinite(requested)
    ? Math.min(Math.max(1, requested), totalPages)
    : 1;
  const clips = await listPublicClips(
    KLIPWALL_PAGE_SIZE,
    search,
    (page - 1) * KLIPWALL_PAGE_SIZE
  );
  return c.html(
    <KlipwallPage
      clips={clips}
      query={query}
      page={page}
      totalPages={totalPages}
      total={total}
      user={await resolveAuth(c)}
    />
  );
});

pages.get("/explore", (c) => c.redirect("/klipwall", 301));

/** Product create shell — used as PWA start_url; works when marketing owns `/`. */
pages.get("/app", async (c) => {
  const authUser = await resolveAuth(c);
  return c.html(
    <AppHome
      user={authUser}
      createError={c.req.query("create_error")}
      createSlug={c.req.query("create_slug")}
    />
  );
});

/** OSS / self-host entry. Skipped when marketing `dist/pages` serves `/`. */
pages.get("/", async (c) => {
  const authUser = await resolveAuth(c);
  return c.html(
    <AppHome
      user={authUser}
      createError={c.req.query("create_error")}
      createSlug={c.req.query("create_slug")}
    />
  );
});

function collectUploadFiles(body: Record<string, unknown>): File[] {
  const raw = body.file;
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  return list.filter((f): f is File => f instanceof File && f.size > 0);
}

/** Prefer form `content`; otherwise compose Web Share Target title/text/url. */
function contentFromCreateBody(body: Record<string, unknown>): string {
  if (typeof body.content === "string" && body.content.length > 0) {
    return body.content;
  }
  const parts: string[] = [];
  for (const key of ["title", "text", "url"] as const) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  }
  // Avoid duplicating URL when Android puts the same link in text + url.
  return [...new Set(parts)].join("\n\n");
}

pages.post("/new", async (c) => {
  const authUser = await resolveAuth(c);
  const body = await c.req.parseBody({ all: true });
  const custom = typeof body.slug === "string" ? body.slug.trim() : "";
  const wantsCustom = Boolean(custom);
  const customOk =
    wantsCustom && isValidSlug(custom) && !isReservedSlug(custom);
  const fromAccount = body.from === "account";
  const createErrorBase = fromAccount ? "/account" : "/app";

  if (wantsCustom && customOk) {
    if (await getClip(custom)) {
      const params = new URLSearchParams({
        create_error: "taken",
        create_slug: custom,
      });
      return c.redirect(`${createErrorBase}?${params}`, 302);
    }
  }

  let slug = customOk ? custom : generateSlug(10);
  if (!customOk) {
    for (let i = 0; i < 5 && (await getClip(slug)); i++) {
      slug = generateSlug(10);
    }
    if (await getClip(slug)) {
      return c.text("Could not allocate a unique clip. Try again.", 503);
    }
  }

  const rawContent = contentFromCreateBody(body as Record<string, unknown>);
  const parsed = clipContentSchema.safeParse({ content: rawContent });
  if (!parsed.success) return c.text(contentTooLargeMessage(), 400);
  const files = collectUploadFiles(body as Record<string, unknown>);
  try {
    await createClip(slug, {
      ownerId: authUser?.id ?? null,
      content: parsed.data.content,
    });
  } catch {
    if (customOk) {
      const params = new URLSearchParams({
        create_error: "taken",
        create_slug: custom,
      });
      return c.redirect(`${createErrorBase}?${params}`, 302);
    }
    return c.text("Could not allocate a unique clip. Try again.", 503);
  }
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
  const body = await c.req.parseBody();
  const fromAccount = body.from === "account";
  const accountTeamHref = `/account?team=${encodeURIComponent(teamSlug)}`;

  // A team's existence is private, so a non-member gets the same answer as a
  // missing team rather than a hint that the slug is taken.
  const role = team ? await getMemberRole(team.id, authUser.id) : null;
  if (!team || !role) {
    if (fromAccount) {
      return c.redirect(`/account?create_error=${encodeURIComponent("Team not found")}`, 302);
    }
    return c.text("Team not found", 404);
  }

  if (role === "viewer") {
    if (fromAccount) {
      return c.redirect(
        `${accountTeamHref}&create_error=${encodeURIComponent("Viewers cannot create team clips")}`,
        302
      );
    }
    return c.text("Viewers cannot create team clips", 403);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const fullSlug = parseVanitySlug(teamSlug, name);
  if (!fullSlug) {
    if (fromAccount) {
      return c.redirect(
        `${accountTeamHref}&create_error=${encodeURIComponent("Invalid clip name")}`,
        302
      );
    }
    return c.text("Invalid clip name", 400);
  }

  const existing = await getClip(fullSlug);
  if (existing) {
    if (fromAccount) {
      return c.redirect(
        `${accountTeamHref}&create_error=${encodeURIComponent("Clip already exists")}`,
        302
      );
    }
    return c.text("Clip already exists", 409);
  }

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

  await replaceContent(slug, version.content);

  const { getActiveTab, parseWorkspace, serializeWorkspace } = await import(
    "../store/workspace"
  );
  const restored = parseWorkspace(version.content, clip.language);
  const active = getActiveTab(restored);

  return c.html(
    <textarea
      id="clip-content"
      name="content"
      class="editor clip-editor"
      data-ws-room={slug}
      data-ws-url={`/ws/${slug}`}
      data-encrypted={clip.encrypted ? "true" : "false"}
      data-workspace-restore={encodeURIComponent(serializeWorkspace(restored))}
    >
      {active.body}
    </textarea>
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

async function handleCloneClip(c: Context, slug: string) {
  const source = await getClip(slug);
  if (!source || !isListablePublic(source)) return c.notFound();

  const ip = getClientIp(c.req.raw.headers);
  const { allowed } = rateLimit(`clip:${ip}`, CLIP_CREATE_LIMIT, 60 * 60 * 1000);
  if (!allowed) return c.text("Too many clips created. Try again later.", 429);

  const body = await c.req.parseBody();
  const custom = typeof body.slug === "string" ? body.slug.trim() : "";

  const cloneErrorRedirect = (code: string) => {
    const params = new URLSearchParams({ clone_error: code });
    if (custom) params.set("clone_slug", custom);
    return c.redirect(`/${slug}?${params}`, 302);
  };

  let newSlug: string;
  if (custom) {
    if (!isValidSlug(custom)) return cloneErrorRedirect("invalid");
    if (isReservedSlug(custom)) return cloneErrorRedirect("reserved");
    if (await getClip(custom)) return cloneErrorRedirect("taken");
    newSlug = custom;
  } else {
    newSlug = generateSlug(10);
    for (let i = 0; i < 5 && (await getClip(newSlug)); i++) {
      newSlug = generateSlug(10);
    }
    if (await getClip(newSlug)) {
      return c.text("Could not allocate a unique clip. Try again.", 503);
    }
  }

  const authUser = await resolveAuth(c);
  await clonePublicClip(source, newSlug, {
    ownerId: authUser?.id ?? null,
  });

  const files = getClipFiles(source);
  if (files.length > 0) {
    const { copyClipAttachments } = await import("./files");
    await copyClipAttachments(slug, newSlug, files);
  }

  setOwnerCookie(c, newSlug);
  return c.redirect(`/${newSlug}`, 302);
}

pages.post("/:slug/clone", async (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug) || isReservedSlug(slug)) return c.notFound();
  return handleCloneClip(c, slug);
});

pages.post("/:team/:name/clone", async (c) => {
  const slug = parseVanitySlug(c.req.param("team"), c.req.param("name"));
  if (!slug) return c.notFound();
  return handleCloneClip(c, slug);
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
  if (!clip?.pinHash || clip.encrypted) return c.redirect(`/${slug}`, 302);

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

  if (needsLegacyPinGate(clip) && !isUnlocked(c, slug)) {
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
    // When publishing an E2E clip, client may send decrypted plaintext + protect=none.
    if (parsed.data.protect === "none" && parsed.data.content !== undefined) {
      const contentParsed = clipContentSchema.safeParse({ content: parsed.data.content });
      if (!contentParsed.success) {
        c.header("HX-Trigger", toastHeader(contentTooLargeMessage()));
        return c.html(<SettingsPanel {...settingsPanelProps(slug, clip, versions)} />);
      }
      Object.assign(updates, clearE2eFields());
      updates.content = contentParsed.data.content;
    }
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
    Object.assign(updates, clearE2eFields());
    if (parsed.data.content !== undefined) {
      const contentParsed = clipContentSchema.safeParse({ content: parsed.data.content });
      if (!contentParsed.success) {
        c.header("HX-Trigger", toastHeader(contentTooLargeMessage()));
        return c.html(<SettingsPanel {...settingsPanelProps(slug, clip, versions)} />);
      }
      updates.content = contentParsed.data.content;
    }
  } else if (
    parsed.data.protect === "passphrase" ||
    parsed.data.protect === "e2e"
  ) {
    const salt = parsed.data.e2eSalt?.trim() || "";
    const wrapped = parsed.data.e2eWrappedKey?.trim() || "";
    const kdf = parsed.data.e2eKdf?.trim() || "";
    if (!salt || !wrapped) {
      c.header(
        "HX-Trigger",
        toastHeader("Passphrase protection requires client-side encryption material")
      );
      return c.html(<SettingsPanel {...settingsPanelProps(slug, clip, versions)} />);
    }
    updates.encrypted = true;
    updates.pinHash = null;
    updates.e2eSalt = salt;
    updates.e2eWrappedKey = wrapped;
    updates.e2eKdf = kdf || JSON.stringify({ alg: "PBKDF2", hash: "SHA-256", iters: 600000 });
    if (parsed.data.content !== undefined) {
      const contentParsed = clipContentSchema.safeParse({ content: parsed.data.content });
      if (!contentParsed.success) {
        c.header("HX-Trigger", toastHeader(contentTooLargeMessage()));
        return c.html(<SettingsPanel {...settingsPanelProps(slug, clip, versions)} />);
      }
      updates.content = contentParsed.data.content;
    }
  } else if (parsed.data.clearPin) {
    updates.pinHash = null;
  } else if (parsed.data.pin && parsed.data.pin.length > 0) {
    // Legacy API/UI path — server PIN without E2E.
    updates.pinHash = await hashPin(parsed.data.pin);
    updates.encrypted = false;
    updates.e2eSalt = null;
    updates.e2eWrappedKey = null;
    updates.e2eKdf = null;
    setUnlockCookie(c, slug);
  }
  if (parsed.data.webhook !== undefined) {
    const url = parsed.data.webhook.trim();
    updates.webhookUrl = url.length > 0 ? url : null;
  }
  if (
    "encrypted" in body &&
    parsed.data.protect === undefined &&
    parsed.data.e2eSalt === undefined
  ) {
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
  if (clip && needsLegacyPinGate(clip) && !isUnlocked(c, slug)) {
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
  if (clip && needsLegacyPinGate(clip) && !isUnlocked(c, slug)) {
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
  if (needsLegacyPinGate(clip) && !isUnlocked(c, slug)) {
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
