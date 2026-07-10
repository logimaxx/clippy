import { cleanupExpired, listAllWithFiles, deleteClip, getClipFiles, getClipFilePath } from "../store/clips";
import { existsSync } from "node:fs";
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

const dataDir = process.env.DATA_DIR ?? "./data";
const filesDir = `${dataDir}/files`;

export function getFilesDir() {
  return filesDir;
}

export async function startCleanupJob() {
  const interval = Number(process.env.CLEANUP_INTERVAL_MS ?? 60_000);

  setInterval(async () => {
    try {
      await cleanupExpired();
      await cleanupOrphanFiles();
    } catch (err) {
      console.error("Cleanup error:", err);
    }
  }, interval);
}

async function cleanupOrphanFiles() {
  if (!existsSync(filesDir)) return;

  const clips = await listAllWithFiles();
  const validPaths = new Set<string>();
  for (const clip of clips) {
    for (const file of getClipFiles(clip)) {
      validPaths.add(getClipFilePath(clip.slug, file.fileId));
    }
    if (clip.filePath) validPaths.add(clip.filePath);
  }

  const slugs = await readdir(filesDir).catch(() => [] as string[]);
  for (const slug of slugs) {
    const slugDir = join(filesDir, slug);
    const files = await readdir(slugDir).catch(() => [] as string[]);
    for (const file of files) {
      const fullPath = join(slugDir, file);
      if (!validPaths.has(fullPath)) {
        await unlink(fullPath).catch(() => {});
      }
    }
  }
}

export { deleteClip };
