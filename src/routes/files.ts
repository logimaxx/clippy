import { Hono } from "hono";
import { mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Context } from "hono";
import { getFilesDir } from "../lib/cleanup";
import { MAX_FILES_PER_CLIP } from "../lib/constants";
import {
  ensureClip,
  getClip,
  getClipFresh,
  getClipFilePath,
  getClipFiles,
  type ClipFileMeta,
} from "../store/clips";
import { isUnlocked, verifyPin } from "../lib/pin";
import * as memory from "../store/memory";

const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE_MB ?? 10) * 1024 * 1024;
const MAX_TOTAL_FILES_SIZE =
  Number(process.env.MAX_TOTAL_FILES_MB ?? 50) * 1024 * 1024;

/** Serialize uploads per clip so quota checks can't race. */
const uploadLocks = new Map<string, Promise<unknown>>();

function withUploadLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  const prev = uploadLocks.get(slug) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  uploadLocks.set(
    slug,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

async function getOnDiskAttachmentBytes(slug: string): Promise<number> {
  const dir = join(getFilesDir(), slug);
  if (!existsSync(dir)) return 0;
  const entries = await readdir(dir);
  let total = 0;
  for (const name of entries) {
    total += Bun.file(join(dir, name)).size;
  }
  return total;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isImageMime(mime: string) {
  return mime.startsWith("image/");
}

export function renderAttachmentHtml(
  slug: string,
  file: Pick<ClipFileMeta, "fileId" | "filename" | "size" | "mimeType">
) {
  const fileUrl = `/api/v1/files/${slug}/${file.fileId}`;
  const name = escapeHtml(file.filename);
  const isImage = isImageMime(file.mimeType);
  const preview = isImage
    ? `<a href="${fileUrl}" target="_blank" rel="noopener"><img src="${fileUrl}" alt="${name}" class="file-preview-image" /></a>`
    : `<p class="file-meta"><strong>${name}</strong> (${Math.max(1, Math.round(file.size / 1024))} KB)</p>`;

  return (
    `<div class="file-attachment" data-file-id="${escapeHtml(file.fileId)}">` +
    `${preview}` +
    `<div class="file-attachment-actions">` +
    `<a href="${fileUrl}" class="btn btn-ghost btn-sm" download="${name}">Download</a>` +
    `<button type="button" class="btn btn-ghost btn-sm btn-danger file-delete-btn" data-delete-url="/${escapeHtml(slug)}/files/${escapeHtml(file.fileId)}" aria-label="Remove ${name}">Remove</button>` +
    `</div></div>`
  );
}

export type AttachFileResult =
  | {
      ok: true;
      file: ClipFileMeta;
      fileCount: number;
      fileUrl: string;
      isImage: boolean;
      wasEmpty: boolean;
    }
  | { ok: false; error: string };

/** Attach one file to an existing (or newly ensured) clip. */
export async function attachFileToClip(
  slug: string,
  file: File
): Promise<AttachFileResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = bytes.byteLength;

  if (size === 0) {
    return { ok: false, error: "Empty file" };
  }

  if (size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
    };
  }

  return withUploadLock(slug, async () => {
    await ensureClip(slug);
    // Fresh DB read — memory cache can lag behind concurrent uploads.
    const clip = await getClipFresh(slug);
    const existing = clip ? getClipFiles(clip) : [];

    if (existing.length >= MAX_FILES_PER_CLIP) {
      return {
        ok: false,
        error: `Maximum ${MAX_FILES_PER_CLIP} files per clip`,
      };
    }

    // Disk is source of truth (metadata can be stale/racy under concurrency).
    const existingTotal = await getOnDiskAttachmentBytes(slug);
    if (existingTotal + size > MAX_TOTAL_FILES_SIZE) {
      const maxMb = MAX_TOTAL_FILES_SIZE / 1024 / 1024;
      return {
        ok: false,
        error: `Total attachments too large (max ${maxMb}MB)`,
      };
    }

    const id = crypto.randomUUID();
    const dir = join(getFilesDir(), slug);
    await mkdir(dir, { recursive: true });

    const filePath = getClipFilePath(slug, id);
    await Bun.write(filePath, bytes);

    const mimeType = file.type || "application/octet-stream";
    const newFile: ClipFileMeta = {
      fileId: id,
      filename: file.name,
      size,
      mimeType,
    };
    const files = [...existing, newFile];
    const contentType = files.some((f) => isImageMime(f.mimeType))
      ? "image"
      : "file";

    const { db } = await import("../db/client");
    const { clips } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");

    await db
      .update(clips)
      .set({
        filePath,
        contentType,
        metadata: JSON.stringify({ files }),
      })
      .where(eq(clips.slug, slug));

    memory.deleteCached(slug);

    return {
      ok: true,
      file: newFile,
      fileCount: files.length,
      fileUrl: `/api/v1/files/${slug}/${id}`,
      isImage: isImageMime(mimeType),
      wasEmpty: existing.length === 0,
    };
  });
}

