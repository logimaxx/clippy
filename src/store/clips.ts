import { eq, lt, and, isNotNull, isNull, or, gt, desc } from "drizzle-orm";
import { db } from "../db/client";
import { clips, type Clip, type NewClip, type ClipVisibility } from "../db/schema";
import { DEFAULT_TTL } from "../lib/constants";
import { fireWebhook } from "../lib/webhook";
import { getFilesDir } from "../lib/cleanup";
import * as memory from "./memory";
import { unlink, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const writeTimers = new Map<string, Timer>();

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
  const expiresAt =
    normalized.expiresAt !== undefined
      ? normalized.expiresAt
      : burnOnRead
        ? null
        : now + DEFAULT_TTL;

  const clip: NewClip = {
    slug,
    content: normalized.content ?? "",
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
  visibility?: ClipVisibility;
  ownerId?: string | null;
  teamId?: string | null;
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
    pinHash: null,
    encrypted: false,
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
 * PIN and E2E are mutually exclusive. Prefer E2E when both would be active
 * (enabling encryption clears PIN; setting a PIN clears encryption; heal legacy both).
 */
export function applyProtectionConstraints(
  clip: Pick<Clip, "pinHash" | "encrypted">,
  updates: ClipSettingsUpdate
): ClipSettingsUpdate {
  const next: ClipSettingsUpdate = { ...updates };

  if (next.encrypted === true) {
    next.pinHash = null;
  }
  if (next.pinHash !== undefined && next.pinHash !== null) {
    next.encrypted = false;
  }

  const pinHash = next.pinHash !== undefined ? next.pinHash : clip.pinHash;
  const encrypted = next.encrypted !== undefined ? next.encrypted : clip.encrypted;
  if (pinHash && encrypted) {
    next.pinHash = null;
  }

  return next;
}

/**
 * Enforce: public clips cannot use burn-after-read, PIN, or E2E.
 * - Publishing clears those and sets a TTL if needed.
 * - Enabling burn / PIN / E2E on a public clip demotes it to private.
 * Also enforces PIN XOR E2E.
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
    expiresAt: listing.expiresAt ?? now + DEFAULT_TTL,
  };
}

export async function updateSettings(slug: string, settings: ClipSettingsUpdate) {
  const current = await getClip(slug);
  if (!current) return null;

  const constrained = applyVisibilityConstraints(current, settings);
  await db.update(clips).set(constrained).where(eq(clips.slug, slug));
  memory.deleteCached(slug);
  return getClip(slug);
}

export async function listPublicClips(limit = 50): Promise<Clip[]> {
  const now = Math.floor(Date.now() / 1000);
  return db
    .select()
    .from(clips)
    .where(
      and(
        eq(clips.visibility, "public"),
        eq(clips.burnOnRead, false),
        eq(clips.encrypted, false),
        isNull(clips.pinHash),
        or(isNull(clips.expiresAt), gt(clips.expiresAt, now))
      )
    )
    .orderBy(desc(clips.createdAt))
    .limit(limit);
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
    .where(and(isNotNull(clips.expiresAt), lt(clips.expiresAt, now)));

  for (const clip of expired) {
    await fireWebhook(clip, "expired", { expiresAt: clip.expiresAt });
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
