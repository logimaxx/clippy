CREATE TABLE `clips` (
	`slug` text PRIMARY KEY NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`content_type` text DEFAULT 'text' NOT NULL,
	`file_path` text,
	`metadata` text,
	`expires_at` integer,
	`burn_on_read` integer DEFAULT true NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`max_views` integer,
	`pin_hash` text,
	`language` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_clips_expires` ON `clips` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`name` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
