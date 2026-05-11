const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const db = require('../db/database');
const { updateStreak } = require('../utils/streakUtils');

router.use(authMiddleware);

// GET / — last 30 sleep logs
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM sleep_logs WHERE user_id = ? ORDER BY date DESC LIMIT 30'
  ).all(req.user.id);
  res.json(rows);
});

// GET /stats — avg last 7d, sleep debt
router.get('/stats', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

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
    ? Math.round(rows.reduce((s, r) => s + (480 - (r.duration_minutes || 480)), 0))
    : 0;

  res.json({ avgDuration, avgQuality, sleepDebt, count });
});

// POST / — upsert for date
router.post('/', (req, res) => {
  const { date, bedtime, wake_time, duration_minutes, quality, notes } = req.body;
  const logDate = date || new Date().toISOString().slice(0, 10);

  db.prepare(`
    INSERT INTO sleep_logs (user_id, date, bedtime, wake_time, duration_minutes, quality, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      bedtime          = excluded.bedtime,
      wake_time        = excluded.wake_time,
      duration_minutes = excluded.duration_minutes,
      quality          = excluded.quality,
      notes            = excluded.notes
  `).run(req.user.id, logDate, bedtime ?? null, wake_time ?? null,
         duration_minutes ?? null, quality ?? null, notes ?? null);

  const row = db.prepare('SELECT * FROM sleep_logs WHERE user_id = ? AND date = ?').get(req.user.id, logDate);
  updateStreak(req.user.id, 'sleep');
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
