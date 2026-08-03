import {
  eq,
  lt,
  lte,
  and,
  isNotNull,
  isNull,
  or,
  gt,
  asc,
  desc,
  sql,
  count,
} from "drizzle-orm";
import { db } from "../db/client";
import { clips, teams, type Clip, type NewClip, type ClipVisibility } from "../db/schema";
import {
  applyBurnExpiryCap,
  BURN_MAX_TTL,
  DEFAULT_TTL,
  isReservedSlug,
  isValidSlug,
  parseVanitySlug,
  SLUG_REGEX,
} from "../lib/constants";
import { fireWebhook } from "../lib/webhook";
import { getFilesDir } from "../lib/cleanup";
import { clearVersionTimer, deleteVersionsForClip, reassignVersions } from "./versions";
import * as memory from "./memory";
import { contentForStorage, mergeContentWrite } from "./workspace";
import { mkdir, rename, unlink, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const writeTimers = new Map<string, Timer>();

export const KLIPWALL_PAGE_SIZE = 20;
const PUBLIC_SEARCH_MAX_LEN = 100;

/** Escape `\`, `%`, and `_` so user input is matched literally in LIKE. */
function escapeLikePattern(value: string): string {
  return value.replace(/([\\%_])/g, "\\$1");
}

function publicClipConditions(query?: string) {
  const now = Math.floor(Date.now() / 1000);
  const conditions = [
    eq(clips.visibility, "public"),
    eq(clips.burnOnRead, false),
    eq(clips.encrypted, false),
    isNull(clips.pinHash),
    or(isNull(clips.expiresAt), gt(clips.expiresAt, now)),
  ];

  const q = query?.trim().slice(0, PUBLIC_SEARCH_MAX_LEN);
  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`;
    conditions.push(
      or(
        sql`${clips.slug} LIKE ${pattern} ESCAPE '\\'`,
        sql`${clips.content} LIKE ${pattern} ESCAPE '\\'`
      )
    );
  }

  return conditions;
}

export async function getClip(slug: string): Promise<Clip | null> {
  const cached = memory.getCached(slug);
  if (cached) return cached;

  const rows = await db.select().from(clips).where(eq(clips.slug, slug)).limit(1);
  const clip = rows[0] ?? null;
  if (clip) memory.setCached(clip);
  return clip;
}

/** Always load from DB and refresh the memory cache (bypass stale cache). */
export async function getClipFresh(slug: string): Promise<Clip | null> {
  const rows = await db.select().from(clips).where(eq(clips.slug, slug)).limit(1);
  const clip = rows[0] ?? null;
  if (clip) memory.setCached(clip);
  else memory.deleteCached(slug);
  return clip;
}

export async function createClip(
  slug: string,
  opts: Partial<NewClip> = {}
): Promise<Clip> {
  const now = Math.floor(Date.now() / 1000);
  const normalized = normalizeNewClipPublic(opts, now);
  const burnOnRead = normalized.burnOnRead ?? false;
  const expiresAt = applyBurnExpiryCap(
    burnOnRead,
    normalized.expiresAt !== undefined
      ? normalized.expiresAt
      : burnOnRead
        ? now + BURN_MAX_TTL
        : now + DEFAULT_TTL,
    now
  );

  const clip: NewClip = {
    slug,
    content: contentForStorage(
      normalized.content ?? "",
      normalized.language ?? null
    ),
    contentType: normalized.contentType ?? "text",
    expiresAt,
    burnOnRead,
    viewCount: 0,
    language: normalized.language ?? null,
    metadata: normalized.metadata ?? null,
    filePath: normalized.filePath ?? null,
    maxViews: normalized.maxViews ?? null,
    pinHash: normalized.pinHash ?? null,
    ownerPasswordHash: normalized.ownerPasswordHash ?? null,
    webhookUrl: normalized.webhookUrl ?? null,
    encrypted: normalized.encrypted ?? false,
    e2eSalt: normalized.e2eSalt ?? null,
    e2eWrappedKey: normalized.e2eWrappedKey ?? null,
    e2eKdf: normalized.e2eKdf ?? null,
    visibility: normalized.visibility ?? "private",
    ownerId: normalized.ownerId ?? null,
    teamId: normalized.teamId ?? null,
  };

  await db.insert(clips).values(clip);
  const created = await getClip(slug);
  if (!created) throw new Error("Failed to create clip");
  return created;
}

export async function ensureClip(
  slug: string,
  opts: Partial<NewClip> = {}
): Promise<Clip> {
  const existing = await getClip(slug);
  if (existing) return existing;
  return createClip(slug, opts);
}

/**
 * Create a private clip with the same text content (and language) as a
 * listable public source. Attachments are copied separately.
 */
export async function clonePublicClip(
  source: Clip,
  newSlug: string,
  opts: { ownerId?: string | null } = {}
): Promise<Clip> {
  if (!isListablePublic(source)) {
    throw new Error("Source clip is not publicly listable");
  }

  return createClip(newSlug, {
    content: source.content,
    contentType: "text",
    language: source.language,
    visibility: "private",
    ownerId: opts.ownerId ?? null,
  });
}

export function schedulePersist(slug: string, content: string) {
  const cached = memory.getCached(slug);
  if (cached) {
    cached.content = content;
    cached.dirty = true;
  }

  const existing = writeTimers.get(slug);
  if (existing) clearTimeout(existing);

  writeTimers.set(
    slug,
    setTimeout(async () => {
      writeTimers.delete(slug);
      await db.update(clips).set({ content }).where(eq(clips.slug, slug));
      const c = memory.getCached(slug);
      if (c) c.dirty = false;
    }, 500)
  );
}

export async function updateContent(slug: string, content: string) {
  const existing = await getClip(slug);
  const next =
    existing && !existing.encrypted
      ? mergeContentWrite(existing.content, content, existing.language)
      : content;
  schedulePersist(slug, next);
  await db.update(clips).set({ content: next }).where(eq(clips.slug, slug));
  const cached = memory.getCached(slug);
  if (cached) {
    cached.content = next;
    cached.dirty = false;
  }
}

/** Replace stored content blob as-is (workspace JSON or E2E ciphertext). */
export async function replaceContent(slug: string, content: string) {
  schedulePersist(slug, content);
  await db.update(clips).set({ content }).where(eq(clips.slug, slug));
  const cached = memory.getCached(slug);
  if (cached) {
    cached.content = content;
    cached.dirty = false;
  }
}

export interface ClipSettingsUpdate {
  expiresAt?: number | null;
  burnOnRead?: boolean;
  language?: string | null;
  maxViews?: number | null;
  pinHash?: string | null;
  ownerPasswordHash?: string | null;
  webhookUrl?: string | null;
  encrypted?: boolean;
  e2eSalt?: string | null;
  e2eWrappedKey?: string | null;
  e2eKdf?: string | null;
  /** Optional content update (e.g. ciphertext when enabling E2E). */
  content?: string;
  visibility?: ClipVisibility;
  ownerId?: string | null;
  teamId?: string | null;
}

/** Clear all E2E passphrase material. */
export function clearE2eFields(): Pick<
  ClipSettingsUpdate,
  "encrypted" | "e2eSalt" | "e2eWrappedKey" | "e2eKdf" | "pinHash"
> {
  return {
    encrypted: false,
    e2eSalt: null,
    e2eWrappedKey: null,
    e2eKdf: null,
    pinHash: null,
  };
}

/** Legacy server PIN gate (plaintext at rest) — not passphrase E2E. */
export function needsLegacyPinGate(
  clip: Pick<Clip, "pinHash" | "encrypted">
): boolean {
  return !!clip.pinHash && !clip.encrypted;
}

/** Logged-in account or owner password can recover access if the owner cookie is lost. */
export function hasOwnerRecovery(clip: Pick<Clip, "ownerId" | "ownerPasswordHash">): boolean {
  return !!clip.ownerId || !!clip.ownerPasswordHash;
}

/** Shape required for a clip to stay on Klipwall (no burn / PIN / E2E). */
export function publicListingUpdates(
  clip: Pick<Clip, "expiresAt">,
  now = Math.floor(Date.now() / 1000)
): ClipSettingsUpdate {
  const expiresAt =
    clip.expiresAt !== null && clip.expiresAt > now
      ? clip.expiresAt
      : now + DEFAULT_TTL;

  return {
    visibility: "public",
    burnOnRead: false,
    maxViews: null,
    ...clearE2eFields(),
    expiresAt,
  };
}

export function isListablePublic(clip: Clip, now = Math.floor(Date.now() / 1000)): boolean {
  return (
    clip.visibility === "public" &&
    !clip.burnOnRead &&
    !clip.pinHash &&
    !clip.encrypted &&
    (clip.expiresAt === null || clip.expiresAt > now)
  );
}

/**
 * Passphrase protect always means encrypted. Enabling E2E clears legacy pinHash.
 * Clearing encryption clears E2E material. Legacy pinHash alone stays unencrypted.
 */
export function applyProtectionConstraints(
  clip: Pick<Clip, "pinHash" | "encrypted" | "e2eSalt" | "e2eWrappedKey" | "e2eKdf">,
  updates: ClipSettingsUpdate
): ClipSettingsUpdate {
  const next: ClipSettingsUpdate = { ...updates };

  if (next.encrypted === true) {
    next.pinHash = null;
  }

  if (next.encrypted === false) {
    next.e2eSalt = null;
    next.e2eWrappedKey = null;
    next.e2eKdf = null;
  }

  // Passphrase material implies encryption.
  if (next.e2eSalt || next.e2eWrappedKey) {
    next.encrypted = true;
    next.pinHash = null;
  }

  // Legacy: setting a server PIN without E2E fields turns off encryption.
  if (
    next.pinHash !== undefined &&
    next.pinHash !== null &&
    next.encrypted !== true &&
    !next.e2eSalt &&
    !next.e2eWrappedKey
  ) {
    next.encrypted = false;
    next.e2eSalt = null;
    next.e2eWrappedKey = null;
    next.e2eKdf = null;
  }

  const encrypted = next.encrypted !== undefined ? next.encrypted : clip.encrypted;
  if (encrypted && (next.pinHash === undefined ? clip.pinHash : next.pinHash)) {
    next.pinHash = null;
  }

  return next;
}

/**
 * Enforce: public clips cannot use burn-after-read, PIN, or E2E.
 * - Publishing clears those and sets a TTL if needed.
 * - Enabling burn / PIN / E2E on a public clip demotes it to private.
 */
export function applyVisibilityConstraints(
  clip: Clip,
  updates: ClipSettingsUpdate,
  now = Math.floor(Date.now() / 1000)
): ClipSettingsUpdate {
  const next = applyProtectionConstraints(clip, updates);

  if (next.visibility === "public") {
    const mergedExpires =
      next.expiresAt !== undefined ? next.expiresAt : clip.expiresAt;
    return {
      ...next,
      ...publicListingUpdates({ expiresAt: mergedExpires ?? null }, now),
    };
  }

  const visibility = next.visibility ?? clip.visibility;
  const burnOnRead = next.burnOnRead ?? clip.burnOnRead;
  const pinHash = next.pinHash !== undefined ? next.pinHash : clip.pinHash;
  const encrypted = next.encrypted !== undefined ? next.encrypted : clip.encrypted;

  if (visibility === "public" && (burnOnRead || !!pinHash || encrypted)) {
    next.visibility = "private";
  }

  return next;
}

function normalizeNewClipPublic(
  opts: Partial<NewClip>,
  now: number
): Partial<NewClip> {
  let next = opts;
  if (next.encrypted && next.pinHash) {
    next = { ...next, pinHash: null };
  }
  if (next.e2eSalt || next.e2eWrappedKey) {
    next = { ...next, encrypted: true, pinHash: null };
  }

  if ((next.visibility ?? "private") !== "public") return next;

  const listing = publicListingUpdates(
    { expiresAt: next.expiresAt ?? null },
    now
  );
  return {
    ...next,
    visibility: "public",
    burnOnRead: false,
    maxViews: null,
    pinHash: null,
    encrypted: false,
    e2eSalt: null,
    e2eWrappedKey: null,
    e2eKdf: null,
    expiresAt: listing.expiresAt ?? now + DEFAULT_TTL,
  };
}

export async function updateSettings(slug: string, settings: ClipSettingsUpdate) {
  const current = await getClip(slug);
  if (!current) return null;

  const now = Math.floor(Date.now() / 1000);
  const constrained = applyVisibilityConstraints(current, settings, now);
  const burnOnRead =
    constrained.burnOnRead !== undefined ? constrained.burnOnRead : current.burnOnRead;
  if (burnOnRead) {
    const mergedExpires =
      constrained.expiresAt !== undefined ? constrained.expiresAt : current.expiresAt;
    constrained.expiresAt = applyBurnExpiryCap(true, mergedExpires, now);
  }
  const { content: contentUpdate, ...settingsOnly } = constrained;
  await db.update(clips).set(settingsOnly).where(eq(clips.slug, slug));
  if (contentUpdate !== undefined) {
    await db.update(clips).set({ content: contentUpdate }).where(eq(clips.slug, slug));
    const cached = memory.getCached(slug);
    if (cached) {
      cached.content = contentUpdate;
      cached.dirty = false;
    }
  } else if (
    constrained.language !== undefined &&
    !current.encrypted &&
    !(constrained.encrypted === true)
  ) {
    const { parseWorkspace, serializeWorkspace, setTabLanguage, getActiveTab } =
      await import("./workspace");
    const ws = parseWorkspace(current.content, current.language);
    const active = getActiveTab(ws);
    const next = serializeWorkspace(
      setTabLanguage(ws, active.id, constrained.language ?? null)
    );
    await db.update(clips).set({ content: next }).where(eq(clips.slug, slug));
  }
  memory.deleteCached(slug);
  return getClip(slug);
}

export type RenameClipError = "not_found" | "invalid" | "reserved" | "taken" | "same";

export type RenameClipResult =
  | { ok: true; clip: Clip }
  | { ok: false; error: RenameClipError };

/**
 * Resolve a requested slug rename against the current slug.
 * Vanity clips stay under the same team; the name segment may be typed alone.
 */
export function resolveRenameSlug(currentSlug: string, requested: string): string | null {
  const trimmed = requested.trim();
  if (!trimmed || trimmed === currentSlug) return trimmed === currentSlug ? currentSlug : null;

  if (currentSlug.includes("/")) {
    const [team] = currentSlug.split("/");
    if (!team) return null;
    if (trimmed.includes("/")) {
      const [reqTeam, reqName] = trimmed.split("/");
      if (!reqTeam || !reqName || reqTeam !== team) return null;
      return parseVanitySlug(team, reqName);
    }
    return parseVanitySlug(team, trimmed);
  }

  if (trimmed.includes("/") || !SLUG_REGEX.test(trimmed)) return null;
  if (isReservedSlug(trimmed)) return null;
  return trimmed;
}

async function flushPendingWrite(slug: string) {
  const timer = writeTimers.get(slug);
  if (timer) {
    clearTimeout(timer);
    writeTimers.delete(slug);
  }
  const cached = memory.getCached(slug);
  if (cached?.dirty) {
    await db.update(clips).set({ content: cached.content }).where(eq(clips.slug, slug));
    cached.dirty = false;
  }
}

/** Rename a clip's primary slug, moving versions and on-disk attachments. */
export async function renameClip(
  oldSlug: string,
  requestedSlug: string
): Promise<RenameClipResult> {
  const newSlug = resolveRenameSlug(oldSlug, requestedSlug);
  if (newSlug === null) {
    if (isReservedSlug(requestedSlug.trim()) || isReservedSlug(requestedSlug.trim().split("/")[0] ?? "")) {
      return { ok: false, error: "reserved" };
    }
    return { ok: false, error: "invalid" };
  }
  if (newSlug === oldSlug) return { ok: false, error: "same" };
  if (!isValidSlug(newSlug)) return { ok: false, error: "invalid" };
  if (isReservedSlug(newSlug)) return { ok: false, error: "reserved" };

  const current = await getClip(oldSlug);
  if (!current) return { ok: false, error: "not_found" };

  const taken = await getClip(newSlug);
  if (taken) return { ok: false, error: "taken" };

  await flushPendingWrite(oldSlug);
  clearVersionTimer(oldSlug);

  const oldDir = join(getFilesDir(), oldSlug);
  const newDir = join(getFilesDir(), newSlug);
  if (existsSync(oldDir) && existsSync(newDir)) {
    return { ok: false, error: "taken" };
  }

  let nextFilePath = current.filePath;
  if (nextFilePath && nextFilePath.startsWith(oldDir)) {
    nextFilePath = newDir + nextFilePath.slice(oldDir.length);
  }

  await reassignVersions(oldSlug, newSlug);
  await db
    .update(clips)
    .set({ slug: newSlug, filePath: nextFilePath })
    .where(eq(clips.slug, oldSlug));

  if (existsSync(oldDir)) {
    await mkdir(dirname(newDir), { recursive: true });
    await rename(oldDir, newDir);
  }

  memory.deleteCached(oldSlug);
  const clip = await getClipFresh(newSlug);
  if (!clip) return { ok: false, error: "not_found" };
  return { ok: true, clip };
}

export async function listPublicClips(
  limit = 50,
  query?: string,
  offset = 0
): Promise<Clip[]> {
  return db
    .select()
    .from(clips)
    .where(and(...publicClipConditions(query)))
    .orderBy(desc(clips.createdAt), desc(clips.slug))
    .limit(limit)
    .offset(Math.max(0, offset));
}

/** Wall-clock window used for “expiring soon” badges and filters. */
export const EXPIRING_SOON_WINDOW_S = 24 * 60 * 60;

export type OwnedClipRow = Clip & {
  teamSlug: string | null;
  teamName: string | null;
};

export interface ListOwnedClipsOpts {
  /** `all` (default), `personal` (no team), or a team slug. */
  team?: "all" | "personal" | string;
  visibility?: "all" | "private" | "public";
  /** Only clips whose TTL ends within EXPIRING_SOON_WINDOW_S. */
  expiringSoon?: boolean;
  limit?: number;
}

export function isExpiringSoon(
  expiresAt: number | null,
  now = Math.floor(Date.now() / 1000)
): boolean {
  if (expiresAt === null) return false;
  return expiresAt > now && expiresAt <= now + EXPIRING_SOON_WINDOW_S;
}

export async function countOwnedClips(ownerId: string): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const rows = await db
    .select({ value: count() })
    .from(clips)
    .where(
      and(
        eq(clips.ownerId, ownerId),
        or(isNull(clips.expiresAt), gt(clips.expiresAt, now))
      )
    );
  return rows[0]?.value ?? 0;
}

/** Account-owned clips only (owner_id = user), including team-scoped ones. */
export async function listOwnedClips(
  ownerId: string,
  opts: ListOwnedClipsOpts = {}
): Promise<OwnedClipRow[]> {
  const now = Math.floor(Date.now() / 1000);
  const conditions = [
    eq(clips.ownerId, ownerId),
    // Hard-deleted by cleanup; also hide anything already past TTL.
    or(isNull(clips.expiresAt), gt(clips.expiresAt, now)),
  ];

  if (opts.visibility === "private" || opts.visibility === "public") {
    conditions.push(eq(clips.visibility, opts.visibility));
  }

  if (opts.team === "personal") {
    conditions.push(isNull(clips.teamId));
  } else if (opts.team && opts.team !== "all") {
    conditions.push(eq(teams.slug, opts.team));
  }

  if (opts.expiringSoon) {
    conditions.push(
      and(
        isNotNull(clips.expiresAt),
        gt(clips.expiresAt, now),
        lte(clips.expiresAt, now + EXPIRING_SOON_WINDOW_S)
      )!
    );
  }

  const rows = await db
    .select({
      clip: clips,
      teamSlug: teams.slug,
      teamName: teams.name,
    })
    .from(clips)
    .leftJoin(teams, eq(clips.teamId, teams.id))
    .where(and(...conditions))
    .orderBy(
      sql`CASE WHEN ${clips.expiresAt} IS NULL THEN 1 ELSE 0 END`,
      asc(clips.expiresAt),
      desc(clips.createdAt)
    )
    .limit(opts.limit ?? 200);

  return rows.map((row) => ({
    ...row.clip,
    teamSlug: row.teamSlug,
    teamName: row.teamName,
  }));
}

export async function countPublicClips(query?: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(clips)
    .where(and(...publicClipConditions(query)));
  return rows[0]?.value ?? 0;
}

export async function recordView(slug: string): Promise<Clip | null> {
  const clip = await getClip(slug);
  if (!clip) return null;

  const viewCount = clip.viewCount + 1;
  const burned =
    clip.burnOnRead || (clip.maxViews !== null && clip.maxViews > 0 && viewCount >= clip.maxViews);

  await db.update(clips).set({ viewCount }).where(eq(clips.slug, slug));

  const viewed = { ...clip, viewCount };
  await fireWebhook(viewed, burned ? "burned" : "read", {
    viewCount,
    burned,
  });

  if (burned) {
    await deleteClip(slug);
    return viewed;
  }

  memory.setCached(viewed);
  return viewed;
}

export async function deleteClip(slug: string) {
  const clip = await getClip(slug);
  memory.deleteCached(slug);
  await deleteVersionsForClip(slug);
  await db.delete(clips).where(eq(clips.slug, slug));

  const slugDir = join(getFilesDir(), slug);
  if (existsSync(slugDir)) {
    await rm(slugDir, { recursive: true, force: true }).catch(() => {});
  }

  if (clip?.filePath && existsSync(clip.filePath)) {
    await unlink(clip.filePath).catch(() => {});
  }
}

export async function cleanupExpired() {
  const now = Math.floor(Date.now() / 1000);
  const expired = await db
    .select()
    .from(clips)
    .where(
      or(
        and(isNotNull(clips.expiresAt), lt(clips.expiresAt, now)),
        and(
          eq(clips.burnOnRead, true),
          isNull(clips.expiresAt),
          lt(clips.createdAt, now - BURN_MAX_TTL)
        )
      )
    );

  for (const clip of expired) {
    await fireWebhook(clip, "expired", { expiresAt: clip.expiresAt ?? now });
    await deleteClip(clip.slug);
  }

  return expired.length;
}

export async function listAllWithFiles(): Promise<Clip[]> {
  return db.select().from(clips);
}

export interface ClipFileMeta {
  fileId: string;
  filename: string;
  size: number;
  mimeType: string;
}

export function getClipFilePath(slug: string, fileId: string): string {
  return join(getFilesDir(), slug, fileId);
}

export function getClipFiles(clip: Clip): ClipFileMeta[] {
  if (!clip.metadata && !clip.filePath) return [];

  if (clip.metadata) {
    try {
      const meta = JSON.parse(clip.metadata) as {
        files?: ClipFileMeta[];
        fileId?: string;
        filename?: string;
        size?: number;
        mimeType?: string;
      };

      if (Array.isArray(meta.files)) {
        return meta.files.filter((f) => f.fileId);
      }

      if (meta.fileId || meta.filename) {
        const fileId = meta.fileId ?? clip.filePath?.split("/").pop();
        if (fileId) {
          return [
            {
              fileId,
              filename: meta.filename ?? fileId,
              size: meta.size ?? 0,
              mimeType: meta.mimeType ?? "application/octet-stream",
            },
          ];
        }
      }
    } catch {
      /* fall through */
    }
  }

  if (clip.filePath) {
    const fileId = clip.filePath.split("/").pop();
    if (fileId) {
      return [
        {
          fileId,
          filename: fileId,
          size: 0,
          mimeType: "application/octet-stream",
        },
      ];
    }
  }

  return [];
}

/** @deprecated Use getClipFiles */
export function getFileMeta(clip: Clip) {
  const files = getClipFiles(clip);
  return files[0] ?? null;
}

/** @deprecated Use getClipFiles */
export function getFileId(clip: Clip): string | null {
  return getClipFiles(clip)[0]?.fileId ?? null;
}
