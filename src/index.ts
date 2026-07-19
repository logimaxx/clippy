import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { loadAssetManifest } from "./lib/assets";
import { runMigrations } from "./db/client";
import { startCleanupJob } from "./lib/cleanup";
import { startStatsSnapshotJob } from "./lib/stats-snapshot";
import { getAdminPath, isAdminEnabled } from "./lib/admin";
import { pages } from "./routes/pages";
import { staticPages } from "./routes/static";
import { seedDemoClip } from "./lib/demo-clip";
import { clipsApi } from "./routes/clips";
import { filesApi } from "./routes/files";
import { qr } from "./routes/qr";
import { auth } from "./routes/auth";
import { account } from "./routes/account";
import { admin } from "./routes/admin";
import { scheduleVersionSave } from "./store/versions";
import { validateProductionSecrets, securityHeaders } from "./lib/security-headers";
import { clipContentSchema } from "./lib/constants";
import { isUnlockedFromRequest } from "./lib/pin";
import * as rooms from "./ws/rooms";
import {
  ensureClip,
  schedulePersist,
  getClip,
} from "./store/clips";
import type { WsData } from "./ws/rooms";

validateProductionSecrets();

const port = Number(process.env.PORT ?? 3000);

runMigrations();
startCleanupJob();
startStatsSnapshotJob();
seedDemoClip().catch((err) => console.error("Demo clip seed failed:", err));

const manifest = loadAssetManifest();

const app = new Hono();

app.use("*", async (c, next) => {
  await next();
  for (const [key, value] of Object.entries(securityHeaders())) {
    c.res.headers.set(key, value);
  }
});

const corsOrigin = process.env.CORS_ORIGIN;
app.use("/api/*", async (c, next) => {
  if (corsOrigin) {
    c.header("Access-Control-Allow-Origin", corsOrigin);
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Clip-Pin");
  }
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
});

app.use("/assets/*", async (c, next) => {
  await next();
  if (c.res.status < 400) {
    const assetHash = loadAssetManifest().hash;
    c.res.headers.set(
      "Cache-Control",
      assetHash === "dev"
        ? "no-cache"
        : "public, max-age=31536000, immutable"
    );
  }
});

app.use("/assets/*", serveStatic({ root: "./dist" }));

app.use("*", async (c, next) => {
  await next();
  const ct = c.res.headers.get("content-type") ?? "";
  if (ct.includes("text/html")) {
    c.res.headers.set("Cache-Control", "no-cache");
  }
});

app.route("/", auth);
app.route("/", account);
if (isAdminEnabled()) {
  app.route(getAdminPath(), admin);
}
app.route("/", clipsApi);
app.route("/", filesApi);
app.route("/", qr);
app.route("/", staticPages);
app.route("/", pages);

const server = Bun.serve({
  port,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/ws/")) {
      const slug = url.pathname.slice(4);
      const clip = await getClip(slug);
      if (clip?.pinHash && !isUnlockedFromRequest(req, slug)) {
        return new Response("PIN required", { status: 401 });
      }
      if (server.upgrade(req, { data: { slug } })) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    return app.fetch(req, server);
  },
  websocket: {
    open(ws) {
      const { slug } = ws.data as WsData;
      rooms.joinRoom(slug, ws);
      rooms.broadcastStatus(slug);
    },
    async message(ws, message) {
      const { slug } = ws.data as WsData;
      try {
        const data = JSON.parse(String(message));
        if (data.type === "update" && typeof data.content === "string") {
          clipContentSchema.parse({ content: data.content });
          await ensureClip(slug);
          schedulePersist(slug, data.content);
          scheduleVersionSave(slug, () => data.content, null);
          rooms.broadcast(slug, { type: "update", content: data.content }, ws);
        } else if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
      }
    },
    close(ws) {
      const { slug } = ws.data as WsData;
      rooms.leaveRoom(slug, ws);
      rooms.broadcastStatus(slug);
    },
  },
});

console.log(`Webklip running on http://localhost:${server.port}`);
console.log(`Assets: /assets/${manifest.hash}/`);
