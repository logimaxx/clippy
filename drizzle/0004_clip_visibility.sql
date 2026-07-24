ALTER TABLE `clips` ADD `visibility` text DEFAULT 'private' NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_clips_visibility` ON `clips` (`visibility`);
