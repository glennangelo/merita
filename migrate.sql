ALTER TABLE entries ADD COLUMN photo_w INTEGER;
ALTER TABLE entries ADD COLUMN photo_h INTEGER;
ALTER TABLE entries ADD COLUMN sender TEXT;
ALTER TABLE entries ADD COLUMN edited_at TEXT;
ALTER TABLE rsvps ADD COLUMN sender TEXT;
CREATE INDEX IF NOT EXISTS entries_sender ON entries (sender, created_at DESC);
CREATE INDEX IF NOT EXISTS rsvps_sender ON rsvps (sender, created_at DESC);
