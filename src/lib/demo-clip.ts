import { getClip, ensureClip, updateContent, updateSettings } from "../store/clips";

const DEMO_SLUG = "demo";
const DEMO_TTL = 604800; // 7 days — within setTimeout 32-bit limit

const DEMO_CONTENT = `Welcome to Clippy!

This is a sample clip so you can see how it works before creating your own.

Try editing this text — if you open this page on another device, changes sync instantly.

Features to explore in Settings:
• Set a TTL (15 min to 7 days)
• Add a PIN for sensitive content
• Enable burn-after-read or end-to-end encryption
• Attach files and images

When you are ready, head back to the homepage and create your own clip.`;

export async function seedDemoClip(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + DEMO_TTL;

  let clip = await getClip(DEMO_SLUG);

  if (!clip) {
    clip = await ensureClip(DEMO_SLUG, {
      burnOnRead: false,
      expiresAt,
    });
  } else {
    await updateSettings(DEMO_SLUG, { burnOnRead: false, expiresAt });
    clip = await getClip(DEMO_SLUG);
  }

  if (clip && !clip.content.trim()) {
    await updateContent(DEMO_SLUG, DEMO_CONTENT);
  }
}
