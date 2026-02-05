-- Convert scouting_entries id to auto-increment integer and preserve client ids.
-- Run this in each database that already has scouting_entries populated.

ALTER TABLE scouting_entries
  DROP PRIMARY KEY;

ALTER TABLE scouting_entries
  CHANGE COLUMN id client_id VARCHAR(255) NOT NULL;

ALTER TABLE scouting_entries
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE scouting_entries
  ADD UNIQUE KEY uniq_scouting_client_id (client_id);
