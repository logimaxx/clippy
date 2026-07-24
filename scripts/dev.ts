import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import type { ServerWebSocket } from "bun";

const ROOT = join(import.meta.dir, "..");
const LIVE_RELOAD_PORT = Number(process.env.LIVE_RELOAD_PORT ?? 35729);

type ReloadMsg = { type: "reload" | "css" };

const clients = new Set<ServerWebSocket>();
const watchers: FSWatcher[] = [];

const lrServer = Bun.serve({
  port: LIVE_RELOAD_PORT,
  fetch(req, server) {
    if (server.upgrade(req)) return undefined;
    return new Response("webklip live reload\n", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
    },
    close(ws) {
      clients.delete(ws);
    },
    message() {},
  },
});

function broadcast(msg: ReloadMsg) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    try {
      ws.send(data);
    } catch {
      clients.delete(ws);
    }
  }
}

async function run(
  cmd: string[],
  env: Record<string, string> = {}
): Promise<boolean> {
  const proc = Bun.spawn(cmd, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  return code === 0;
}

async function buildAssets(): Promise<boolean> {
  console.log("[dev] rebuilding assets…");
  return run(["bun", "run", "scripts/build-assets.ts", "--dev"], {
    WEBKLIP_DEV: "1",
  });
}

async function buildStatic(): Promise<boolean> {
  console.log("[dev] rebuilding static pages…");
  return run(["bun", "run", "scripts/build-static.ts"], {
    WEBKLIP_DEV: "1",
  });
}

let assetsTimer: ReturnType<typeof setTimeout> | null = null;
let staticTimer: ReturnType<typeof setTimeout> | null = null;
let assetsPendingCssOnly = true;
let building = false;
let rebuildAssets = false;
let rebuildStatic = false;
let rebuildCssOnly = true;

function scheduleAssets(cssOnly: boolean) {
  assetsPendingCssOnly = assetsPendingCssOnly && cssOnly;
  if (assetsTimer) clearTimeout(assetsTimer);
  assetsTimer = setTimeout(() => {
    assetsTimer = null;
    const css = assetsPendingCssOnly;
    assetsPendingCssOnly = true;
    enqueue({ assets: true, static: false, cssOnly: css });
  }, 120);
}

function scheduleStatic() {
  if (staticTimer) clearTimeout(staticTimer);
  staticTimer = setTimeout(() => {
    staticTimer = null;
    enqueue({ assets: false, static: true, cssOnly: false });
  }, 120);
}

function enqueue(job: { assets: boolean; static: boolean; cssOnly: boolean }) {
  if (job.assets) {
    rebuildAssets = true;
    rebuildCssOnly = rebuildCssOnly && job.cssOnly;
  }
  if (job.static) {
    rebuildStatic = true;
    rebuildCssOnly = false;
  }
  void pump();
}

async function pump() {
  if (building) return;
  if (!rebuildAssets && !rebuildStatic) return;

  building = true;
  const doAssets = rebuildAssets;
  const doStatic = rebuildStatic;
  const cssOnly = rebuildCssOnly && doAssets && !doStatic;
  rebuildAssets = false;
  rebuildStatic = false;
  rebuildCssOnly = true;

  let ok = true;
  if (doAssets) ok = (await buildAssets()) && ok;
  if (doStatic) ok = (await buildStatic()) && ok;

  if (ok) {
    broadcast({ type: cssOnly ? "css" : "reload" });
    console.log(`[dev] live reload → ${cssOnly ? "css" : "full"}`);
  } else {
    console.error("[dev] rebuild failed; not reloading");
  }

  building = false;
  if (rebuildAssets || rebuildStatic) void pump();
}

function onWatchEvent(kind: "assets" | "static", filename: string | null) {
  if (!filename) return;
  if (filename.startsWith(".") || filename.includes("node_modules")) return;

  if (kind === "static") {
    scheduleStatic();
    return;
  }

  const cssOnly = /\.css$/i.test(filename);
  scheduleAssets(cssOnly);
}

function startWatchers() {
  const assetsDir = join(ROOT, "assets", "src");
  const staticDir = join(ROOT, "static");
  const manifest = join(ROOT, "assets", "manifest.template.json");

  watchers.push(
    watch(assetsDir, { recursive: true }, (_event, filename) => {
      onWatchEvent("assets", filename);
    })
  );
  watchers.push(
    watch(manifest, () => {
      scheduleAssets(false);
    })
  );
  watchers.push(
    watch(staticDir, { recursive: true }, (_event, filename) => {
      onWatchEvent("static", filename);
    })
  );
}

console.log("[dev] initial build…");
if (!(await buildAssets()) || !(await buildStatic())) {
  console.error("[dev] initial build failed");
  lrServer.stop();
  process.exit(1);
}

startWatchers();
console.log(`[dev] watching assets/src + static (live reload :${LIVE_RELOAD_PORT})`);

const child = Bun.spawn(["bun", "run", "--watch", "src/index.ts"], {
  cwd: ROOT,
  env: {
    ...process.env,
    WEBKLIP_DEV: "1",
    LIVE_RELOAD_PORT: String(LIVE_RELOAD_PORT),
  },
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

function shutdown(code = 0) {
  for (const w of watchers) w.close();
  try {
    child.kill();
  } catch {
    /* already exited */
  }
  lrServer.stop();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const exitCode = await child.exited;
shutdown(exitCode ?? 0);
