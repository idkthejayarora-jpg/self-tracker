const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const db = require('../db/database');
const { awardPoints, applySkillXP } = require('../utils/pointsUtils');
const { localDate, SQL_NOW, sqlDateOf } = require('../utils/dateUtils');

router.use(authMiddleware);

// GET / — last 30 entries
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM body_stats WHERE user_id = ? ORDER BY date DESC LIMIT 30'
  ).all(req.user.id);
  res.json(rows);
});

// GET /latest — most recent entry
router.get('/latest', (req, res) => {
  const row = db.prepare(
    'SELECT * FROM body_stats WHERE user_id = ? ORDER BY date DESC LIMIT 1'
  ).get(req.user.id);
  res.json(row || null);
});

// POST / — upsert for date
router.post('/', (req, res) => {
  const { date, weight_kg, body_fat_pct, chest_cm, waist_cm, hips_cm, neck_cm, bicep_cm, notes } = req.body;
  const logDate = date || localDate();

  db.prepare(`
    INSERT INTO body_stats (user_id, date, weight_kg, body_fat_pct, chest_cm, waist_cm, hips_cm, neck_cm, bicep_cm, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      weight_kg    = excluded.weight_kg,
      body_fat_pct = excluded.body_fat_pct,
      chest_cm     = excluded.chest_cm,
      waist_cm     = excluded.waist_cm,
      hips_cm      = excluded.hips_cm,
      neck_cm      = excluded.neck_cm,
      bicep_cm     = excluded.bicep_cm,
      notes        = excluded.notes
  `).run(req.user.id, logDate, weight_kg ?? null, body_fat_pct ?? null, chest_cm ?? null, waist_cm ?? null,
         hips_cm ?? null, neck_cm ?? null, bicep_cm ?? null, notes ?? null);

  const row = db.prepare('SELECT * FROM body_stats WHERE user_id = ? AND date = ?').get(req.user.id, logDate);

  // Award 10 pts once per day for logging body stats
  const alreadyAwarded = db.prepare(
    `SELECT 1 FROM points_log WHERE user_id=? AND source='body' AND ${sqlDateOf('created_at')}=${SQL_NOW}`
  ).get(req.user.id);
  if (!alreadyAwarded) {
    awardPoints(req.user.id, 'body', 'log_stats', 10, null, logDate);
    applySkillXP(req.user.id, 'body', ['health','body','fitness','tracking']);
  }

  res.json(row);
});

// DELETE /:id
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM body_stats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM body_stats WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
