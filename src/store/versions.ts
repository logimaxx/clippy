import { eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import { clipVersions } from "../db/schema";

const MAX_VERSIONS = 50;

export async function saveVersion(
  clipSlug: string,
  content: string,
  authorId: string | null
) {
  if (!content) return;

  const id = crypto.randomUUID();
  await db.insert(clipVersions).values({
    id,
    clipSlug,
    content,
    authorId,
  });

  const all = await db
    .select({ id: clipVersions.id })
    .from(clipVersions)
    .where(eq(clipVersions.clipSlug, clipSlug))
    .orderBy(desc(clipVersions.createdAt));

  if (all.length > MAX_VERSIONS) {
    const toDelete = all.slice(MAX_VERSIONS);
    for (const row of toDelete) {
      await db.delete(clipVersions).where(eq(clipVersions.id, row.id));
    }
  }
}

export async function listVersions(clipSlug: string, limit = 20) {
  return db
    .select()
    .from(clipVersions)
    .where(eq(clipVersions.clipSlug, clipSlug))
    .orderBy(desc(clipVersions.createdAt))
    .limit(limit);
}

export async function getVersion(versionId: string) {
  const rows = await db
    .select()
    .from(clipVersions)
    .where(eq(clipVersions.id, versionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteVersionsForClip(clipSlug: string) {
  await db.delete(clipVersions).where(eq(clipVersions.clipSlug, clipSlug));
}

/** Point version history at a new slug (used when renaming a clip). */
export async function reassignVersions(oldSlug: string, newSlug: string) {
  if (oldSlug === newSlug) return;
  await db
    .update(clipVersions)
    .set({ clipSlug: newSlug })
    .where(eq(clipVersions.clipSlug, oldSlug));
}

const versionTimers = new Map<string, Timer>();

/** Drop a pending debounced version save so it cannot write under a stale slug. */
export function clearVersionTimer(clipSlug: string) {
  const existing = versionTimers.get(clipSlug);
  if (existing) {
    clearTimeout(existing);
    versionTimers.delete(clipSlug);
  }
}

export function scheduleVersionSave(
  clipSlug: string,
  getContent: () => string,
  authorId: string | null
) {
  const existing = versionTimers.get(clipSlug);
  if (existing) clearTimeout(existing);

  versionTimers.set(
    clipSlug,
    setTimeout(async () => {
      versionTimers.delete(clipSlug);
      await saveVersion(clipSlug, getContent(), authorId);
    }, 5000)
  );
}
