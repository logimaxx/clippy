import { count, countDistinct, gte, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  apiKeys,
  clips,
  oauthAccounts,
  statsSnapshots,
  teamInvites,
  teamMembers,
  teams,
  users,
} from "../db/schema";
import {
  emptyApiUsage,
  peekApiUsage,
  takeApiUsageSnapshot,
  type ApiUsageStats,
} from "../lib/api-usage";

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
  /** Mutually exclusive audiences, unlike the ownership/team dimensions above. */
  audience: { anonymous: number; personal: number; team: number };
}

export interface AccountStats {
  total: number;
  verified: number;
  unverified: number;
  createdLast24h: number;
  createdLast7d: number;
  withPassword: number;
  withOauth: number;
  withApiKey: number;
  inTeam: number;
}

export interface TeamClipStats {
  total: number;
  averagePerTeam: number;
  largestTeam: number;
  teamsWithClips: number;
  teamsWithoutClips: number;
  /** Teams bucketed by how many clips they hold. */
  distribution: { none: number; few: number; some: number; many: number };
}

export interface TeamStats {
  total: number;
  createdLast24h: number;
  createdLast7d: number;
  memberships: number;
  pendingInvites: number;
  averageMembers: number;
  largestMembers: number;
  memberSizes: { solo: number; small: number; medium: number; large: number };
  clips: TeamClipStats;
}

export interface ClipStats {
  total: number;
  createdLast24h: number;
  createdLast7d: number;
  breakdown: ClipStatsBreakdown;
  accounts: AccountStats;
  teams: TeamStats;
  apiUsage: ApiUsageStats;
  apiRequestsLast24h: number;
  recordedAt: number;
}

export interface StatsHistoryPoint {
  recordedAt: number;
  totalActive: number;
  breakdown: ClipStatsBreakdown;
  accounts: AccountStats;
  teams: TeamStats;
  apiUsage: ApiUsageStats;
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

type SnapshotPayload = {
  v: 2 | 3;
  clips: ClipStatsBreakdown;
  apiUsage: ApiUsageStats;
  /** Absent in v2 snapshots recorded before accounts and teams were tracked. */
  accounts?: AccountStats;
  teams?: TeamStats;
};

type SnapshotFields = {
  breakdown: ClipStatsBreakdown;
  accounts: AccountStats;
  teams: TeamStats;
  apiUsage: ApiUsageStats;
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
    audience: { anonymous: 0, personal: 0, team: 0 },
  };
}

export function emptyAccountStats(): AccountStats {
  return {
    total: 0,
    verified: 0,
    unverified: 0,
    createdLast24h: 0,
    createdLast7d: 0,
    withPassword: 0,
    withOauth: 0,
    withApiKey: 0,
    inTeam: 0,
  };
}

export function emptyTeamStats(): TeamStats {
  return {
    total: 0,
    createdLast24h: 0,
    createdLast7d: 0,
    memberships: 0,
    pendingInvites: 0,
    averageMembers: 0,
    largestMembers: 0,
    memberSizes: { solo: 0, small: 0, medium: 0, large: 0 },
    clips: {
      total: 0,
      averagePerTeam: 0,
      largestTeam: 0,
      teamsWithClips: 0,
      teamsWithoutClips: 0,
      distribution: { none: 0, few: 0, some: 0, many: 0 },
    },
  };
}

/** Older snapshots lack newer keys, so fill them in rather than render undefined. */
function normalizeBreakdown(raw: Partial<ClipStatsBreakdown> | null): ClipStatsBreakdown {
  const empty = emptyBreakdown();
  if (!raw || typeof raw !== "object") return empty;
  return {
    burnOnRead: raw.burnOnRead ?? empty.burnOnRead,
    maxViews: raw.maxViews ?? empty.maxViews,
    ttl: raw.ttl ?? empty.ttl,
    pin: raw.pin ?? empty.pin,
    encrypted: raw.encrypted ?? empty.encrypted,
    contentType: raw.contentType ?? empty.contentType,
    attachments: raw.attachments ?? empty.attachments,
    ownership: raw.ownership ?? empty.ownership,
    team: raw.team ?? empty.team,
    audience: raw.audience ?? {
      anonymous: raw.ownership?.anonymous ?? 0,
      personal: Math.max((raw.ownership?.authenticated ?? 0) - (raw.team?.set ?? 0), 0),
      team: raw.team?.set ?? 0,
    },
  };
}

