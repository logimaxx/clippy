import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const clips = sqliteTable(
  "clips",
  {
    slug: text("slug").primaryKey(),
    content: text("content").notNull().default(""),
    contentType: text("content_type").notNull().default("text"),
    filePath: text("file_path"),
    metadata: text("metadata"),
    expiresAt: integer("expires_at"),
    burnOnRead: integer("burn_on_read", { mode: "boolean" }).notNull().default(true),
    viewCount: integer("view_count").notNull().default(0),
    maxViews: integer("max_views"),
    pinHash: text("pin_hash"),
    webhookUrl: text("webhook_url"),
    language: text("language"),
    encrypted: integer("encrypted", { mode: "boolean" }).notNull().default(false),
    ownerId: text("owner_id"),
    teamId: text("team_id"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    index("idx_clips_expires").on(table.expiresAt),
    index("idx_clips_owner").on(table.ownerId),
    index("idx_clips_team").on(table.teamId),
  ]
);

export const clipVersions = sqliteTable(
  "clip_versions",
  {
    id: text("id").primaryKey(),
    clipSlug: text("clip_slug").notNull(),
    content: text("content").notNull(),
    authorId: text("author_id"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [index("idx_versions_clip").on(table.clipSlug)]
);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  keyHash: text("key_hash").notNull(),
  name: text("name"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const teams = sqliteTable(
  "teams",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [uniqueIndex("teams_slug_unique").on(table.slug)]
);

export const statsSnapshots = sqliteTable(
  "stats_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordedAt: integer("recorded_at").notNull(),
    totalActive: integer("total_active").notNull(),
    breakdown: text("breakdown").notNull(),
  },
  (table) => [index("idx_stats_recorded").on(table.recordedAt)]
);

export const teamMembers = sqliteTable(
  "team_members",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull().default("member"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    uniqueIndex("team_member_unique").on(table.teamId, table.userId),
    index("idx_team_members_user").on(table.userId),
  ]
);

export type Clip = typeof clips.$inferSelect;
export type NewClip = typeof clips.$inferInsert;
export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type ClipVersion = typeof clipVersions.$inferSelect;
export type StatsSnapshot = typeof statsSnapshots.$inferSelect;

export type TeamRole = "owner" | "admin" | "member" | "viewer";
