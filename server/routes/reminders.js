const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', (req, res) => {
  const reminders = db.prepare(`
    SELECT r.*, t.title as task_title FROM reminders r
    LEFT JOIN tasks t ON r.related_task_id = t.id
    WHERE r.user_id = ? AND r.status != 'dismissed'
    ORDER BY r.remind_at ASC
  `).all(req.user.id);
  res.json(reminders);
});

// Due-now: pending reminders whose remind_at has passed (or snoozed_until has passed)
router.get('/due-now', (req, res) => {
  const now = new Date().toISOString();
  const due = db.prepare(`
    SELECT * FROM reminders WHERE user_id = ? AND status != 'dismissed'
    AND (
      (status = 'pending' AND remind_at <= ?)
      OR (status = 'snoozed' AND snoozed_until <= ?)
    )
  `).all(req.user.id, now, now);
  res.json(due);
});

router.post('/', (req, res) => {
  const { title, description, remind_at, repeat, related_task_id } = req.body;
  if (!title || !remind_at) return res.status(400).json({ error: 'Title and remind_at required' });

  const result = db.prepare(`
    INSERT INTO reminders (user_id, title, description, remind_at, repeat, related_task_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, title, description || null, remind_at, repeat || 'none', related_task_id || null);

  res.status(201).json(db.prepare('SELECT * FROM reminders WHERE id = ?').get(result.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const reminder = db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!reminder) return res.status(404).json({ error: 'Not found' });

  const { status, snoozed_until, title, description, remind_at, repeat } = req.body;

  let newRemindAt = remind_at || reminder.remind_at;

  // Auto-advance recurring reminders on dismiss
  if (status === 'dismissed' && reminder.repeat !== 'none') {
    const d = new Date(reminder.remind_at);
    if (reminder.repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (reminder.repeat === 'weekly') d.setDate(d.getDate() + 7);
    newRemindAt = d.toISOString();

    db.prepare(`
      UPDATE reminders SET status = 'pending', remind_at = ?, snoozed_until = NULL
      WHERE id = ?
    `).run(newRemindAt, req.params.id);
  } else {
    db.prepare(`
      UPDATE reminders SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        remind_at = COALESCE(?, remind_at),
        repeat = COALESCE(?, repeat),
        status = COALESCE(?, status),
        snoozed_until = COALESCE(?, snoozed_until)
      WHERE id = ? AND user_id = ?
    `).run(title, description, remind_at, repeat, status, snoozed_until,
      req.params.id, req.user.id);
  }

  res.json(db.prepare('SELECT * FROM reminders WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
