const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// DATA_PATH env var → Railway Volume mount point (e.g. /data)
// Falls back to local server/data for development
const DB_DIR = process.env.DATA_PATH || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'tracker.db');

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// WAL mode for better concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema (creates tables that don't exist)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ── Column migrations ─────────────────────────────────────────────────────────
// ALTER TABLE … ADD COLUMN is safe to run repeatedly — we catch DUPLICATE errors.
// This handles production DBs created before new columns were added.
function addColumnIfMissing(table, column, definition) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[migration] Added ${table}.${column}`);
  } catch (e) {
    // SQLite throws "duplicate column name" if already present — that's fine
    if (!e.message.includes('duplicate column name')) {
      console.error(`[migration] Failed to add ${table}.${column}:`, e.message);
    }
  }
}

// tasks
addColumnIfMissing('tasks', 'deferred_count', 'INTEGER DEFAULT 0');
addColumnIfMissing('tasks', 'follow_up_date',  'DATE');
addColumnIfMissing('tasks', 'due_time',         'TEXT');
addColumnIfMissing('tasks', 'is_recurring',     'INTEGER DEFAULT 0');
addColumnIfMissing('tasks', 'recur_interval',   'TEXT');
addColumnIfMissing('tasks', 'tags',             "TEXT DEFAULT '[]'");

// reminders
addColumnIfMissing('reminders', 'snoozed_until', 'DATETIME');
addColumnIfMissing('reminders', 'related_task_id', 'INTEGER');

// journal_entries
addColumnIfMissing('journal_entries', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

// streaks
addColumnIfMissing('streaks', 'longest_streak',    'INTEGER DEFAULT 0');
addColumnIfMissing('streaks', 'last_activity_date', 'DATE');

// exercises (workout)
addColumnIfMissing('exercises', 'category', "TEXT DEFAULT 'other'");

// workout_sets
addColumnIfMissing('workout_sets', 'sort_order', 'INTEGER DEFAULT 0');

module.exports = db;
