CREATE TABLE `operation_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`success` integer NOT NULL,
	CONSTRAINT "guard_success" CHECK("operation_guards"."success" = 1)
);
--> statement-breakpoint
ALTER TABLE `leads` ADD `lock_version` integer DEFAULT 0 NOT NULL;