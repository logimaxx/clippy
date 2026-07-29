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
    burnOnRead: integer("burn_on_read", { mode: "boolean" }).notNull().default(false),
    viewCount: integer("view_count").notNull().default(0),
    maxViews: integer("max_views"),
    pinHash: text("pin_hash"),
    ownerPasswordHash: text("owner_password_hash"),
    webhookUrl: text("webhook_url"),
    language: text("language"),
    encrypted: integer("encrypted", { mode: "boolean" }).notNull().default(false),
    /** Public PBKDF2 salt (base64url) for passphrase-protected E2E. */
    e2eSalt: text("e2e_salt"),
    /** DEK wrapped with passphrase-derived KEK (base64url). */
    e2eWrappedKey: text("e2e_wrapped_key"),
    /** JSON KDF params, e.g. {"alg":"PBKDF2","hash":"SHA-256","iters":600000}. */
    e2eKdf: text("e2e_kdf"),
    visibility: text("visibility").notNull().default("private"),
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
    index("idx_clips_visibility").on(table.visibility),
  ]
);

export type ClipVisibility = "private" | "public";

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
  /** Null until the address is proven, either by email link or by OAuth. */
  emailVerifiedAt: integer("email_verified_at"),
  /** Bumped to invalidate every session token issued before the change. */
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Math.floor(Date.now() / 1000)),
});

export const oauthAccounts = sqliteTable(
  "oauth_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    uniqueIndex("oauth_provider_user_unique").on(table.provider, table.providerUserId),
    index("idx_oauth_accounts_user").on(table.userId),
  ]
);

export const passwordResets = sqliteTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** SHA-256 of the token; the raw value only ever exists in the email. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    uniqueIndex("password_resets_token_unique").on(table.tokenHash),
    index("idx_password_resets_user").on(table.userId),
  ]
);

export const emailVerifications = sqliteTable(
  "email_verifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    uniqueIndex("email_verifications_token_unique").on(table.tokenHash),
    index("idx_email_verifications_user").on(table.userId),
  ]
);

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

export type PasswordReset = typeof passwordResets.$inferSelect;
export type EmailVerification = typeof emailVerifications.$inferSelect;
export const teamInvites = sqliteTable(
  "team_invites",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    /** The address the invite is bound to; only that account can redeem it. */
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    uniqueIndex("team_invites_token_unique").on(table.tokenHash),
    uniqueIndex("team_invites_team_email_unique").on(table.teamId, table.email),
    index("idx_team_invites_team").on(table.teamId),
  ]
);

export type TeamInvite = typeof teamInvites.$inferSelect;
export type Clip = typeof clips.$inferSelect;
export type NewClip = typeof clips.$inferInsert;
export type User = typeof users.$inferSelect;
export type OauthAccount = typeof oauthAccounts.$inferSelect;
export type OauthProvider = "google" | "github";
export type Team = typeof teams.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type ClipVersion = typeof clipVersions.$inferSelect;
export type StatsSnapshot = typeof statsSnapshots.$inferSelect;

export type TeamRole = "owner" | "admin" | "member" | "viewer";
