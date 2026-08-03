import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The db client opens SQLite at import time, so the temp location has to be in
// place before anything that touches it is loaded.
const dataDir = mkdtempSync(join(tmpdir(), "webklip-stats-"));
process.env.DATA_DIR = dataDir;

const { db, runMigrations } = await import("../db/client");
const { apiKeys, clips, statsSnapshots, teamInvites, teamMembers, teams, users } =
  await import("../db/schema");
const { computeClipStats, getStatsHistory, recordStatsSnapshot } = await import("./stats");

const now = Math.floor(Date.now() / 1000);

beforeAll(async () => {
  runMigrations();

  await db.insert(users).values([
    { id: "u-owner", email: "owner@test.local", passwordHash: "x", emailVerifiedAt: now },
    { id: "u-member", email: "member@test.local", passwordHash: "x" },
    { id: "u-solo", email: "solo@test.local", emailVerifiedAt: now, createdAt: now - 900_000 },
  ]);

  await db
    .insert(apiKeys)
    .values({ id: "k-1", userId: "u-owner", keyHash: "hash" });

  await db.insert(teams).values([
    { id: "t-busy", slug: "busy", name: "Busy", ownerId: "u-owner" },
    { id: "t-empty", slug: "empty", name: "Empty", ownerId: "u-owner" },
  ]);

  await db.insert(teamMembers).values([
    { id: "m-1", teamId: "t-busy", userId: "u-owner", role: "owner" },
    { id: "m-2", teamId: "t-busy", userId: "u-member", role: "member" },
    { id: "m-3", teamId: "t-empty", userId: "u-owner", role: "owner" },
  ]);

  await db.insert(teamInvites).values([
    {
      id: "i-live",
      teamId: "t-busy",
      email: "pending@test.local",
      tokenHash: "live",
      invitedBy: "u-owner",
      expiresAt: now + 86_400,
    },
    {
      id: "i-stale",
      teamId: "t-busy",
      email: "stale@test.local",
      tokenHash: "stale",
      invitedBy: "u-owner",
      expiresAt: now - 10,
    },
  ]);

  await db.insert(clips).values([
    { slug: "busy/one", content: "a", teamId: "t-busy", ownerId: "u-owner" },
    { slug: "busy/two", content: "b", teamId: "t-busy", ownerId: "u-member" },
    { slug: "personal", content: "c", ownerId: "u-solo" },
    { slug: "drive-by", content: "d" },
  ]);
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("account stats", () => {
  test("counts accounts by verification, credentials and team membership", async () => {
    const { accounts } = await computeClipStats();

    expect(accounts.total).toBe(3);
    expect(accounts.verified).toBe(2);
    expect(accounts.unverified).toBe(1);
    expect(accounts.withPassword).toBe(2);
    expect(accounts.withOauth).toBe(0);
    expect(accounts.withApiKey).toBe(1);
    expect(accounts.inTeam).toBe(2);
    expect(accounts.createdLast24h).toBe(2);
    expect(accounts.createdLast7d).toBe(2);
  });
});

describe("team stats", () => {
  test("counts teams, memberships and live invites", async () => {
    const { teams: teamStats } = await computeClipStats();

    expect(teamStats.total).toBe(2);
    expect(teamStats.createdLast24h).toBe(2);
    expect(teamStats.memberships).toBe(3);
    expect(teamStats.averageMembers).toBe(1.5);
    expect(teamStats.largestMembers).toBe(2);
    expect(teamStats.memberSizes).toEqual({ solo: 1, small: 1, medium: 0, large: 0 });
    expect(teamStats.pendingInvites).toBe(1);
  });

  test("breaks clips down across teams", async () => {
    const { teams: teamStats, breakdown } = await computeClipStats();

    expect(teamStats.clips.total).toBe(2);
    expect(teamStats.clips.teamsWithClips).toBe(1);
    expect(teamStats.clips.teamsWithoutClips).toBe(1);
    expect(teamStats.clips.largestTeam).toBe(2);
    expect(teamStats.clips.averagePerTeam).toBe(1);
    expect(teamStats.clips.distribution).toEqual({ none: 1, few: 1, some: 0, many: 0 });

    expect(breakdown.audience).toEqual({ anonymous: 1, personal: 1, team: 2 });
  });
});

describe("snapshots", () => {
  test("round-trip keeps accounts and teams", async () => {
    await recordStatsSnapshot();
    const history = await getStatsHistory(3_600);
    const latest = history[history.length - 1];

    expect(latest.accounts.total).toBe(3);
    expect(latest.teams.clips.total).toBe(2);
    expect(latest.teams.total).toBe(2);
  });

  test("v2 snapshots read back with derived audience and zeroed accounts", async () => {
    await db.insert(statsSnapshots).values({
      recordedAt: now - 60,
      totalActive: 4,
      breakdown: JSON.stringify({
        v: 2,
        clips: {
          ownership: { anonymous: 1, authenticated: 3 },
          team: { none: 2, set: 2 },
        },
      }),
    });

    const point = (await getStatsHistory(3_600)).find((p) => p.recordedAt === now - 60);

    expect(point?.breakdown.audience).toEqual({ anonymous: 1, personal: 1, team: 2 });
    expect(point?.breakdown.contentType).toEqual({});
    expect(point?.accounts.total).toBe(0);
    expect(point?.teams.total).toBe(0);
  });
});
