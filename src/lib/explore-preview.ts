import type { Clip } from "../db/schema";

export function clipPreviewText(content: string, maxLen = 140): string {
  const line = content.replace(/\s+/g, " ").trim();
  if (!line) return "Empty clip";
  return line.length > maxLen ? `${line.slice(0, maxLen - 3)}…` : line;
}

export function formatClipDate(createdAt: number): string {
  return new Date(createdAt * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain HTML fragment for the homepage Explore teaser (no Layout). */
export function renderExplorePreviewHtml(clips: Clip[]): string {
  if (clips.length === 0) {
    return `<p class="explore-home-empty">No public clips yet. <a href="/explore">Open Explore</a> or turn on Public in a clip’s settings.</p>`;
  }

  const items = clips
    .map((clip) => {
      const slug = escapeHtml(clip.slug);
      const preview = escapeHtml(clipPreviewText(clip.content, 120));
      const date = escapeHtml(formatClipDate(clip.createdAt));
      return `<li class="explore-home-item">
  <a href="/${slug}" class="explore-home-link">
    <span class="explore-home-slug">${slug}</span>
    <span class="explore-home-snippet">${preview}</span>
    <span class="explore-home-meta">${date}</span>
  </a>
</li>`;
    })
    .join("\n");

  return `<ul class="explore-home-list">${items}</ul>`;
}
