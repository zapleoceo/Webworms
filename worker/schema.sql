-- Create Users Table
CREATE TABLE IF NOT EXISTS Users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  play_time_balance INTEGER DEFAULT 3600, -- 1 hour in seconds
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
