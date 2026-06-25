const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET  /api/quotes
router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM quotes WHERE user_id = ? ORDER BY created_at DESC`
  ).all(req.user.id);
  res.json(rows);
});

// POST /api/quotes
router.post('/', (req, res) => {
  const { text, author } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Quote text required' });
  const info = db.prepare(
    `INSERT INTO quotes (user_id, text, author) VALUES (?, ?, ?)`
  ).run(req.user.id, text.trim(), author?.trim() || null);
  const row = db.prepare(`SELECT * FROM quotes WHERE id = ?`).get(info.lastInsertRowid);
  res.json(row);
});

// DELETE /api/quotes/:id
router.delete('/:id', (req, res) => {
  db.prepare(
    `DELETE FROM quotes WHERE id = ? AND user_id = ?`
  ).run(req.params.id, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
