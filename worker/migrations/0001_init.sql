-- One row per sync code. No email, no IP, no account: just a nickname,
-- the encoded jersey progress and the donation-nag flags.
CREATE TABLE IF NOT EXISTS profiles (
  code             TEXT    PRIMARY KEY,           -- 12 chars, Crockford base32
  username         TEXT    NOT NULL,
  progress         TEXT    NOT NULL DEFAULT '',   -- same format as the in-app backup code
  rev              INTEGER NOT NULL DEFAULT 1,    -- bumped on every progress write
  donated_at       INTEGER,                       -- ms epoch, set once when "I have donated" is tapped
  nag_dismissed_at INTEGER,                       -- ms epoch of the latest "Not now"
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
) WITHOUT ROWID;