function serializeSnapshotPayload(
  breakdown: ClipStatsBreakdown,
  accounts: AccountStats,
  teamStats: TeamStats,
  apiUsage: ApiUsageStats
): string {
  const payload: SnapshotPayload = {
    v: 3,
    clips: breakdown,
    accounts,
    teams: teamStats,
    apiUsage,
  };
  return JSON.stringify(payload);
}

function parseSnapshotPayload(raw: string): SnapshotFields {
  try {
    const parsed = JSON.parse(raw) as SnapshotPayload | ClipStatsBreakdown;
    if (parsed && typeof parsed === "object" && "v" in parsed && parsed.clips) {
      return {
        breakdown: normalizeBreakdown(parsed.clips),
        accounts: parsed.accounts ?? emptyAccountStats(),
        teams: parsed.teams ?? emptyTeamStats(),
        apiUsage: parsed.apiUsage ?? emptyApiUsage(),
      };
    }
    return {
      breakdown: normalizeBreakdown(parsed as ClipStatsBreakdown),
      accounts: emptyAccountStats(),
      teams: emptyTeamStats(),
      apiUsage: emptyApiUsage(),
    };
  } catch {
    return {
      breakdown: emptyBreakdown(),
      accounts: emptyAccountStats(),
      teams: emptyTeamStats(),
      apiUsage: emptyApiUsage(),
    };
  }
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

    if (row.teamId) breakdown.audience.team += 1;
    else if (row.ownerId) breakdown.audience.personal += 1;
    else breakdown.audience.anonymous += 1;
  }

  return breakdown;
}

function countClipsPerTeam(rows: ClipRow[]): Map<string, number> {
  const perTeam = new Map<string, number>();
  for (const row of rows) {
    if (!row.teamId) continue;
    perTeam.set(row.teamId, (perTeam.get(row.teamId) ?? 0) + 1);
  }
  return perTeam;
}

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

async function computeAccountStats(now: number): Promise<AccountStats> {
  const [aggregate] = await db
    .select({
      total: count(),
      verified: sql<number>`sum(case when ${users.emailVerifiedAt} is not null then 1 else 0 end)`,
      withPassword: sql<number>`sum(case when ${users.passwordHash} is not null then 1 else 0 end)`,
      createdLast24h: sql<number>`sum(case when ${users.createdAt} >= ${now - 86_400} then 1 else 0 end)`,
      createdLast7d: sql<number>`sum(case when ${users.createdAt} >= ${now - 604_800} then 1 else 0 end)`,
    })
    .from(users);

  const [[oauth], [withKeys], [inTeams]] = await Promise.all([
    db.select({ value: countDistinct(oauthAccounts.userId) }).from(oauthAccounts),
    db.select({ value: countDistinct(apiKeys.userId) }).from(apiKeys),
    db.select({ value: countDistinct(teamMembers.userId) }).from(teamMembers),
  ]);

  const total = aggregate?.total ?? 0;
  const verified = Number(aggregate?.verified ?? 0);

  return {
    total,
    verified,
    unverified: total - verified,
    createdLast24h: Number(aggregate?.createdLast24h ?? 0),
    createdLast7d: Number(aggregate?.createdLast7d ?? 0),
    withPassword: Number(aggregate?.withPassword ?? 0),
    withOauth: oauth?.value ?? 0,
    withApiKey: withKeys?.value ?? 0,
    inTeam: inTeams?.value ?? 0,
  };
}

