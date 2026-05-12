const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { updateStreak } = require('../utils/streakUtils');
const { awardPoints } = require('../utils/pointsUtils');

router.use(authMiddleware);

// ── Exercises ─────────────────────────────────────────────────
router.get('/exercises', (req, res) => {
  res.json(db.prepare('SELECT * FROM exercises WHERE user_id = ? ORDER BY category, name').all(req.user.id));
});

router.post('/exercises', (req, res) => {
  const { name, category } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const r = db.prepare('INSERT INTO exercises (user_id, name, category) VALUES (?, ?, ?)').run(req.user.id, name, category || 'other');
  res.status(201).json(db.prepare('SELECT * FROM exercises WHERE id = ?').get(r.lastInsertRowid));
});

router.delete('/exercises/:id', (req, res) => {
  const info = db.prepare('DELETE FROM exercises WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Sessions ──────────────────────────────────────────────────
router.get('/sessions', (req, res) => {
  const sessions = db.prepare(`
    SELECT s.*,
      COUNT(DISTINCT ws.exercise_id) as exercise_count,
      COUNT(ws.id) as set_count
    FROM workout_sessions s
    LEFT JOIN workout_sets ws ON ws.session_id = s.id
    WHERE s.user_id = ?
    GROUP BY s.id
    ORDER BY s.date DESC, s.created_at DESC
  `).all(req.user.id);
  res.json(sessions);
});

router.post('/sessions', (req, res) => {
  const { date, name, notes } = req.body;
  if (!date) return res.status(400).json({ error: 'Date required' });
  const r = db.prepare('INSERT INTO workout_sessions (user_id, date, name, notes) VALUES (?, ?, ?, ?)').run(req.user.id, date, name || null, notes || null);
  updateStreak(req.user.id, 'workout');
  awardPoints(req.user.id, 'workout', 'session', 30, r.lastInsertRowid, name || null);
  res.status(201).json(db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(r.lastInsertRowid));
});

router.patch('/sessions/:id', (req, res) => {
  const { name, notes } = req.body;
  db.prepare('UPDATE workout_sessions SET name = COALESCE(?, name), notes = COALESCE(?, notes) WHERE id = ? AND user_id = ?').run(name, notes, req.params.id, req.user.id);
  res.json(db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(req.params.id));
});

router.delete('/sessions/:id', (req, res) => {
  const info = db.prepare('DELETE FROM workout_sessions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Sets within a session ─────────────────────────────────────
router.get('/sessions/:id/sets', (req, res) => {
  const sets = db.prepare(`
    SELECT ws.*, e.name as exercise_name, e.category
    FROM workout_sets ws
    JOIN exercises e ON e.id = ws.exercise_id
    WHERE ws.session_id = ?
    ORDER BY ws.sort_order, ws.id
  `).all(req.params.id);
  res.json(sets);
});

router.post('/sessions/:id/sets', (req, res) => {
  const { exercise_id, reps, weight, duration_seconds } = req.body;
  if (!exercise_id) return res.status(400).json({ error: 'exercise_id required' });

  // Verify session belongs to this user
  const session = db.prepare('SELECT id FROM workout_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Verify exercise belongs to this user
  const exercise = db.prepare('SELECT id FROM exercises WHERE id = ? AND user_id = ?').get(exercise_id, req.user.id);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM workout_sets WHERE session_id = ?').get(req.params.id);
  const order = (maxOrder.m ?? -1) + 1;

  const r = db.prepare('INSERT INTO workout_sets (session_id, exercise_id, reps, weight, duration_seconds, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.params.id, exercise_id, reps || null, weight || null, duration_seconds || null, order
  );
  res.status(201).json(db.prepare('SELECT ws.*, e.name as exercise_name, e.category FROM workout_sets ws JOIN exercises e ON e.id = ws.exercise_id WHERE ws.id = ?').get(r.lastInsertRowid));
});

router.patch('/sets/:id', (req, res) => {
  const { reps, weight, duration_seconds } = req.body;
  db.prepare('UPDATE workout_sets SET reps = COALESCE(?, reps), weight = COALESCE(?, weight), duration_seconds = COALESCE(?, duration_seconds) WHERE id = ?').run(reps, weight, duration_seconds, req.params.id);
  res.json(db.prepare('SELECT ws.*, e.name as exercise_name FROM workout_sets ws JOIN exercises e ON e.id = ws.exercise_id WHERE ws.id = ?').get(req.params.id));
});

router.delete('/sets/:id', (req, res) => {
  const info = db.prepare('DELETE FROM workout_sets WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Exercise progress (max weight over time) ──────────────────
router.get('/exercises/:id/progress', (req, res) => {
  const data = db.prepare(`
    SELECT s.date,
      MAX(ws.weight) as max_weight,
      SUM(ws.reps) as total_reps,
      COUNT(ws.id) as sets
    FROM workout_sets ws
    JOIN workout_sessions s ON s.id = ws.session_id
    WHERE ws.exercise_id = ? AND s.user_id = ? AND ws.weight IS NOT NULL
    GROUP BY s.date
    ORDER BY s.date ASC
  `).all(req.params.id, req.user.id);
  res.json(data);
});

// ── Weekly volume summary ─────────────────────────────────────
router.get('/stats', (req, res) => {
  const uid = req.user.id;

  // Sessions per week (last 8 weeks)
  const weekly = db.prepare(`
    SELECT strftime('%Y-W%W', date) as week,
      COUNT(*) as sessions,
      COUNT(DISTINCT date) as days
    FROM workout_sessions
    WHERE user_id = ? AND date >= date('now', '-56 days')
    GROUP BY week
    ORDER BY week ASC
  `).all(uid);

  // Personal bests per exercise
  const pbs = db.prepare(`
    SELECT e.name, e.category,
      MAX(ws.weight) as max_weight,
      MAX(ws.reps) as max_reps
    FROM workout_sets ws
    JOIN exercises e ON e.id = ws.exercise_id
    JOIN workout_sessions s ON s.id = ws.session_id
    WHERE s.user_id = ?
    GROUP BY e.id
    ORDER BY e.category, e.name
  `).all(uid);

  res.json({ weekly, pbs });
});

module.exports = router;
