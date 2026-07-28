CREATE TABLE `oauth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_provider_user_unique` ON `oauth_accounts` (`provider`,`provider_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_oauth_accounts_user` ON `oauth_accounts` (`user_id`);