async function computeTeamStats(
  now: number,
  clipsPerTeam: Map<string, number>
): Promise<TeamStats> {
  const [teamRows, memberRows, [invites]] = await Promise.all([
    db.select({ id: teams.id, createdAt: teams.createdAt }).from(teams),
    db
      .select({ teamId: teamMembers.teamId, members: count() })
      .from(teamMembers)
      .groupBy(teamMembers.teamId),
    db
      .select({ value: count() })
      .from(teamInvites)
      .where(gte(teamInvites.expiresAt, now)),
  ]);

  const stats = emptyTeamStats();
  stats.total = teamRows.length;
  stats.pendingInvites = invites?.value ?? 0;

  for (const row of teamRows) {
    const age = now - row.createdAt;
    if (age <= 86_400) stats.createdLast24h += 1;
    if (age <= 604_800) stats.createdLast7d += 1;
  }

  for (const row of memberRows) {
    stats.memberships += row.members;
    if (row.members > stats.largestMembers) stats.largestMembers = row.members;
    if (row.members <= 1) stats.memberSizes.solo += 1;
    else if (row.members <= 5) stats.memberSizes.small += 1;
    else if (row.members <= 20) stats.memberSizes.medium += 1;
    else stats.memberSizes.large += 1;
  }
  stats.averageMembers =
    stats.total > 0 ? roundTo1(stats.memberships / stats.total) : 0;

  // Clips can only reference an existing team, so every key here is a live team.
  let teamClipTotal = 0;
  for (const clipCount of clipsPerTeam.values()) {
    teamClipTotal += clipCount;
    if (clipCount > stats.clips.largestTeam) stats.clips.largestTeam = clipCount;
    if (clipCount <= 9) stats.clips.distribution.few += 1;
    else if (clipCount <= 49) stats.clips.distribution.some += 1;
    else stats.clips.distribution.many += 1;
  }

  stats.clips.total = teamClipTotal;
  stats.clips.teamsWithClips = clipsPerTeam.size;
  stats.clips.teamsWithoutClips = Math.max(stats.total - clipsPerTeam.size, 0);
  stats.clips.distribution.none = stats.clips.teamsWithoutClips;
  stats.clips.averagePerTeam =
    stats.total > 0 ? roundTo1(teamClipTotal / stats.total) : 0;

  return stats;
}

async function sumApiRequestsSince(sinceSeconds: number): Promise<number> {
  const since = Math.floor(Date.now() / 1000) - sinceSeconds;
  const rows = await db
    .select({ breakdown: statsSnapshots.breakdown })
    .from(statsSnapshots)
    .where(gte(statsSnapshots.recordedAt, since));

  let total = 0;
  for (const row of rows) {
    total += parseSnapshotPayload(row.breakdown).apiUsage.total;
  }
  return total;
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

  const apiUsage = peekApiUsage();
  const [apiRequestsSince, accounts, teamStats] = await Promise.all([
    sumApiRequestsSince(86_400),
    computeAccountStats(now),
    computeTeamStats(now, countClipsPerTeam(rows)),
  ]);

  return {
    total: rows.length,
    createdLast24h,
    createdLast7d,
    breakdown: accumulateBreakdown(rows),
    accounts,
    teams: teamStats,
    apiUsage,
    apiRequestsLast24h: apiRequestsSince + apiUsage.total,
    recordedAt: now,
  };
}

export async function recordStatsSnapshot(): Promise<ClipStats> {
  const stats = await computeClipStats();
  const apiUsage = takeApiUsageSnapshot();
  await db.insert(statsSnapshots).values({
    recordedAt: stats.recordedAt,
    totalActive: stats.total,
    breakdown: serializeSnapshotPayload(
      stats.breakdown,
      stats.accounts,
      stats.teams,
      apiUsage
    ),
  });
  return { ...stats, apiUsage };
}

export async function getStatsHistory(sinceSeconds: number): Promise<StatsHistoryPoint[]> {
  const since = Math.floor(Date.now() / 1000) - sinceSeconds;
  const rows = await db
    .select()
    .from(statsSnapshots)
    .where(gte(statsSnapshots.recordedAt, since))
    .orderBy(statsSnapshots.recordedAt);

  return rows.map((row) => ({
    recordedAt: row.recordedAt,
    totalActive: row.totalActive,
    ...parseSnapshotPayload(row.breakdown),
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
