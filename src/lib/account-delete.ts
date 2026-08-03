import { eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  users,
  apiKeys,
  oauthAccounts,
  teams,
  teamMembers,
  clips,
  clipVersions,
  passwordResets,
  emailVerifications,
  emailChanges,
  teamInvites,
} from "../db/schema";
import { deleteClip } from "../store/clips";
import { deleteTeam } from "./team-delete";

/**
 * Erases a user and everything that belongs to them. Clips are removed through
 * `deleteClip` so uploaded files and cached copies go with them.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const ownedTeams = await db.select().from(teams).where(eq(teams.ownerId, userId));
  for (const team of ownedTeams) await deleteTeam(team.id);

  await db.delete(teamMembers).where(eq(teamMembers.userId, userId));
  // Invites this user sent to other teams would otherwise dangle on a missing
  // inviter.
  await db.delete(teamInvites).where(eq(teamInvites.invitedBy, userId));

  const ownedClips = await db
    .select({ slug: clips.slug })
    .from(clips)
    .where(eq(clips.ownerId, userId));
  for (const clip of ownedClips) await deleteClip(clip.slug);

  await db.delete(apiKeys).where(eq(apiKeys.userId, userId));
  await db.delete(oauthAccounts).where(eq(oauthAccounts.userId, userId));
  await db.delete(passwordResets).where(eq(passwordResets.userId, userId));
  await db.delete(emailVerifications).where(eq(emailVerifications.userId, userId));
  await db.delete(emailChanges).where(eq(emailChanges.userId, userId));

  // Versions on clips that survive (e.g. team clips owned elsewhere) lose only
  // the authorship link.
  await db
    .update(clipVersions)
    .set({ authorId: null })
    .where(eq(clipVersions.authorId, userId));

  await db.delete(users).where(eq(users.id, userId));
}
