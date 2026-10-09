import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS workshops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  title TEXT NOT NULL,
  instructor TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 120 CHECK (duration_minutes > 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_workshops_starts_at ON workshops(starts_at);
CREATE INDEX IF NOT EXISTS idx_workshops_status ON workshops(status);

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workshop_id INTEGER NOT NULL REFERENCES workshops(id),
  attendee_name TEXT NOT NULL,
  attendee_email TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  registered_by INTEGER NOT NULL REFERENCES users(id),
  registered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  cancelled_by INTEGER REFERENCES users(id),
  cancelled_at TEXT,
  cancel_reason TEXT,
  CHECK ((status = 'active' AND cancelled_by IS NULL AND cancelled_at IS NULL)
      OR (status = 'cancelled' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_registrations_workshop ON registrations(workshop_id, status);
CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(attendee_email);

CREATE UNIQUE INDEX IF NOT EXISTS uq_registrations_active_attendee
  ON registrations(workshop_id, attendee_email) WHERE status = 'active';

CREATE TRIGGER IF NOT EXISTS trg_registrations_capacity
BEFORE INSERT ON registrations
WHEN NEW.status = 'active'
BEGIN
  SELECT RAISE(ABORT, 'capacity_exceeded')
  WHERE (SELECT COUNT(*) FROM registrations r WHERE r.workshop_id = NEW.workshop_id AND r.status = 'active')
      >= (SELECT capacity FROM workshops w WHERE w.id = NEW.workshop_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_workshops_capacity_floor
BEFORE UPDATE OF capacity ON workshops
WHEN NEW.capacity < (SELECT COUNT(*) FROM registrations r WHERE r.workshop_id = NEW.id AND r.status = 'active')
BEGIN
  SELECT RAISE(ABORT, 'capacity_below_registrations');
END;

CREATE TRIGGER IF NOT EXISTS trg_registrations_no_delete
BEFORE DELETE ON registrations
BEGIN
  SELECT RAISE(ABORT, 'registrations_are_permanent');
END;

CREATE TRIGGER IF NOT EXISTS trg_registrations_immutable
BEFORE UPDATE ON registrations
WHEN OLD.status = 'cancelled'
  OR NEW.workshop_id != OLD.workshop_id
  OR NEW.attendee_name != OLD.attendee_name
  OR NEW.attendee_email != OLD.attendee_email
  OR NEW.registered_by != OLD.registered_by
  OR NEW.registered_at != OLD.registered_at
BEGIN
  SELECT RAISE(ABORT, 'registration_history_is_immutable');
END;

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC, id DESC);
`;

export function openDatabase(file: string): Db {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}
