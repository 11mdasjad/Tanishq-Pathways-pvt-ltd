ALTER TABLE `leads` ADD `payment_required` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `status` text DEFAULT 'Pending verification' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `receipt_number` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `paid_on` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `payer_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `proof_file_id` text REFERENCES files(id);--> statement-breakpoint
ALTER TABLE `payments` ADD `verified_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `payments` ADD `verified_at` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `verification_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `receipt_snapshot` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_receipt_number_unique` ON `payments` (`receipt_number`);