-- Drop the table for clean schema update since this is development
DROP TABLE IF EXISTS Users;

-- Create Users Table
CREATE TABLE IF NOT EXISTS Users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  password_hash TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  verification_token TEXT,
  play_time_balance INTEGER DEFAULT 3600, -- 1 hour in seconds
  access_allowed BOOLEAN DEFAULT TRUE,
  last_daily_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
  referred_by TEXT, -- Foreign Key to Users.id (Level 1)
  matches_played INTEGER DEFAULT 0,
  matches_won INTEGER DEFAULT 0,
  total_damage_dealt INTEGER DEFAULT 0,
  total_kills INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster referral lookups
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON Users(referred_by);
CREATE INDEX IF NOT EXISTS idx_users_email ON Users(email);

-- Friends Table (Many-to-Many mapping)
CREATE TABLE IF NOT EXISTS Friends (
  user_id_1 TEXT NOT NULL,
  user_id_2 TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id_1, user_id_2),
  FOREIGN KEY (user_id_1) REFERENCES Users(id),
  FOREIGN KEY (user_id_2) REFERENCES Users(id)
);

-- Match History Table
CREATE TABLE IF NOT EXISTS Matches (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL, -- 'training', 'friend', 'random'
  player1_id TEXT,
  player2_id TEXT,
  winner_id TEXT,
  player1_weapons TEXT, -- JSON array of weapon IDs
  player2_weapons TEXT, -- JSON array of weapon IDs
  duration_seconds INTEGER,
  player1_damage_dealt INTEGER DEFAULT 0,
  player2_damage_dealt INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_matches_p1 ON Matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_p2 ON Matches(player2_id);
