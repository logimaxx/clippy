import { isAdminEnabled } from "./admin";
import { getLatestSnapshotTime, recordStatsSnapshot } from "../store/stats";

const SNAPSHOT_INTERVAL_MS = Number(process.env.ADMIN_SNAPSHOT_INTERVAL_MS ?? 3_600_000);

export async function maybeRecordStatsSnapshot(): Promise<void> {
  if (!isAdminEnabled()) return;

  const last = await getLatestSnapshotTime();
  const now = Date.now();
  if (last !== null && now - last * 1000 < SNAPSHOT_INTERVAL_MS) return;

  await recordStatsSnapshot();
}

export function startStatsSnapshotJob() {
  if (!isAdminEnabled()) return;

  const interval = Number(process.env.CLEANUP_INTERVAL_MS ?? 60_000);

  setInterval(() => {
    maybeRecordStatsSnapshot().catch((err) => {
      console.error("Stats snapshot error:", err);
    });
  }, interval);

  maybeRecordStatsSnapshot().catch((err) => {
    console.error("Initial stats snapshot error:", err);
  });
}
