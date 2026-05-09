const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const db = require('../db/database');

router.use(authMiddleware);

// GET / — list all habits for user
router.get('/', (req, res) => {
  const habits = db.prepare('SELECT * FROM habits WHERE user_id = ? ORDER BY sort_order, created_at').all(req.user.id);
  res.json(habits);
});

// POST / — create habit
router.post('/', (req, res) => {
  const { name, icon = '✅', category = 'discipline', color = '#6366f1', sort_order = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare(
    'INSERT INTO habits (user_id, name, icon, category, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, name, icon, category, color, sort_order);
  const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(habit);
});

// DELETE /:id
router.delete('/:id', (req, res) => {
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!habit) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM habits WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /logs?date=YYYY-MM-DD — habits with done status for a date
router.get('/logs', (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const habits = db.prepare('SELECT * FROM habits WHERE user_id = ? ORDER BY sort_order, created_at').all(req.user.id);
  const logs = db.prepare('SELECT * FROM habit_logs WHERE user_id = ? AND date = ?').all(req.user.id, date);
  const logMap = {};
  logs.forEach(l => { logMap[l.habit_id] = l; });
  const result = habits.map(h => ({
    ...h,
    done: logMap[h.id] ? !!logMap[h.id].done : false,
    log_id: logMap[h.id]?.id ?? null,
  }));
  res.json(result);
});

// PUT /log/:habitId — upsert log for today (toggle done)
router.put('/log/:habitId', (req, res) => {
  const { date, done, note } = req.body;
  const logDate = date || new Date().toISOString().slice(0, 10);
  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(req.params.habitId, req.user.id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });

  db.prepare(`
    INSERT INTO habit_logs (user_id, habit_id, date, done, note)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, habit_id, date) DO UPDATE SET done = excluded.done, note = excluded.note
  `).run(req.user.id, req.params.habitId, logDate, done ? 1 : 0, note || null);

  const log = db.prepare('SELECT * FROM habit_logs WHERE user_id = ? AND habit_id = ? AND date = ?')
    .get(req.user.id, req.params.habitId, logDate);
  res.json(log);
});

// GET /streaks — per-habit current streak
router.get('/streaks', (req, res) => {
  const habits = db.prepare('SELECT * FROM habits WHERE user_id = ?').all(req.user.id);
  const today = new Date().toISOString().slice(0, 10);

  const streaks = habits.map(h => {
    const logs = db.prepare(
      'SELECT date FROM habit_logs WHERE user_id = ? AND habit_id = ? AND done = 1 ORDER BY date DESC'
    ).all(req.user.id, h.id);

    let streak = 0;
    let expected = today;
    for (const log of logs) {
      if (log.date === expected) {
        streak++;
        const d = new Date(expected);
        d.setDate(d.getDate() - 1);
        expected = d.toISOString().slice(0, 10);
      } else if (log.date < expected) {
        break;
      }
    }
    return { habit_id: h.id, name: h.name, streak };
  });

  res.json(streaks);
});

// GET /week?date=YYYY-MM-DD — 7-day dot grid (last 7 days ending on date)
router.get('/week', (req, res) => {
  const endDate = req.query.date || new Date().toISOString().slice(0, 10);
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const habits = db.prepare('SELECT * FROM habits WHERE user_id = ? ORDER BY sort_order, created_at').all(req.user.id);
  const logs = db.prepare(
    `SELECT habit_id, date, done FROM habit_logs WHERE user_id = ? AND date >= ? AND date <= ?`
  ).all(req.user.id, dates[0], dates[6]);

  const logMap = {};
  logs.forEach(l => {
    const key = `${l.habit_id}_${l.date}`;
    logMap[key] = !!l.done;
  });

  const result = habits.map(h => ({
    ...h,
    week: dates.map(d => ({ date: d, done: logMap[`${h.id}_${d}`] ?? false })),
  }));

  res.json({ dates, habits: result });
});

module.exports = router;
