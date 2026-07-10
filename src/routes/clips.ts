import { Hono } from "hono";
import { z } from "zod";
import { isValidSlug, isReservedSlug, clipContentSchema } from "../lib/constants";
import { getClientIp, rateLimit } from "../lib/rate-limit";
import { verifyPin } from "../lib/pin";
import { isLinkPreviewCrawler } from "../lib/crawler";
import {
  ensureClip,
  getClip,
  updateContent,
  deleteClip,
  createClip,
  recordView,
} from "../store/clips";

const CLIP_LIMIT = Number(process.env.RATE_LIMIT_CLIPS_PER_HOUR ?? 30);
const API_LIMIT = Number(process.env.RATE_LIMIT_API_PER_HOUR ?? 200);

const clipsApi = new Hono();

clipsApi.use("/api/*", async (c, next) => {
  const ip = getClientIp(c.req.raw.headers);
  const { allowed, remaining } = rateLimit(
    `api:${ip}`,
    API_LIMIT,
    60 * 60 * 1000
  );
  c.header("X-RateLimit-Remaining", String(remaining));
  if (!allowed) return c.json({ error: "Rate limit exceeded" }, 429);
  await next();
});

clipsApi.get("/api/health", (c) =>
  c.json({ status: "ok", version: "0.3.0" })
);

async function requirePin(
  c: { req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined } },
  pinHash: string | null
): Promise<boolean> {
  if (!pinHash) return true;
  const pin =
    c.req.header("X-Clip-Pin") ?? c.req.header("x-clip-pin") ?? c.req.query("pin");
  return verifyPin(pin, pinHash);
}

clipsApi.get("/api/v1/clips/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug)) return c.json({ error: "Invalid slug" }, 400);

  const clip = await getClip(slug);
  if (!clip) return c.json({ error: "Not found" }, 404);

  if (!(await requirePin(c, clip.pinHash))) {
    return c.json({ error: "PIN required", pinRequired: true }, 401);
  }

  if (isLinkPreviewCrawler(c.req.header("user-agent"))) {
    return c.json({
      slug: clip.slug,
      preview: true,
      message: "Open this link in a browser to view the clip.",
    });
  }

  const viewed = await recordView(slug);
  if (!viewed) return c.json({ error: "Not found" }, 404);

  const after = await getClip(slug);
  const burned = !after && (clip.burnOnRead || (clip.maxViews !== null && clip.maxViews > 0));

  if (burned) {
    return c.json({
      slug: clip.slug,
      content: clip.content,
      contentType: clip.contentType,
      burned: true,
      viewCount: viewed.viewCount,
    });
  }

  return c.json({
    slug: clip.slug,
    content: clip.content,
    contentType: clip.contentType,
    expiresAt: clip.expiresAt,
    burnOnRead: clip.burnOnRead,
    maxViews: clip.maxViews,
    viewCount: viewed.viewCount,
    webhookUrl: clip.webhookUrl,
  });
});

const createSchema = z.object({
  content: z.string().optional(),
  burnOnRead: z.boolean().optional(),
  maxViews: z.number().int().min(0).max(1000).optional(),
  pin: z.string().max(128).optional(),
  webhook: z.string().url().max(2048).optional().or(z.literal("")),
  ttl: z.number().int().positive().optional(),
});

clipsApi.post("/api/v1/clips/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug)) return c.json({ error: "Invalid slug" }, 400);
  if (isReservedSlug(slug)) return c.json({ error: "Reserved slug" }, 400);

  const ip = getClientIp(c.req.raw.headers);
  const { allowed } = rateLimit(`clip:${ip}`, CLIP_LIMIT, 60 * 60 * 1000);
  if (!allowed)
    return c.json({ error: "Clip creation rate limit exceeded" }, 429);

  const existing = await getClip(slug);
  if (existing) return c.json({ error: "Clip already exists" }, 409);

  const contentType = c.req.header("content-type") ?? "";
  let opts: z.infer<typeof createSchema> = {};

  if (contentType.includes("application/json")) {
    opts = createSchema.parse(await c.req.json());
    if (opts.content !== undefined) {
      clipContentSchema.parse({ content: opts.content });
    }
  } else {
    const text = await c.req.text();
    clipContentSchema.parse({ content: text });
    opts = { content: text };
  }

  const now = Math.floor(Date.now() / 1000);
  const { hashPin } = await import("../lib/pin");

  const burnOnRead =
    opts.burnOnRead ?? (opts.ttl !== undefined ? false : undefined);

  const clip = await createClip(slug, {
    content: opts.content ?? "",
    burnOnRead,
    maxViews: opts.maxViews === 0 ? null : opts.maxViews,
    pinHash: opts.pin ? await hashPin(opts.pin) : null,
    webhookUrl: opts.webhook || null,
    expiresAt: opts.ttl ? now + opts.ttl : undefined,
  });

  return c.json(
    {
      slug: clip.slug,
      content: clip.content,
      maxViews: clip.maxViews,
      webhookUrl: clip.webhookUrl,
      pinSet: !!clip.pinHash,
    },
    201
  );
});

clipsApi.put("/api/v1/clips/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug)) return c.json({ error: "Invalid slug" }, 400);

  const clip = await getClip(slug);
  if (clip && !(await requirePin(c, clip.pinHash))) {
    return c.json({ error: "PIN required", pinRequired: true }, 401);
  }

  const contentType = c.req.header("content-type") ?? "";
  let content = "";

  if (contentType.includes("application/json")) {
    const body = await c.req.json();
    content = clipContentSchema.parse(body).content;
  } else {
    content = clipContentSchema.parse({ content: await c.req.text() }).content;
  }

  await ensureClip(slug);
  await updateContent(slug, content);
  return c.json({ slug, content });
});

clipsApi.delete("/api/v1/clips/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug)) return c.json({ error: "Invalid slug" }, 400);

  const clip = await getClip(slug);
  if (clip && !(await requirePin(c, clip.pinHash))) {
    return c.json({ error: "PIN required", pinRequired: true }, 401);
  }

  await deleteClip(slug);
  return c.json({ ok: true });
});

export { clipsApi };
