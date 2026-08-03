import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { clips, teamInvites, teamMembers, teams } from "../db/schema";
import { deleteClip } from "../store/clips";

/**
 * Erases a team and everything scoped to it. Clips are removed through
 * `deleteClip` so uploaded files go with them. Shared by the team settings page
 * and by account deletion, so both paths clean up identically.
 */
export async function deleteTeam(teamId: string): Promise<void> {
  const teamClips = await db
    .select({ slug: clips.slug })
    .from(clips)
    .where(eq(clips.teamId, teamId));
  for (const clip of teamClips) await deleteClip(clip.slug);

  await db.delete(teamInvites).where(eq(teamInvites.teamId, teamId));
  await db.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
  await db.delete(teams).where(eq(teams.id, teamId));
}
