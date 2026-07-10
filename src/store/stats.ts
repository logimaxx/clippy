import { gte, desc } from "drizzle-orm";
import { db } from "../db/client";
import { clips, statsSnapshots } from "../db/schema";

export interface ClipStatsBreakdown {
  burnOnRead: { true: number; false: number };
  maxViews: { none: number; one: number; many: number };
  ttl: { none: number; set: number };
  pin: { set: number; none: number };
  encrypted: { true: number; false: number };
  contentType: Record<string, number>;
  attachments: { yes: number; no: number };
  ownership: { anonymous: number; authenticated: number };
  team: { none: number; set: number };
}

export interface ClipStats {
  total: number;
  createdLast24h: number;
  createdLast7d: number;
  breakdown: ClipStatsBreakdown;
  recordedAt: number;
}

type ClipRow = {
  burnOnRead: boolean;
  maxViews: number | null;
  expiresAt: number | null;
  pinHash: string | null;
  encrypted: boolean;
  contentType: string;
  filePath: string | null;
  metadata: string | null;
  ownerId: string | null;
  teamId: string | null;
  createdAt: number;
};

function emptyBreakdown(): ClipStatsBreakdown {
  return {
    burnOnRead: { true: 0, false: 0 },
    maxViews: { none: 0, one: 0, many: 0 },
    ttl: { none: 0, set: 0 },
    pin: { set: 0, none: 0 },
    encrypted: { true: 0, false: 0 },
    contentType: {},
    attachments: { yes: 0, no: 0 },
    ownership: { anonymous: 0, authenticated: 0 },
    team: { none: 0, set: 0 },
  };
}

function hasAttachments(row: Pick<ClipRow, "filePath" | "metadata">): boolean {
  if (row.filePath) return true;
  if (!row.metadata) return false;
  try {
    const meta = JSON.parse(row.metadata) as {
      files?: unknown[];
      fileId?: string;
      filename?: string;
    };
    if (Array.isArray(meta.files) && meta.files.length > 0) return true;
    return Boolean(meta.fileId || meta.filename);
  } catch {
    return false;
  }
}

function accumulateBreakdown(rows: ClipRow[]): ClipStatsBreakdown {
  const breakdown = emptyBreakdown();

  for (const row of rows) {
    if (row.burnOnRead) breakdown.burnOnRead.true += 1;
    else breakdown.burnOnRead.false += 1;

    if (row.maxViews === null) breakdown.maxViews.none += 1;
    else if (row.maxViews === 1) breakdown.maxViews.one += 1;
    else breakdown.maxViews.many += 1;

    if (row.expiresAt === null) breakdown.ttl.none += 1;
    else breakdown.ttl.set += 1;

    if (row.pinHash) breakdown.pin.set += 1;
    else breakdown.pin.none += 1;

    if (row.encrypted) breakdown.encrypted.true += 1;
    else breakdown.encrypted.false += 1;

    const type = row.contentType || "text";
    breakdown.contentType[type] = (breakdown.contentType[type] ?? 0) + 1;

    if (hasAttachments(row)) breakdown.attachments.yes += 1;
    else breakdown.attachments.no += 1;

    if (row.ownerId) breakdown.ownership.authenticated += 1;
    else breakdown.ownership.anonymous += 1;

    if (row.teamId) breakdown.team.set += 1;
    else breakdown.team.none += 1;
  }

  return breakdown;
}

export async function computeClipStats(): Promise<ClipStats> {
  const now = Math.floor(Date.now() / 1000);
  const rows = await db
    .select({
      burnOnRead: clips.burnOnRead,
      maxViews: clips.maxViews,
      expiresAt: clips.expiresAt,
      pinHash: clips.pinHash,
      encrypted: clips.encrypted,
      contentType: clips.contentType,
      filePath: clips.filePath,
      metadata: clips.metadata,
      ownerId: clips.ownerId,
      teamId: clips.teamId,
      createdAt: clips.createdAt,
    })
    .from(clips);

  let createdLast24h = 0;
  let createdLast7d = 0;
  for (const row of rows) {
    const age = now - row.createdAt;
    if (age <= 86_400) createdLast24h += 1;
    if (age <= 604_800) createdLast7d += 1;
  }

  return {
    total: rows.length,
    createdLast24h,
    createdLast7d,
    breakdown: accumulateBreakdown(rows),
    recordedAt: now,
  };
}

export async function recordStatsSnapshot(): Promise<ClipStats> {
  const stats = await computeClipStats();
  await db.insert(statsSnapshots).values({
    recordedAt: stats.recordedAt,
    totalActive: stats.total,
    breakdown: JSON.stringify(stats.breakdown),
  });
  return stats;
}

export async function getStatsHistory(sinceSeconds: number): Promise<
  { recordedAt: number; totalActive: number; breakdown: ClipStatsBreakdown }[]
> {
  const since = Math.floor(Date.now() / 1000) - sinceSeconds;
  const rows = await db
    .select()
    .from(statsSnapshots)
    .where(gte(statsSnapshots.recordedAt, since))
    .orderBy(statsSnapshots.recordedAt);

  return rows.map((row) => ({
    recordedAt: row.recordedAt,
    totalActive: row.totalActive,
    breakdown: JSON.parse(row.breakdown) as ClipStatsBreakdown,
  }));
}

export async function getLatestSnapshotTime(): Promise<number | null> {
  const rows = await db
    .select({ recordedAt: statsSnapshots.recordedAt })
    .from(statsSnapshots)
    .orderBy(desc(statsSnapshots.recordedAt))
    .limit(1);
  return rows[0]?.recordedAt ?? null;
}
