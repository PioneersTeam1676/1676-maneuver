-- Convert LONGTEXT JSON columns to utf8mb4 so 4-byte UTF-8 chars (emoji) can be stored.
-- Fixes MySQL error 1366 "Incorrect string value: '\xF0\x9F...'" on scouting upsert.
--
-- Safe by design:
--   * Only touches LONGTEXT columns (no indexes affected).
--   * Avoids `ALTER TABLE ... CONVERT TO CHARACTER SET` because some VARCHAR
--     indexes (push_subscriptions.endpoint VARCHAR(1024) UNIQUE, composite PKs)
--     would exceed the 3072-byte InnoDB key prefix limit under utf8mb4.
--   * MODIFY COLUMN preserves data; existing rows are re-encoded in place and
--     ASCII/utf8mb3 content is bit-identical in utf8mb4.
--
-- Run once per per-team database (e.g. team1676_scouting2026).

-- New tables created after this run inherit utf8mb4 by default.
ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE scouting_entries
  MODIFY data LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

ALTER TABLE pit_entries
  MODIFY data LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- event_settings.events_json: MySQL 8 allows TEXT defaults via expression syntax.
-- Original schema.sql uses `DEFAULT '[]'` — preserve via expression default in MODIFY.
-- If your MySQL version rejects this, drop the DEFAULT clause; rows always set the value explicitly.
ALTER TABLE event_settings
  MODIFY events_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ('[]');

ALTER TABLE scout_schedule_matches
  MODIFY red_teams LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;

ALTER TABLE scout_schedule_matches
  MODIFY blue_teams LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;

ALTER TABLE push_subscriptions
  MODIFY data_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;

ALTER TABLE form_definitions
  MODIFY schema_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
