/** SEO helpers for public clip pages and crawler previews. */

export function humanizeSlug(slug: string): string {
  const base = slug.includes("/") ? (slug.split("/").pop() ?? slug) : slug;
  return base
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function clipMetaDescription(content: string, maxLen = 160): string {
  const text = content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[`*_>~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Public clipboard on Webklip.";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trimEnd()}…`;
}

export function clipSeoMeta(slug: string, content: string) {
  const title = `${humanizeSlug(slug)} — Webklip`;
  const description = clipMetaDescription(content);
  return {
    title,
    description,
    ogTitle: title,
    ogDescription: description,
  };
}
