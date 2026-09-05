-- Storage for the memories and the replies.
-- Paste the whole file into your D1 database's Console (README.md, step 2).
--
-- visibility  'public'  the writer is happy for it to appear on the website
--             'private' the writer wants only the family to read it
-- approved    1 once a family member has approved a public memory for the site.
--             Private ones are never shown publicly whatever this says.

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

-- Serves the public list of memories without scanning the whole table.
CREATE INDEX IF NOT EXISTS entries_feed
  ON entries (visibility, approved, created_at DESC);


-- Replies: who is coming, how many of them, and to which part of the day.
-- Nothing here is ever shown publicly; it is for the family's page alone.

CREATE TABLE IF NOT EXISTS rsvps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  party_size  INTEGER NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 20),
  ceremony    INTEGER NOT NULL DEFAULT 0 CHECK (ceremony  IN (0, 1)),
  reception   INTEGER NOT NULL DEFAULT 0 CHECK (reception IN (0, 1)),
  contact     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  -- A reply that is to neither part of the day is not a reply.
  CHECK (ceremony = 1 OR reception = 1)
);
