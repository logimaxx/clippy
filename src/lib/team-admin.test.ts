import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";

// The db client opens SQLite at import time, so the temp location has to be in
// place before anything that touches it is loaded.
const dataDir = mkdtempSync(join(tmpdir(), "webklip-team-admin-"));
process.env.DATA_DIR = dataDir;

const { db, runMigrations } = await import("../db/client");
const { clips, teamInvites, teamMembers, teams, users } = await import("../db/schema");
const { canWriteClip, getMemberRole, transferTeamOwnership, updateTeamMemberRole } =
  await import("./teams");
const { deleteTeam } = await import("./team-delete");

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function makeUser(email: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, email });
  return id;
}

async function makeTeam(ownerId: string, slug: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(teams).values({ id, slug, name: slug, ownerId });
  await db
    .insert(teamMembers)
    .values({ id: crypto.randomUUID(), teamId: id, userId: ownerId, role: "owner" });
  return id;
}

async function teamOwnerId(teamId: string): Promise<string | undefined> {
  const rows = await db
    .select({ ownerId: teams.ownerId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return rows[0]?.ownerId;
}

describe("updateTeamMemberRole", () => {
  test("promotes and demotes a member", async () => {
    const owner = await makeUser(`owner-${crypto.randomUUID()}@test.local`);
    const member = await makeUser(`member-${crypto.randomUUID()}@test.local`);
    const teamId = await makeTeam(owner, `role-${Date.now()}`);
    await db
      .insert(teamMembers)
      .values({ id: crypto.randomUUID(), teamId, userId: member, role: "member" });

    await updateTeamMemberRole(teamId, member, "admin");
    expect(await getMemberRole(teamId, member)).toBe("admin");

    await updateTeamMemberRole(teamId, member, "viewer");
    expect(await getMemberRole(teamId, member)).toBe("viewer");
  });

  test("touches only the named member of the named team", async () => {
    const owner = await makeUser(`owner-${crypto.randomUUID()}@test.local`);
    const other = await makeUser(`other-${crypto.randomUUID()}@test.local`);
    const teamA = await makeTeam(owner, `scope-a-${Date.now()}`);
    const teamB = await makeTeam(owner, `scope-b-${Date.now()}`);
    for (const teamId of [teamA, teamB]) {
      await db
        .insert(teamMembers)
        .values({ id: crypto.randomUUID(), teamId, userId: other, role: "member" });
    }

    await updateTeamMemberRole(teamA, other, "admin");

    expect(await getMemberRole(teamA, other)).toBe("admin");
    expect(await getMemberRole(teamB, other)).toBe("member");
  });
});

describe("transferTeamOwnership", () => {
  test("moves teams.ownerId and both member rows together", async () => {
    const owner = await makeUser(`owner-${crypto.randomUUID()}@test.local`);
    const heir = await makeUser(`heir-${crypto.randomUUID()}@test.local`);
    const teamId = await makeTeam(owner, `transfer-${Date.now()}`);
    await db
      .insert(teamMembers)
      .values({ id: crypto.randomUUID(), teamId, userId: heir, role: "member" });

    await transferTeamOwnership(teamId, owner, heir);

    expect(await teamOwnerId(teamId)).toBe(heir);
    expect(await getMemberRole(teamId, heir)).toBe("owner");
    // The old owner keeps access, just without the ability to transfer again.
    expect(await getMemberRole(teamId, owner)).toBe("admin");
  });

  test("leaves exactly one owner row", async () => {
    const owner = await makeUser(`owner-${crypto.randomUUID()}@test.local`);
    const heir = await makeUser(`heir-${crypto.randomUUID()}@test.local`);
    const teamId = await makeTeam(owner, `single-owner-${Date.now()}`);
    await db
      .insert(teamMembers)
      .values({ id: crypto.randomUUID(), teamId, userId: heir, role: "member" });

    await transferTeamOwnership(teamId, owner, heir);

    const owners = await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "owner")));
    expect(owners).toHaveLength(1);
  });
});

describe("deleteTeam", () => {
  test("removes the team, its clips, members and pending invites", async () => {
    const owner = await makeUser(`owner-${crypto.randomUUID()}@test.local`);
    const member = await makeUser(`member-${crypto.randomUUID()}@test.local`);
    const slug = `purge-${Date.now()}`;
    const teamId = await makeTeam(owner, slug);
    await db
      .insert(teamMembers)
      .values({ id: crypto.randomUUID(), teamId, userId: member, role: "member" });
    await db
      .insert(clips)
      .values({ slug: `${slug}/notes`, content: "hello", teamId, ownerId: owner });
    await db.insert(teamInvites).values({
      id: crypto.randomUUID(),
      teamId,
      email: "pending@test.local",
      role: "member",
      tokenHash: crypto.randomUUID(),
      invitedBy: owner,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    await deleteTeam(teamId);

    expect(await db.select().from(teams).where(eq(teams.id, teamId))).toHaveLength(0);
    expect(
      await db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId))
    ).toHaveLength(0);
    expect(
      await db.select().from(teamInvites).where(eq(teamInvites.teamId, teamId))
    ).toHaveLength(0);
    expect(await db.select().from(clips).where(eq(clips.teamId, teamId))).toHaveLength(0);
  });

  test("leaves other teams alone", async () => {
    const owner = await makeUser(`owner-${crypto.randomUUID()}@test.local`);
    const doomed = await makeTeam(owner, `doomed-${Date.now()}`);
    const kept = await makeTeam(owner, `kept-${Date.now()}`);

    await deleteTeam(doomed);

    expect(await db.select().from(teams).where(eq(teams.id, kept))).toHaveLength(1);
    expect(await getMemberRole(kept, owner)).toBe("owner");
  });
});

describe("viewer role", () => {
  test("cannot write a team clip", async () => {
    const owner = await makeUser(`owner-${crypto.randomUUID()}@test.local`);
    const viewer = await makeUser(`viewer-${crypto.randomUUID()}@test.local`);
    const slug = `viewer-${Date.now()}`;
    const teamId = await makeTeam(owner, slug);
    await db
      .insert(teamMembers)
      .values({ id: crypto.randomUUID(), teamId, userId: viewer, role: "viewer" });

    await db
      .insert(clips)
      .values({ slug: `${slug}/doc`, content: "", teamId, ownerId: owner });
    const rows = await db.select().from(clips).where(eq(clips.slug, `${slug}/doc`));

    expect(await canWriteClip(rows[0], viewer)).toBe(false);
    expect(await canWriteClip(rows[0], owner)).toBe(true);
  });
});
