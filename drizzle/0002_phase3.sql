ALTER TABLE `users` ADD `password_hash` text;
--> statement-breakpoint
ALTER TABLE `clips` ADD `encrypted` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `clips` ADD `owner_id` text;
--> statement-breakpoint
ALTER TABLE `clips` ADD `team_id` text;
--> statement-breakpoint
CREATE TABLE `clip_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `clip_slug` text NOT NULL,
  `content` text NOT NULL,
  `author_id` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_versions_clip` ON `clip_versions` (`clip_slug`);
--> statement-breakpoint
CREATE TABLE `teams` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `name` text NOT NULL,
  `owner_id` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_slug_unique` ON `teams` (`slug`);
--> statement-breakpoint
CREATE TABLE `team_members` (
  `id` text PRIMARY KEY NOT NULL,
  `team_id` text NOT NULL,
  `user_id` text NOT NULL,
  `role` text DEFAULT 'member' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_member_unique` ON `team_members` (`team_id`, `user_id`);
--> statement-breakpoint
CREATE INDEX `idx_team_members_user` ON `team_members` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_clips_owner` ON `clips` (`owner_id`);
--> statement-breakpoint
CREATE INDEX `idx_clips_team` ON `clips` (`team_id`);
