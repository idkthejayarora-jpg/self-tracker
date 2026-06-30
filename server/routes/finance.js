const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const db = require('../db/database');

router.use(authMiddleware);

// GET /entries?month=YYYY-MM
router.get('/entries', (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const rows = db.prepare(
    `SELECT * FROM finance_entries WHERE user_id = ? AND date LIKE ? ORDER BY date DESC, created_at DESC`
  ).all(req.user.id, `${month}%`);
  res.json(rows);
});

// POST /entries
router.post('/entries', (req, res) => {
  const { date, type, category = 'other', amount, note } = req.body;
  if (!type || !amount) return res.status(400).json({ error: 'type and amount required' });
  const logDate = date || new Date().toISOString().slice(0, 10);
  const result = db.prepare(
    'INSERT INTO finance_entries (user_id, date, type, category, amount, note) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, logDate, type, category, amount, note || null);
  const row = db.prepare('SELECT * FROM finance_entries WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

// DELETE /entries/:id
router.delete('/entries/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM finance_entries WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM finance_entries WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /reset — wipe finance data. scope: 'month' | 'all' | 'everything'
// 'month' clears one month's transactions; 'all' clears every transaction;
// 'everything' also clears savings goals. Finance data feeds no points/rank
// state, so this is self-contained.
router.post('/reset', (req, res) => {
  const uid = req.user.id;
  const { scope = 'month', month } = req.body;
  let entriesDeleted = 0, goalsDeleted = 0;

  if (scope === 'month') {
    const m = month || new Date().toISOString().slice(0, 7);
    entriesDeleted = db.prepare('DELETE FROM finance_entries WHERE user_id = ? AND date LIKE ?').run(uid, `${m}%`).changes;
  } else if (scope === 'all') {
    entriesDeleted = db.prepare('DELETE FROM finance_entries WHERE user_id = ?').run(uid).changes;
  } else if (scope === 'everything') {
    db.transaction(() => {
      entriesDeleted = db.prepare('DELETE FROM finance_entries WHERE user_id = ?').run(uid).changes;
      goalsDeleted   = db.prepare('DELETE FROM finance_goals WHERE user_id = ?').run(uid).changes;
    })();
  } else {
    return res.status(400).json({ error: 'Invalid scope' });
  }

  res.json({ ok: true, entriesDeleted, goalsDeleted });
});

// GET /summary?month=YYYY-MM
router.get('/summary', (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const rows = db.prepare(
    `SELECT type, category, amount FROM finance_entries WHERE user_id = ? AND date LIKE ?`
  ).all(req.user.id, `${month}%`);

  let income = 0, expenses = 0;
  const byCategory = {};
  rows.forEach(r => {
    if (r.type === 'income') income += r.amount;
    else expenses += r.amount;
    if (!byCategory[r.category]) byCategory[r.category] = { income: 0, expense: 0 };
    byCategory[r.category][r.type] += r.amount;
  });

  const categories = Object.entries(byCategory).map(([cat, vals]) => ({
    category: cat, ...vals, net: vals.income - vals.expense,
  }));

  res.json({ income, expenses, net: income - expenses, categories });
});

// GET /goals
router.get('/goals', (req, res) => {
  const rows = db.prepare('SELECT * FROM finance_goals WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(rows);
});

// POST /goals
router.post('/goals', (req, res) => {
  const { name, target_amount, saved_amount = 0, deadline, color = '#d9a066' } = req.body;
  if (!name || !target_amount) return res.status(400).json({ error: 'name and target_amount required' });
  const result = db.prepare(
    'INSERT INTO finance_goals (user_id, name, target_amount, saved_amount, deadline, color) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, name, target_amount, saved_amount, deadline || null, color);
  const row = db.prepare('SELECT * FROM finance_goals WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

// PUT /goals/:id
router.put('/goals/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM finance_goals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { name, target_amount, saved_amount, deadline, color } = req.body;
  db.prepare(`
    UPDATE finance_goals SET
      name         = COALESCE(?, name),
      target_amount = COALESCE(?, target_amount),
      saved_amount = COALESCE(?, saved_amount),
      deadline     = COALESCE(?, deadline),
      color        = COALESCE(?, color)
    WHERE id = ?
  `).run(name ?? null, target_amount ?? null, saved_amount ?? null, deadline ?? null, color ?? null, req.params.id);
  const updated = db.prepare('SELECT * FROM finance_goals WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /goals/:id
router.delete('/goals/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM finance_goals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM finance_goals WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
