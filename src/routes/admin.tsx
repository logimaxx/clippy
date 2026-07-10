/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { adminBasicAuth, getAdminPath, isAdminEnabled } from "../lib/admin";
import { computeClipStats, getStatsHistory } from "../store/stats";
import { AdminPage } from "../views/Admin";

const admin = new Hono();

admin.use("*", async (c, next) => {
  if (!isAdminEnabled()) return c.text("Not found", 404);
  await next();
});

admin.use("*", adminBasicAuth());

admin.get("/", async (c) => {
  const [stats, history] = await Promise.all([
    computeClipStats(),
    getStatsHistory(30 * 86_400),
  ]);
  return c.html(<AdminPage stats={stats} history={history} adminPath={getAdminPath()} />);
});

admin.get("/api/stats", async (c) => {
  const stats = await computeClipStats();
  return c.json(stats);
});

admin.get("/api/history", async (c) => {
  const days = Number(c.req.query("days") ?? 30);
  const since = Math.min(Math.max(days, 1), 365) * 86_400;
  const history = await getStatsHistory(since);
  return c.json({ history });
});

export { admin };
