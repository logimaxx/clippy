import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { teams, teamMembers, type Team, type TeamRole } from "../db/schema";
import type { Clip } from "../db/schema";

const WRITE_ROLES: TeamRole[] = ["owner", "admin", "member"];
const ADMIN_ROLES: TeamRole[] = ["owner", "admin"];

export async function getTeamBySlug(slug: string): Promise<Team | null> {
  const rows = await db.select().from(teams).where(eq(teams.slug, slug)).limit(1);
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
  userId: string | null
): Promise<boolean> {
  if (clip.ownerId && userId === clip.ownerId) return true;
  if (clip.teamId && userId) {
    const role = await getMemberRole(clip.teamId, userId);
    if (role && WRITE_ROLES.includes(role)) return true;
  }
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
