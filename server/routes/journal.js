const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { updateStreak, maybeUpdateOverallStreak } = require('../utils/streakUtils');

router.use(authMiddleware);

router.get('/', (req, res) => {
  const { limit = 30, offset = 0 } = req.query;
  const entries = db.prepare(`
    SELECT * FROM journal_entries WHERE user_id = ?
    ORDER BY date DESC LIMIT ? OFFSET ?
  `).all(req.user.id, Number(limit), Number(offset));
  res.json(entries);
});

router.get('/:date', (req, res) => {
  const entry = db.prepare('SELECT * FROM journal_entries WHERE user_id = ? AND date = ?')
    .get(req.user.id, req.params.date);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.json(entry);
});

// Upsert — one entry per day
router.put('/:date', (req, res) => {
  const { content, mood, tags } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO journal_entries (user_id, date, content, mood, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      content = excluded.content,
      mood = excluded.mood,
      tags = excluded.tags,
      updated_at = excluded.updated_at
  `).run(req.user.id, req.params.date, content, mood || null, JSON.stringify(tags || []), now, now);

  updateStreak(req.user.id, 'journal');
  maybeUpdateOverallStreak(req.user.id);

  res.json(db.prepare('SELECT * FROM journal_entries WHERE user_id = ? AND date = ?')
    .get(req.user.id, req.params.date));
});

router.delete('/:date', (req, res) => {
  const info = db.prepare('DELETE FROM journal_entries WHERE user_id = ? AND date = ?')
    .run(req.user.id, req.params.date);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
