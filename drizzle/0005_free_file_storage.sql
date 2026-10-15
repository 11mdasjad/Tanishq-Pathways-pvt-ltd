CREATE TABLE `storage_usage` (
	`id` integer PRIMARY KEY NOT NULL,
	`used` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stored_chunks` (
	`object_key` text NOT NULL,
	`part` integer NOT NULL,
	`data` blob NOT NULL,
	FOREIGN KEY (`object_key`) REFERENCES `stored_objects`(`object_key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stored_chunks_part` ON `stored_chunks` (`object_key`,`part`);--> statement-breakpoint
CREATE TABLE `stored_objects` (
	`object_key` text PRIMARY KEY NOT NULL,
	`size` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO storage_usage (id, used) VALUES (1, 0);
--> statement-breakpoint
CREATE TRIGGER stored_objects_reserve BEFORE INSERT ON stored_objects BEGIN
  SELECT RAISE(ABORT, 'file_size_invalid') WHERE NEW.size < 1 OR NEW.size > 3000000;
  SELECT RAISE(ABORT, 'file_storage_full') WHERE NOT EXISTS (SELECT 1 FROM storage_usage WHERE id=1 AND used + NEW.size <= 200000000);
  UPDATE storage_usage SET used = used + NEW.size WHERE id=1;
END;
--> statement-breakpoint
CREATE TRIGGER stored_objects_release AFTER DELETE ON stored_objects BEGIN
  UPDATE storage_usage SET used = used - OLD.size WHERE id=1;
END;
--> statement-breakpoint
CREATE TRIGGER stored_objects_immutable BEFORE UPDATE ON stored_objects BEGIN
  SELECT RAISE(ABORT, 'stored_objects_are_immutable');
END;