export async function handleUpload(c: Context, slug: string) {
  const wantsJson = c.req.header("Accept")?.includes("application/json");

  const body = await c.req.parseBody();
  const file = body.file;

  if (!file || !(file instanceof File)) {
    if (wantsJson) return c.json({ ok: false, error: "No file selected" }, 400);
    return c.html('<span class="error">No file selected</span>');
  }

  const result = await attachFileToClip(slug, file);
  if (!result.ok) {
    if (wantsJson) return c.json({ ok: false, error: result.error }, 400);
    return c.html(`<span class="error">${escapeHtml(result.error)}</span>`);
  }

  const statusHtml = `<span class="success">Uploaded <strong>${escapeHtml(result.file.filename)}</strong></span>`;

  if (wantsJson) {
    return c.json({
      ok: true,
      slug,
      fileId: result.file.fileId,
      filename: result.file.filename,
      size: result.file.size,
      mimeType: result.file.mimeType,
      isImage: result.isImage,
      url: result.fileUrl,
      fileCount: result.fileCount,
    });
  }

  if (c.req.header("HX-Request")) {
    const attachmentHtml = renderAttachmentHtml(slug, result.file);
    const emptyOob = result.wasEmpty
      ? `<div id="clip-files-empty" hx-swap-oob="delete"></div>`
      : "";
    return c.html(
      statusHtml +
        emptyOob +
        `<div hx-swap-oob="beforeend:#clip-files-list">${attachmentHtml}</div>`
    );
  }

  return c.html(statusHtml);
}

export async function handleDelete(c: Context, slug: string, fileId: string) {
  const wantsJson = c.req.header("Accept")?.includes("application/json");

  const clip = await getClip(slug);
  if (!clip) {
    if (wantsJson) return c.json({ ok: false, error: "Not found" }, 404);
    return c.html('<span class="error">Not found</span>', 404);
  }

  const files = getClipFiles(clip);
  const fileMeta = files.find((f) => f.fileId === fileId);
  if (!fileMeta) {
    if (wantsJson) return c.json({ ok: false, error: "File not found" }, 404);
    return c.html('<span class="error">File not found</span>', 404);
  }

  const filePath = getClipFilePath(slug, fileId);
  if (existsSync(filePath)) {
    await unlink(filePath).catch(() => {});
  }

  const remaining = files.filter((f) => f.fileId !== fileId);
  const lastFile = remaining[remaining.length - 1];

  const { db } = await import("../db/client");
  const { clips } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");

  await db
    .update(clips)
    .set({
      metadata: remaining.length ? JSON.stringify({ files: remaining }) : null,
      filePath: lastFile ? getClipFilePath(slug, lastFile.fileId) : null,
      contentType: remaining.length
        ? remaining.some((f) => isImageMime(f.mimeType))
          ? "image"
          : "file"
        : "text",
    })
    .where(eq(clips.slug, slug));

  memory.deleteCached(slug);

  if (wantsJson) {
    return c.json({ ok: true, fileId, fileCount: remaining.length });
  }

  if (c.req.header("HX-Request")) {
    const emptyHtml =
      remaining.length === 0
        ? `<div id="clip-files-empty" class="file-attachment-empty" hx-swap-oob="beforeend:#clip-files-list"><p class="field-hint">No files attached yet.</p></div>`
        : "";
    return c.html(
      `<div class="file-attachment" data-file-id="${escapeHtml(fileId)}" hx-swap-oob="delete"></div>` +
        emptyHtml
    );
  }

  return c.body(null, 204);
}

const filesApi = new Hono();

filesApi.get("/api/v1/files/:slug/:id", async (c) => {
  const { slug, id } = c.req.param();
  const clip = await getClip(slug);
  if (!clip) return c.text("Not found", 404);

  const files = getClipFiles(clip);
  const fileMeta = files.find((f) => f.fileId === id);
  if (!fileMeta) return c.text("Not found", 404);

  const filePath = getClipFilePath(slug, id);
  if (!existsSync(filePath)) return c.text("Not found", 404);

  if (clip.pinHash) {
    const pin =
      c.req.header("X-Clip-Pin") ??
      c.req.header("x-clip-pin") ??
      c.req.query("pin");
    const pinOk = (await verifyPin(pin, clip.pinHash)) || isUnlocked(c, slug);
    if (!pinOk) return c.text("PIN required", 401);
  }

  const file = Bun.file(filePath);
  const filename = fileMeta.filename ?? id;
  const mimeType = fileMeta.mimeType ?? "application/octet-stream";

  return new Response(file, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});

export { filesApi };
