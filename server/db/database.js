const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// DATA_PATH env var → Railway Volume mount point (e.g. /data)
// Falls back to local server/data for development
const DB_DIR = process.env.DATA_PATH || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'tracker.db');

if (!process.env.DATA_PATH && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  [db] DATA_PATH is not set! Database is stored in the container filesystem and will be WIPED on every deploy.');
  console.warn('⚠️  [db] Fix: Add a Railway Volume at /data and set DATA_PATH=/data in environment variables.');
}
console.log(`[db] Database path: ${DB_PATH}`);

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// WAL mode for better concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema (creates tables that don't exist)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Log the production tasks table definition so we can see its FK/CHECK constraints
try {
  const tasksDef = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get();
  console.log('[db] tasks table SQL:', tasksDef?.sql?.replace(/\s+/g, ' '));
} catch (_) {}

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
addColumnIfMissing('tasks', 'life_area_id',     'INTEGER REFERENCES life_areas(id)');

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
addColumnIfMissing('workout_sets', 'notes', 'TEXT DEFAULT NULL');

// ── Streaks CHECK constraint migration ────────────────────────────────────────
// The original schema only allowed ('tasks','journal','overall').
// We need to expand it to include 'workout' and 'sleep'.
// SQLite can't ALTER a CHECK constraint, so we recreate the table.
try {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='streaks'").get();
  if (row && (!row.sql.includes("'workout'") || !row.sql.includes("'content'"))) {
    db.exec(`
      BEGIN;
      CREATE TABLE streaks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        activity_type TEXT NOT NULL CHECK(activity_type IN ('tasks','journal','overall','workout','sleep','content')),
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_activity_date DATE,
        UNIQUE(user_id, activity_type)
      );
      INSERT OR IGNORE INTO streaks_new
        (id, user_id, activity_type, current_streak, longest_streak, last_activity_date)
        SELECT id, user_id, activity_type, current_streak, longest_streak, last_activity_date
        FROM streaks;
      DROP TABLE streaks;
      ALTER TABLE streaks_new RENAME TO streaks;
      COMMIT;
    `);
    console.log('[migration] Expanded streaks.activity_type CHECK to include workout/sleep/content');
  }
} catch (e) {
  console.error('[migration] streaks CHECK expand failed:', e.message);
}


// ── Paper-theme color remap ───────────────────────────────────────────────────
// One-time idempotent remap: rows created under the old neon palette get
// rewritten to the warm Anthropic ember palette. Safe to run on every boot.
try {
  const COLOR_REMAP = {
    '#6366f1': '#d97757', '#3b82f6': '#b5764f', '#0ea5e9': '#a97e5f',
    '#06b6d4': '#a97e5f', '#14b8a6': '#b5764f', '#22c55e': '#cf8a3e',
    '#84cc16': '#cf8a3e', '#10b981': '#cf8a3e', '#f43f5e': '#c2553d',
    '#ec4899': '#c2553d', '#d946ef': '#e8a87c', '#a855f7': '#e8a87c',
    '#8b5cf6': '#d4a27f', '#a78bfa': '#e8a87c', '#ef4444': '#b3372e',
    '#f97316': '#d97757', '#f59e0b': '#d9a066', '#eab308': '#d9a066',
    '#ff4500': '#d97757', '#39ff14': '#cf8a3e', '#00f5ff': '#a97e5f',
  };
  const COLOR_TABLES = ['life_areas', 'detox_apps', 'habits', 'finance_goals', 'workout_plan_days', 'content_niches'];
  for (const table of COLOR_TABLES) {
    const stmt = db.prepare(`UPDATE ${table} SET color = ? WHERE color = ? COLLATE NOCASE`);
    let total = 0;
    for (const [oldC, newC] of Object.entries(COLOR_REMAP)) {
      total += stmt.run(newC, oldC).changes;
    }
    if (total) console.log(`[migration] Warmed ${total} ${table} colors to paper palette`);
  }
} catch (e) {
  console.error('[migration] paper color remap failed:', e.message);
}

module.exports = db;
