CREATE TABLE IF NOT EXISTS scouting_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id VARCHAR(255) NOT NULL UNIQUE,
  team_number VARCHAR(255),
  match_number VARCHAR(255),
  alliance VARCHAR(255),
  scout_name VARCHAR(255),
  scout_email VARCHAR(255),
  event_name VARCHAR(255),
  data LONGTEXT NOT NULL,
  timestamp BIGINT NOT NULL
);
ALTER TABLE scouting_entries ADD COLUMN IF NOT EXISTS scout_email VARCHAR(255) NULL AFTER scout_name;
CREATE INDEX idx_scouting_team ON scouting_entries(team_number);
CREATE INDEX idx_scouting_match ON scouting_entries(match_number);
CREATE INDEX idx_scouting_event ON scouting_entries(event_name);
CREATE INDEX idx_scouting_scout ON scouting_entries(scout_name);
CREATE INDEX idx_scouting_scout_email ON scouting_entries(scout_email);

CREATE TABLE IF NOT EXISTS pit_entries (
  id VARCHAR(255) PRIMARY KEY,
  team_number VARCHAR(255),
  event_name VARCHAR(255),
  scout_name VARCHAR(255),
  scout_email VARCHAR(255),
  data LONGTEXT NOT NULL,
  timestamp BIGINT NOT NULL
);
ALTER TABLE pit_entries ADD COLUMN IF NOT EXISTS scout_email VARCHAR(255) NULL AFTER scout_name;
CREATE INDEX idx_pit_team ON pit_entries(team_number);
CREATE INDEX idx_pit_event ON pit_entries(event_name);
CREATE INDEX idx_pit_scout ON pit_entries(scout_name);
CREATE INDEX idx_pit_scout_email ON pit_entries(scout_email);

CREATE TABLE IF NOT EXISTS scouts (
  name VARCHAR(255) PRIMARY KEY,
  pis INT NOT NULL,
  pis_from_predictions INT NOT NULL,
  total_predictions INT NOT NULL,
  correct_predictions INT NOT NULL,
  current_streak INT NOT NULL,
  longest_streak INT NOT NULL,
  created_at BIGINT NOT NULL,
  last_updated BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS predictions (
  id VARCHAR(255) PRIMARY KEY,
  scout_name VARCHAR(255) NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  match_number VARCHAR(255) NOT NULL,
  predicted_winner VARCHAR(255) NOT NULL,
  wager INT,
  actual_winner VARCHAR(255),
  is_correct BOOLEAN,
  points_awarded INT,
  timestamp BIGINT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_predictions_scout FOREIGN KEY (scout_name) REFERENCES scouts(name) ON DELETE CASCADE
);
CREATE INDEX idx_predictions_scout ON predictions(scout_name);
CREATE INDEX idx_predictions_event_match ON predictions(event_name, match_number);
CREATE UNIQUE INDEX idx_predictions_unique ON predictions(scout_name, event_name, match_number);

CREATE TABLE IF NOT EXISTS scout_achievements (
  scout_name VARCHAR(255) NOT NULL,
  achievement_id VARCHAR(255) NOT NULL,
  unlocked_at BIGINT NOT NULL,
  progress FLOAT,
  PRIMARY KEY (scout_name, achievement_id),
  CONSTRAINT fk_achievements_scout FOREIGN KEY (scout_name) REFERENCES scouts(name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_settings (
  id INT PRIMARY KEY,
  current_event VARCHAR(255),
  events_json LONGTEXT NOT NULL DEFAULT '[]',
  event_display_names_json LONGTEXT NOT NULL DEFAULT '{}',
  updated_at INT NOT NULL
);

ALTER TABLE event_settings ADD COLUMN IF NOT EXISTS event_display_names_json LONGTEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS scout_schedule_matches (
  event_key VARCHAR(255) NOT NULL,
  match_number VARCHAR(255) NOT NULL,
  start_time VARCHAR(255),
  red_teams LONGTEXT,
  blue_teams LONGTEXT,
  created_at INT NOT NULL,
  updated_at INT NOT NULL,
  PRIMARY KEY (event_key, match_number)
);

CREATE TABLE IF NOT EXISTS scout_schedule_assignments (
  event_key VARCHAR(255) NOT NULL,
  match_number VARCHAR(255) NOT NULL,
  match_order INT,
  position VARCHAR(255) NOT NULL,
  scout_email VARCHAR(255) NOT NULL,
  start_time VARCHAR(255),
  created_at INT NOT NULL,
  updated_at INT NOT NULL,
  PRIMARY KEY (event_key, match_number, position)
);
CREATE INDEX idx_schedule_email ON scout_schedule_assignments(event_key, scout_email);
CREATE INDEX idx_schedule_match_order ON scout_schedule_assignments(event_key, match_order);

CREATE TABLE IF NOT EXISTS schedule_assignment_overrides (
  event_key VARCHAR(255) NOT NULL,
  match_number VARCHAR(255) NOT NULL,
  position VARCHAR(255) NOT NULL,
  original_scout_email VARCHAR(255) NOT NULL,
  override_scout_email VARCHAR(255) NOT NULL,
  reason VARCHAR(255) NULL,
  created_by_email VARCHAR(255) NULL,
  created_at INT NOT NULL,
  updated_at INT NOT NULL,
  PRIMARY KEY (event_key, match_number, position)
);
CREATE INDEX idx_schedule_override_email ON schedule_assignment_overrides(event_key, override_scout_email);
CREATE INDEX idx_schedule_override_match ON schedule_assignment_overrides(event_key, match_number);

CREATE TABLE IF NOT EXISTS schedule_progress (
  event_key VARCHAR(255) PRIMARY KEY,
  last_completed_match INT NOT NULL,
  last_updated INT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_notifications (
  event_key VARCHAR(255) NOT NULL,
  match_number VARCHAR(255) NOT NULL,
  scout_email VARCHAR(255) NOT NULL,
  sent_at INT NOT NULL,
  PRIMARY KEY (event_key, match_number, scout_email)
);
CREATE INDEX idx_schedule_notifications_email ON schedule_notifications(event_key, scout_email);
