import { eq, lt, and, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { clips, type Clip, type NewClip } from "../db/schema";
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

export async function createClip(
  slug: string,
  opts: Partial<NewClip> = {}
): Promise<Clip> {
  const now = Math.floor(Date.now() / 1000);
  const burnOnRead = opts.burnOnRead ?? true;
  const expiresAt =
    opts.expiresAt !== undefined
      ? opts.expiresAt
      : burnOnRead
        ? null
        : now + DEFAULT_TTL;

  const clip: NewClip = {
    slug,
    content: opts.content ?? "",
    contentType: opts.contentType ?? "text",
    expiresAt,
    burnOnRead,
    viewCount: 0,
    language: opts.language ?? null,
    metadata: opts.metadata ?? null,
    filePath: opts.filePath ?? null,
    maxViews: opts.maxViews ?? null,
    pinHash: opts.pinHash ?? null,
    webhookUrl: opts.webhookUrl ?? null,
    encrypted: opts.encrypted ?? false,
    ownerId: opts.ownerId ?? null,
    teamId: opts.teamId ?? null,
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
  expiresAt?: number;
  burnOnRead?: boolean;
  language?: string | null;
  maxViews?: number | null;
  pinHash?: string | null;
  webhookUrl?: string | null;
  encrypted?: boolean;
  ownerId?: string | null;
  teamId?: string | null;
}

export async function updateSettings(slug: string, settings: ClipSettingsUpdate) {
  await db.update(clips).set(settings).where(eq(clips.slug, slug));
  memory.deleteCached(slug);
  const clip = await getClip(slug);
  return clip;
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
