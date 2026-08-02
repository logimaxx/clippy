/** @jsxImportSource hono/jsx */
import type { ClipVersion } from "../../db/schema";
import { SectionTitle } from "./SettingHint";

interface VersionsPanelProps {
  slug: string;
  versions: ClipVersion[];
}

export function VersionsPanel({ slug, versions }: VersionsPanelProps) {
  return (
    <div id="versions-panel" class="versions-panel">
      <SectionTitle
        title="Versions"
        help="Auto-saved every 5 seconds while you edit. Restore an older snapshot anytime."
      />
      {versions.length === 0 ? (
        <p class="field-hint">No saved versions yet.</p>
      ) : (
        <ul class="version-list">
          {versions.map((v) => (
            <li>
              <span class="version-time">
                {new Date(v.createdAt * 1000).toLocaleString()}
              </span>
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                hx-post={`/${slug}/versions/${v.id}/restore`}
                hx-target="#clip-content"
                hx-swap="outerHTML"
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        hx-get={`/${slug}/versions`}
        hx-target="#versions-panel"
        hx-swap="outerHTML"
      >
        Refresh
      </button>
    </div>
  );
}
