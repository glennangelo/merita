CREATE TABLE IF NOT EXISTS entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  visibility  TEXT    NOT NULL DEFAULT 'public'
                      CHECK (visibility IN ('public', 'private')),
  approved    INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0, 1)),
  photo       BLOB,
  photo_type  TEXT,
  photo_alt   TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS entries_feed
  ON entries (visibility, approved, created_at DESC);
CREATE TABLE IF NOT EXISTS rsvps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  party_size  INTEGER NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 20),
  ceremony    INTEGER NOT NULL DEFAULT 0 CHECK (ceremony  IN (0, 1)),
  reception   INTEGER NOT NULL DEFAULT 0 CHECK (reception IN (0, 1)),
  contact     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (ceremony = 1 OR reception = 1)
);
