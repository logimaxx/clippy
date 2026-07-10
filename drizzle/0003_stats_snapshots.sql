CREATE TABLE `stats_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recorded_at` integer NOT NULL,
	`total_active` integer NOT NULL,
	`breakdown` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_stats_recorded` ON `stats_snapshots` (`recorded_at`);
