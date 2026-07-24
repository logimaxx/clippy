import { getClip, ensureClip, updateContent, updateSettings } from "../store/clips";
import { PUBLIC_CLIPS_CATALOG } from "./public-clips-catalog";

/** 30 days — refreshed on each seed so evergreen SEO clips stay listed. */
const PUBLIC_SEED_TTL = 30 * 24 * 60 * 60;

export async function seedPublicClips(opts: { verbose?: boolean } = {}): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + PUBLIC_SEED_TTL;
  let seeded = 0;

  for (const entry of PUBLIC_CLIPS_CATALOG) {
    const clip = await getClip(entry.slug);

    if (!clip) {
      await ensureClip(entry.slug, {
        burnOnRead: false,
        expiresAt,
        visibility: "public",
        language: entry.language,
        content: entry.content,
      });
    } else {
      await updateSettings(entry.slug, {
        burnOnRead: false,
        expiresAt,
        visibility: "public",
        pinHash: null,
        encrypted: false,
        maxViews: null,
        language: entry.language,
      });
      await updateContent(entry.slug, entry.content);
    }

    seeded += 1;
    if (opts.verbose) console.log(`Seeded public clip: /${entry.slug}`);
  }

  return seeded;
}
