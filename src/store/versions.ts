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

const versionTimers = new Map<string, Timer>();

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
