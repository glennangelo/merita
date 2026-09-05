-- Guestbook storage. Run once against your D1 database (see README.md, step 3).
--
-- visibility  'public'  the writer is happy for it to appear on the website
--             'private' the writer wants only the family to read it
-- approved    1 once a family member has approved a public message for the site.
--             Private messages are never shown publicly whatever this says.

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

-- Serves the public guestbook feed without scanning the whole table.
CREATE INDEX IF NOT EXISTS entries_feed
  ON entries (visibility, approved, created_at DESC);
