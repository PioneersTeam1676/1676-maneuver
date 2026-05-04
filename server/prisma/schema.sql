CREATE TABLE IF NOT EXISTS roles (
  email VARCHAR(255) PRIMARY KEY,
  role VARCHAR(64) NOT NULL,
  created_at INT NOT NULL,
  updated_at INT NOT NULL
);

CREATE TABLE IF NOT EXISTS scouting_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id VARCHAR(255) NOT NULL UNIQUE,
  team_number VARCHAR(255),
  match_number VARCHAR(255),
  alliance VARCHAR(255),
  scout_name VARCHAR(255),
  scout_email VARCHAR(255),
  event_name VARCHAR(255),
  data LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  timestamp BIGINT NOT NULL
);
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
  data LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  timestamp BIGINT NOT NULL
);
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
  events_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '[]',
  updated_at INT NOT NULL
);

CREATE TABLE IF NOT EXISTS recent_users (
  email VARCHAR(255) PRIMARY KEY,
  first_seen_at VARCHAR(255) NOT NULL,
  last_seen_at VARCHAR(255) NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  display_name VARCHAR(255),
  photo_url VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  team_number VARCHAR(255)
);
ALTER TABLE recent_users ADD COLUMN IF NOT EXISTS first_name VARCHAR(255) NULL AFTER photo_url;
ALTER TABLE recent_users ADD COLUMN IF NOT EXISTS last_name VARCHAR(255) NULL AFTER first_name;
ALTER TABLE recent_users ADD COLUMN IF NOT EXISTS team_number VARCHAR(255) NULL AFTER last_name;
CREATE INDEX idx_recent_users_ack ON recent_users(acknowledged);
CREATE INDEX idx_recent_users_last_seen ON recent_users(last_seen_at);

CREATE TABLE IF NOT EXISTS verified_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL,
  verified_at INT NOT NULL,
  CONSTRAINT fk_verified_role FOREIGN KEY (email) REFERENCES roles(email) ON DELETE CASCADE
);
CREATE INDEX idx_verified_users_verified_at ON verified_users(verified_at);
CREATE INDEX idx_verified_users_email ON verified_users(email);

CREATE TABLE IF NOT EXISTS scout_schedule_matches (
  event_key VARCHAR(255) NOT NULL,
  match_number VARCHAR(255) NOT NULL,
  start_time VARCHAR(255),
  red_teams LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  blue_teams LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
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

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255),
  endpoint VARCHAR(1024) NOT NULL UNIQUE,
  p256dh VARCHAR(512),
  auth VARCHAR(512),
  data_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  user_agent VARCHAR(512),
  created_at INT NOT NULL,
  last_used INT NOT NULL
);
CREATE INDEX idx_push_subscriptions_email ON push_subscriptions(email);

CREATE TABLE IF NOT EXISTS form_definitions (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  year VARCHAR(255) NOT NULL,
  description VARCHAR(255),
  form_type VARCHAR(64) NOT NULL DEFAULT 'match',
  status VARCHAR(64) NOT NULL DEFAULT 'draft',
  db_host VARCHAR(255),
  db_name VARCHAR(255),
  db_user VARCHAR(255),
  db_pass VARCHAR(255),
  db_engine VARCHAR(64) NOT NULL DEFAULT 'mysql',
  schema_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  created_at INT NOT NULL,
  updated_at INT NOT NULL
);
CREATE INDEX idx_form_definitions_year ON form_definitions(year);
