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

// Run schema
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
