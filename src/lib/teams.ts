import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { teams, teamMembers, users, type Team, type TeamRole } from "../db/schema";
import type { Clip } from "../db/schema";

const WRITE_ROLES: TeamRole[] = ["owner", "admin", "member"];
const ADMIN_ROLES: TeamRole[] = ["owner", "admin"];

export async function getTeamBySlug(slug: string): Promise<Team | null> {
  const rows = await db.select().from(teams).where(eq(teams.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function getTeamById(id: string): Promise<Team | null> {
  const rows = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getMemberRole(
  teamId: string,
  userId: string
): Promise<TeamRole | null> {
  const rows = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);
  return (rows[0]?.role as TeamRole) ?? null;
}

export async function canReadClip(
  clip: Clip,
  userId: string | null
): Promise<boolean> {
  if (!clip.teamId) return true;
  if (!userId) return !clip.pinHash;
  const role = await getMemberRole(clip.teamId, userId);
  return role !== null;
}

export async function canWriteClip(
  clip: Clip,
  userId: string | null,
  /** True when the request carries a valid owner cookie for this clip. */
  hasOwnerCookie = false
): Promise<boolean> {
  const isAccountOwner = !!(clip.ownerId && userId === clip.ownerId);
  const isOwner = isAccountOwner || hasOwnerCookie;

  if (clip.teamId && userId) {
    const role = await getMemberRole(clip.teamId, userId);
    if (role && WRITE_ROLES.includes(role)) return true;
  }

  // Public clips are viewable by anyone, editable only by the owner.
  if (clip.visibility === "public") {
    return isOwner;
  }

  if (isOwner) return true;

  // Private anonymous clips stay collaborative (link = write access).
  if (!clip.ownerId && !clip.teamId) return true;

  return false;
}

export async function canAdminClip(
  clip: Clip,
  userId: string | null
): Promise<boolean> {
  if (!userId) return false;
  if (clip.ownerId === userId) return true;
  if (clip.teamId) {
    const role = await getMemberRole(clip.teamId, userId);
    return role !== null && ADMIN_ROLES.includes(role);
  }
  return false;
}

export function isAdminRole(role: TeamRole | null): boolean {
  return role !== null && ADMIN_ROLES.includes(role);
}

export async function listTeamMembers(teamId: string) {
  return db
    .select({
      userId: teamMembers.userId,
      email: users.email,
      name: users.name,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));
}

export async function addTeamMember(
  teamId: string,
  userId: string,
  role: TeamRole
): Promise<void> {
  await db
    .insert(teamMembers)
    .values({ id: crypto.randomUUID(), teamId, userId, role })
    .onConflictDoNothing();
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
}

export async function listUserTeams(userId: string) {
  return db
    .select({
      id: teams.id,
      slug: teams.slug,
      name: teams.name,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, userId));
}
