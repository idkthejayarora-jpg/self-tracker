const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const db = require('../db/database');
const { updateStreak } = require('../utils/streakUtils');
const { awardPoints } = require('../utils/pointsUtils');
const { localDate, SQL_NOW, sqlDateOf, SQL_OFF } = require('../utils/dateUtils');

// ── One-time migration: remove UNIQUE(user_id, date) so multiple sleeps per day work ──
try {
  const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sleep_logs'").get();
  if (info?.sql?.includes('UNIQUE(user_id, date)')) {
    db.exec(`
      BEGIN;
      ALTER TABLE sleep_logs RENAME TO sleep_logs_old;
      CREATE TABLE sleep_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        bedtime TEXT,
        wake_time TEXT,
        duration_minutes INTEGER,
        quality INTEGER,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      INSERT INTO sleep_logs SELECT * FROM sleep_logs_old;
      DROP TABLE sleep_logs_old;
      COMMIT;
    `);
  }
} catch (e) { console.error('[sleep] migration error', e.message); }

router.use(authMiddleware);

// GET / — last 60 sleep log entries (multiple per day)
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM sleep_logs WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT 60'
  ).all(req.user.id);
  res.json(rows);
});

// GET /stats — avg last 7d, sleep debt
router.get('/stats', (req, res) => {
  const today = localDate();
  const weekAgoDate = new Date(today);
  weekAgoDate.setDate(weekAgoDate.getDate() - 7);
  const weekAgo = weekAgoDate.toISOString().slice(0, 10);

  const rows = db.prepare(
    'SELECT duration_minutes, quality FROM sleep_logs WHERE user_id = ? AND date >= ? AND date <= ?'
  ).all(req.user.id, weekAgo, today);

  const count = rows.length;
  const avgDuration = count
    ? Math.round(rows.reduce((s, r) => s + (r.duration_minutes || 0), 0) / count)
    : null;
  const avgQuality = count
    ? Math.round((rows.reduce((s, r) => s + (r.quality || 0), 0) / count) * 10) / 10
    : null;
  const sleepDebt = count
    ? Math.round(rows.reduce((s, r) => s + (420 - (r.duration_minutes || 420)), 0))
    : 0;

  res.json({ avgDuration, avgQuality, sleepDebt, count });
});

// POST / — insert new sleep entry (multiple per day supported)
router.post('/', (req, res) => {
  const { date, bedtime, wake_time, duration_minutes, quality, notes } = req.body;
  const logDate = date || localDate();

  const r = db.prepare(`
    INSERT INTO sleep_logs (user_id, date, bedtime, wake_time, duration_minutes, quality, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, logDate, bedtime ?? null, wake_time ?? null,
         duration_minutes ?? null, quality ?? null, notes ?? null);

  const row = db.prepare('SELECT * FROM sleep_logs WHERE id = ?').get(r.lastInsertRowid);
  updateStreak(req.user.id, 'sleep');

  // Award 15 pts once per day for logging sleep
  const alreadyAwarded = db.prepare(
    `SELECT 1 FROM points_log WHERE user_id=? AND source='sleep' AND ${sqlDateOf('created_at')}=${SQL_NOW}`
  ).get(req.user.id);
  if (!alreadyAwarded) {
    awardPoints(req.user.id, 'sleep', 'log', 15, null, logDate);
  }

  res.json(row);
});

// DELETE /:id
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM sleep_logs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM sleep_logs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
