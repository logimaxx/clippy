/** @jsxImportSource hono/jsx */
import { DocFileIcon, DownloadIcon, ImageFileIcon, PreviewIcon } from "./ClipIcons";

interface FileAttachmentProps {
  slug: string;
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  compact?: boolean;
  readOnly?: boolean;
}

function formatSizeKb(size: number) {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** MIME types / extensions the browser can show in a preview modal. */
export function isPreviewableFile(mimeType: string, filename = ""): boolean {
  const mime = (mimeType || "").toLowerCase();
  if (
    mime.startsWith("image/") ||
    mime.startsWith("video/") ||
    mime.startsWith("audio/") ||
    mime.startsWith("text/") ||
    mime === "application/pdf" ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/xhtml+xml" ||
    mime === "application/yaml" ||
    mime === "application/x-yaml" ||
    mime === "application/toml" ||
    mime === "application/sql"
  ) {
    return true;
  }

  const ext = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase()
    : "";
  return [
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "bmp",
    "ico",
    "avif",
    "pdf",
    "txt",
    "md",
    "markdown",
    "csv",
    "tsv",
    "json",
    "xml",
    "html",
    "htm",
    "css",
    "js",
    "mjs",
    "cjs",
    "ts",
    "tsx",
    "jsx",
    "yaml",
    "yml",
    "toml",
    "sql",
    "log",
    "mp4",
    "webm",
    "ogg",
    "mp3",
    "wav",
    "m4a",
  ].includes(ext);
}

export function FileAttachment({
  slug,
  fileId,
  filename,
  mimeType,
  size,
  compact = false,
  readOnly = false,
}: FileAttachmentProps) {
  const url = `/api/v1/files/${slug}/${fileId}`;
  const isImage = mimeType.startsWith("image/");
  const canPreview = isPreviewableFile(mimeType, filename);

  return (
    <div
      class="file-card file-attachment"
      data-file-id={fileId}
      data-file-url={url}
      data-file-name={filename}
      data-file-mime={mimeType}
      data-file-size={String(size)}
      data-previewable={canPreview ? "true" : undefined}
    >
      {isImage ? (
        <div class="file-card__icon" aria-hidden="true">
          <ImageFileIcon />
        </div>
      ) : (
        <div class="file-card__icon" aria-hidden="true">
          <DocFileIcon />
        </div>
      )}
      <div class="file-card__info">
        {canPreview ? (
          <button
            type="button"
            class="file-card__name file-card__name--preview"
            data-preview-file
            aria-label={`Preview ${filename}`}
          >
            {filename}
          </button>
        ) : (
          <div class="file-card__name">{filename}</div>
        )}
        <div class="file-card__meta">
          {compact ? formatSizeKb(size) : `${formatSizeKb(size)} · ${mimeType}`}
        </div>
      </div>
      {canPreview && (
        <button
          type="button"
          class="btn btn--ghost btn--icon btn--sm"
          data-preview-file
          aria-label={`Preview ${filename}`}
        >
          <PreviewIcon />
        </button>
      )}
      <a
        href={url}
        class="btn btn--ghost btn--icon btn--sm"
        download={filename}
        aria-label={`Download ${filename}`}
      >
        <DownloadIcon />
      </a>
      {!readOnly && (
        <button
          type="button"
          class="btn btn--ghost btn--icon btn--sm file-delete-btn"
          data-delete-url={`/${slug}/files/${fileId}`}
          aria-label={`Remove ${filename}`}
        >
          ×
        </button>
      )}
    </div>
  );
}
