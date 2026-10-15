CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_lead` ON `activities` (`lead_id`);--> statement-breakpoint
CREATE TABLE `agreements` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`version` integer NOT NULL,
	`file_id` text NOT NULL,
	`signed_file_id` text,
	`revision` integer NOT NULL,
	`status` text DEFAULT 'Agreement Draft' NOT NULL,
	`snapshot` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signed_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agreement_version` ON `agreements` (`lead_id`,`version`);--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Scheduled' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`object_key` text NOT NULL,
	`status` text DEFAULT 'Under Review' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`replaces` text,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_object_key_unique` ON `files` (`object_key`);--> statement-breakpoint
CREATE INDEX `files_lead` ON `files` (`lead_id`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mobile` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`country` text NOT NULL,
	`visa` text NOT NULL,
	`source` text NOT NULL,
	`assigned` text NOT NULL,
	`status` text DEFAULT 'Prospect' NOT NULL,
	`profile` text DEFAULT '{}' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`rejection` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`assigned`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `leads_assigned` ON `leads` (`assigned`);--> statement-breakpoint
CREATE INDEX `leads_status` ON `leads` (`status`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`amount` integer NOT NULL,
	`reference` text NOT NULL,
	`method` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_reference_unique` ON `payments` (`reference`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`identity` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_identity_unique` ON `users` (`identity`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`reviewer` text NOT NULL,
	`decision` text NOT NULL,
	`remarks` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
