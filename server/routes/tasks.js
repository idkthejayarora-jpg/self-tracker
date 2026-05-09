const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { updateStreak, maybeUpdateOverallStreak } = require('../utils/streakUtils');
const { computePriorityScore } = require('../utils/priorityScore');

router.use(authMiddleware);

router.get('/', (req, res) => {
  const { status, priority } = req.query;
  let sql = 'SELECT * FROM tasks WHERE user_id = ?';
  const params = [req.user.id];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (priority) { sql += ' AND priority = ?'; params.push(priority); }
  sql += " ORDER BY CASE status WHEN 'completed' THEN 1 WHEN 'cancelled' THEN 1 ELSE 0 END, due_date ASC, created_at ASC";
  res.json(db.prepare(sql).all(...params));
});

// Follow-up priority queue — pending/in_progress tasks sorted by computed score
router.get('/priority-queue', (req, res) => {
  const tasks = db.prepare(`
    SELECT * FROM tasks WHERE user_id = ? AND status IN ('pending','in_progress')
  `).all(req.user.id);

  const scored = tasks
    .map(t => ({ ...t, priority_score: computePriorityScore(t) }))
    .sort((a, b) => b.priority_score - a.priority_score);

  res.json(scored);
});

router.get('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  res.json(task);
});

router.post('/', (req, res) => {
  const { title, description, due_date, due_time, priority, is_recurring, recur_interval, follow_up_date, tags } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  const result = db.prepare(`
    INSERT INTO tasks (user_id, title, description, due_date, due_time, priority, is_recurring, recur_interval, follow_up_date, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, title, description || null, due_date || null, due_time || null,
    priority || 'medium', is_recurring ? 1 : 0, recur_interval || null, follow_up_date || null,
    JSON.stringify(tags || []));

  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Not found' });

  const body = req.body;
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  // Use provided value if key is present; otherwise keep existing.
  // Nullable fields: explicit '' or null clears the field.
  const title          = has('title')          ? (body.title || task.title)         : task.title;
  const description    = has('description')    ? (body.description || null)         : task.description;
  const due_date       = has('due_date')        ? (body.due_date   || null)         : task.due_date;
  const due_time       = has('due_time')        ? (body.due_time   || null)         : task.due_time;
  const priority       = has('priority')        ? (body.priority   || task.priority): task.priority;
  const status         = has('status')          ? body.status                       : task.status;
  const is_recurring   = has('is_recurring')    ? (body.is_recurring ? 1 : 0)      : task.is_recurring;
  const recur_interval = has('recur_interval')  ? (body.recur_interval || null)     : task.recur_interval;
  const follow_up_date = has('follow_up_date')  ? (body.follow_up_date || null)     : task.follow_up_date;
  const tags           = has('tags')            ? JSON.stringify(body.tags || [])   : task.tags;

  // Track deferred: pushing due_date forward on an overdue pending task
  let deferredCount = task.deferred_count;
  if (has('due_date') && due_date && due_date > task.due_date && task.status !== 'completed' && task.due_date) {
    const now = new Date().toISOString().slice(0, 10);
    if (task.due_date < now) deferredCount++;
  }

  // Handle completion
  let completedAt = task.completed_at;
  const justCompleted = status === 'completed' && task.status !== 'completed';
  if (justCompleted) {
    completedAt = new Date().toISOString();

    // Auto-recreate recurring task — use T12:00:00 to avoid UTC midnight edge case
    if (is_recurring && recur_interval) {
      const base = due_date || task.due_date;
      const d = base ? new Date(base + 'T12:00:00') : new Date();
      if (recur_interval === 'daily')        d.setDate(d.getDate() + 1);
      else if (recur_interval === 'weekly')  d.setDate(d.getDate() + 7);
      else if (recur_interval === 'monthly') d.setMonth(d.getMonth() + 1);

      db.prepare(`
        INSERT INTO tasks (user_id, title, description, due_date, due_time, priority, is_recurring, recur_interval, follow_up_date, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(task.user_id, title, description, d.toISOString().slice(0, 10),
        due_time, priority, is_recurring, recur_interval, null, tags);
    }
  } else if (status !== 'completed') {
    completedAt = null;
  }

  db.prepare(`
    UPDATE tasks SET
      title = ?, description = ?, due_date = ?, due_time = ?, priority = ?,
      status = ?, completed_at = ?, is_recurring = ?, recur_interval = ?,
      follow_up_date = ?, deferred_count = ?, tags = ?
    WHERE id = ? AND user_id = ?
  `).run(title, description, due_date, due_time, priority, status, completedAt,
    is_recurring, recur_interval, follow_up_date, deferredCount, tags,
    req.params.id, req.user.id);

  if (justCompleted) {
    updateStreak(req.user.id, 'tasks');
    maybeUpdateOverallStreak(req.user.id);
  }

  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
