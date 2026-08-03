import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";

const dataDir = mkdtempSync(join(tmpdir(), "webklip-rename-"));
process.env.DATA_DIR = dataDir;

const { db, runMigrations } = await import("../db/client");
const { clips, clipVersions } = await import("../db/schema");
const {
  createClip,
  getClip,
  getClipFilePath,
  renameClip,
  resolveRenameSlug,
} = await import("./clips");
const { saveVersion, listVersions } = await import("./versions");
const { getFilesDir } = await import("../lib/cleanup");

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("resolveRenameSlug", () => {
  test("keeps simple slugs simple", () => {
    expect(resolveRenameSlug("old-name", "new-name")).toBe("new-name");
    expect(resolveRenameSlug("old-name", "ab")).toBeNull();
    expect(resolveRenameSlug("old-name", "team/clip")).toBeNull();
    expect(resolveRenameSlug("old-name", "account")).toBeNull();
  });

  test("keeps vanity clips under the same team", () => {
    expect(resolveRenameSlug("acme/notes", "docs")).toBe("acme/docs");
    expect(resolveRenameSlug("acme/notes", "acme/docs")).toBe("acme/docs");
    expect(resolveRenameSlug("acme/notes", "other/docs")).toBeNull();
    expect(resolveRenameSlug("acme/notes", "settings")).toBeNull();
  });
});

describe("renameClip", () => {
  test("renames slug, versions, and attachment directory", async () => {
    const oldSlug = `rename-src-${Date.now()}`;
    const newSlug = `rename-dst-${Date.now()}`;
    await createClip(oldSlug, { content: "hello rename" });
    await saveVersion(oldSlug, "hello rename", null);

    const fileId = crypto.randomUUID();
    const oldPath = getClipFilePath(oldSlug, fileId);
    mkdirSync(join(getFilesDir(), oldSlug), { recursive: true });
    writeFileSync(oldPath, "file-bytes");
    await db
      .update(clips)
      .set({
        filePath: oldPath,
        metadata: JSON.stringify({
          files: [{ fileId, filename: "a.txt", size: 10, mimeType: "text/plain" }],
        }),
      })
      .where(eq(clips.slug, oldSlug));

    const result = await renameClip(oldSlug, newSlug);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.clip.slug).toBe(newSlug);
    expect(await getClip(oldSlug)).toBeNull();
    expect((await getClip(newSlug))?.content).toContain("hello rename");

    const versions = await listVersions(newSlug);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.clipSlug).toBe(newSlug);

    const stale = await db
      .select()
      .from(clipVersions)
      .where(eq(clipVersions.clipSlug, oldSlug));
    expect(stale).toHaveLength(0);

    expect(existsSync(join(getFilesDir(), oldSlug))).toBe(false);
    expect(existsSync(getClipFilePath(newSlug, fileId))).toBe(true);
  });

  test("rejects taken and invalid targets", async () => {
    const a = `rename-a-${Date.now()}`;
    const b = `rename-b-${Date.now()}`;
    await createClip(a, { content: "a" });
    await createClip(b, { content: "b" });

    expect(await renameClip(a, b)).toEqual({ ok: false, error: "taken" });
    expect(await renameClip(a, "no")).toEqual({ ok: false, error: "invalid" });
    expect(await renameClip(a, a)).toEqual({ ok: false, error: "same" });
  });
});
