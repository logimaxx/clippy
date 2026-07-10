/** @jsxImportSource hono/jsx */
import { DocFileIcon, DownloadIcon, ImageFileIcon } from "./ClipIcons";

interface FileAttachmentProps {
  slug: string;
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  compact?: boolean;
}

function formatSizeKb(size: number) {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function FileAttachment({
  slug,
  fileId,
  filename,
  mimeType,
  size,
  compact = false,
}: FileAttachmentProps) {
  const url = `/api/v1/files/${slug}/${fileId}`;
  const isImage = mimeType.startsWith("image/");

  return (
    <div class="file-card file-attachment" data-file-id={fileId}>
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
        <div class="file-card__name">{filename}</div>
        <div class="file-card__meta">
          {compact ? formatSizeKb(size) : `${formatSizeKb(size)} · ${mimeType}`}
        </div>
      </div>
      <a
        href={url}
        class="btn btn--ghost btn--icon btn--sm"
        download={filename}
        aria-label={`Download ${filename}`}
      >
        <DownloadIcon />
      </a>
      <button
        type="button"
        class="btn btn--ghost btn--icon btn--sm file-delete-btn"
        data-delete-url={`/${slug}/files/${fileId}`}
        aria-label={`Remove ${filename}`}
      >
        ×
      </button>
    </div>
  );
}
