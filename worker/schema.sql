-- Create Users Table
CREATE TABLE IF NOT EXISTS Users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  password_hash TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  verification_token TEXT,
  play_time_balance INTEGER DEFAULT 3600, -- 1 hour in seconds
  access_allowed BOOLEAN DEFAULT TRUE,
  last_login DATETIME,
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

CREATE TABLE IF NOT EXISTS SpriteSets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  idle_src TEXT NOT NULL,
  walk_src TEXT NOT NULL,
  jump_src TEXT NOT NULL,
  grave_src TEXT NOT NULL,
  aim_bazooka_src TEXT,
  aim_minigun_src TEXT,
  aim_shotgun_src TEXT,
  aim_rocket_src TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Weapons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  damage INTEGER NOT NULL,
  explosionRadius INTEGER NOT NULL,
  knockback INTEGER NOT NULL,
  windMultiplier REAL NOT NULL,
  spread REAL NOT NULL,
  projectilesPerShot INTEGER NOT NULL,
  cooldown INTEGER NOT NULL,
  chargeSpeed REAL NOT NULL,
  speedModifier REAL NOT NULL,
  icon_src TEXT,
  projectile_src TEXT,
  color TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Signaling (
  room_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, type)
);

CREATE TABLE IF NOT EXISTS Maps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  image_data TEXT NOT NULL, -- Base64 PNG image
  width INTEGER NOT NULL DEFAULT 1500,
  height INTEGER NOT NULL DEFAULT 800,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Matchmaking Queue
CREATE TABLE IF NOT EXISTS MatchmakingQueue (
  room_id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
