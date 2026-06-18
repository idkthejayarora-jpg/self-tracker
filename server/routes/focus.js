const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { awardPoints } = require('../utils/pointsUtils');
const { computePriorityScore } = require('../utils/priorityScore');
const { localDate, SQL_OFF } = require('../utils/dateUtils');

router.use(authMiddleware);

// ── "What now?" — surface ONE next action, plus nudge counts ──────────────────
// ADHD: seeing everything is paralysing. Return a single best-next task and the
// counts that matter (overdue / due-today), nothing else.
router.get('/next', (req, res) => {
  const exclude = String(req.query.exclude || '').split(',').map(Number).filter(Boolean);
  const today = localDate();

  let tasks = db.prepare(
    `SELECT * FROM tasks WHERE user_id = ? AND status IN ('pending','in_progress')`
  ).all(req.user.id);

  // Hide snoozed tasks (follow-up parked in the future)
  const actionable = tasks.filter(t => !(t.follow_up_date && t.follow_up_date > today));

  const overdue = actionable.filter(t => t.due_date && t.due_date < today).length;
  const dueToday = actionable.filter(t => t.due_date === today).length;

  const pool = actionable.filter(t => !exclude.includes(t.id));
  const scored = pool
    .map(t => ({ ...t, priority_score: computePriorityScore(t) }))
    .sort((a, b) =>
      b.priority_score - a.priority_score ||
      String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))
    );

  res.json({
    task: scored[0] || null,
    remaining: actionable.length,
    pickable: pool.length,
    overdue,
    dueToday,
  });
});

// ── Today's focus stats (dopamine) ────────────────────────────────────────────
router.get('/today', (req, res) => {
  const today = localDate();
  const rows = db.prepare(
    `SELECT actual_seconds, completed, date(datetime(created_at, ${SQL_OFF})) AS d
     FROM focus_sessions WHERE user_id = ?`
  ).all(req.user.id);

  const todays = rows.filter(r => r.d === today);
  const sessions = todays.filter(r => r.completed).length;
  const seconds = todays.reduce((s, r) => s + (r.actual_seconds || 0), 0);

  // Streak: consecutive days (ending today or yesterday) with ≥1 completed block
  const doneDays = new Set(rows.filter(r => r.completed).map(r => r.d));
  let streak = 0;
  const cur = new Date(today + 'T12:00:00');
  if (!doneDays.has(today)) cur.setDate(cur.getDate() - 1); // grace: count from yesterday
  while (doneDays.has(cur.toISOString().slice(0, 10))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }

  res.json({ sessions, minutes: Math.round(seconds / 60), streak });
});

// ── Log a finished (or abandoned) focus block ─────────────────────────────────
router.post('/complete', (req, res) => {
  const { label = '', task_id = null, planned_minutes = 25, actual_seconds = 0, completed = false } = req.body;
  const mins = Math.round((actual_seconds || 0) / 60);

  const r = db.prepare(
    `INSERT INTO focus_sessions (user_id, label, task_id, planned_minutes, actual_seconds, completed)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(req.user.id, label || null, task_id || null, planned_minutes, actual_seconds, completed ? 1 : 0);

  // Dopamine: full block = solid reward; partial (≥5 min) = a little
  let points = 0;
  if (completed) points = 20;
  else if (mins >= 5) points = 8;
  if (points) awardPoints(req.user.id, 'focus', 'session', points, r.lastInsertRowid, label || `${mins} min focus`);

  res.status(201).json({ ok: true, id: r.lastInsertRowid, points });
});

module.exports = router;
