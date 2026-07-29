CREATE TABLE `team_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`),
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_invites_token_unique` ON `team_invites` (`token_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_invites_team_email_unique` ON `team_invites` (`team_id`,`email`);
--> statement-breakpoint
CREATE INDEX `idx_team_invites_team` ON `team_invites` (`team_id`);
