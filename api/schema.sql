-- Tuxplore save API. Apply with: npx wrangler d1 execute tuxplore --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  username   TEXT PRIMARY KEY,
  pass_hash  TEXT NOT NULL,          -- pbkdf2$<iterations>$<salt>$<hash>, never the password
  save       TEXT,                   -- the game's OS.state as JSON
  updated_at INTEGER NOT NULL,       -- milliseconds since 1970
  created_at INTEGER NOT NULL
);

-- Login tokens. Only their SHA-256 is stored; the browser keeps the token itself.
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  username   TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tokens_by_user ON tokens (username);

-- Sign-up and login attempts per IP, for rate limiting.
CREATE TABLE IF NOT EXISTS attempts (
  key        TEXT PRIMARY KEY,       -- <action>:<ip>:<window start>
  count      INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Anonymous usage counts: how many times each event happened each day. Nothing else.
CREATE TABLE IF NOT EXISTS events (
  day   TEXT NOT NULL,                -- YYYY-MM-DD, UTC
  name  TEXT NOT NULL,                -- e.g. boot, quest_complete:dungeon, de_switch:retro
  count INTEGER NOT NULL,
  PRIMARY KEY (day, name)
);
