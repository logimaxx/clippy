CREATE TABLE `email_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`new_email` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_changes_token_unique` ON `email_changes` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_email_changes_user` ON `email_changes` (`user_id`);
