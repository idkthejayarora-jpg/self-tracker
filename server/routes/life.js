const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Seed default life areas for new users
function seedDefaultAreas(userId) {
  const existing = db.prepare('SELECT id FROM life_areas WHERE user_id = ?').get(userId);
  if (existing) return;

  const defaults = [
    { name: 'Health & Fitness', icon: '💪', color: '#22c55e', sort_order: 0 },
    { name: 'Career & Work',    icon: '💼', color: '#0ea5e9', sort_order: 1 },
    { name: 'Relationships',    icon: '❤️',  color: '#f43f5e', sort_order: 2 },
    { name: 'Finance',          icon: '💰', color: '#f59e0b', sort_order: 3 },
    { name: 'Learning',         icon: '📚', color: '#a855f7', sort_order: 4 },
    { name: 'Personal Growth',  icon: '🌱', color: '#14b8a6', sort_order: 5 },
    { name: 'Fun & Hobbies',    icon: '🎮', color: '#f97316', sort_order: 6 },
    { name: 'Spirituality',     icon: '🧘', color: '#8b5cf6', sort_order: 7 },
  ];

  const insert = db.prepare('INSERT INTO life_areas (user_id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)');
  defaults.forEach(a => insert.run(userId, a.name, a.icon, a.color, a.sort_order));
}

// ── Life Areas ────────────────────────────────────────────────
router.get('/areas', (req, res) => {
  seedDefaultAreas(req.user.id);

  const areas = db.prepare('SELECT * FROM life_areas WHERE user_id = ? ORDER BY sort_order, id').all(req.user.id);
  const milestones = db.prepare(`
    SELECT lm.* FROM life_milestones lm
    JOIN life_areas la ON la.id = lm.area_id
    WHERE la.user_id = ?
    ORDER BY lm.sort_order, lm.id
  `).all(req.user.id);

  const result = areas.map(a => ({
    ...a,
    milestones: milestones.filter(m => m.area_id === a.id),
  }));

  res.json(result);
});

router.post('/areas', (req, res) => {
  const { name, icon, color, vision } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM life_areas WHERE user_id = ?').get(req.user.id);
  const r = db.prepare('INSERT INTO life_areas (user_id, name, icon, color, vision, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, name, icon || '🎯', color || '#6366f1', vision || null, (maxOrder.m ?? -1) + 1
  );
  res.status(201).json(db.prepare('SELECT * FROM life_areas WHERE id = ?').get(r.lastInsertRowid));
});

router.patch('/areas/:id', (req, res) => {
  const { name, icon, color, vision, progress } = req.body;
  db.prepare(`
    UPDATE life_areas SET
      name     = COALESCE(?, name),
      icon     = COALESCE(?, icon),
      color    = COALESCE(?, color),
      vision   = COALESCE(?, vision),
      progress = COALESCE(?, progress)
    WHERE id = ? AND user_id = ?
  `).run(name, icon, color, vision, progress ?? null, req.params.id, req.user.id);
  res.json(db.prepare('SELECT * FROM life_areas WHERE id = ?').get(req.params.id));
});

router.delete('/areas/:id', (req, res) => {
  const info = db.prepare('DELETE FROM life_areas WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Milestones ────────────────────────────────────────────────
router.post('/areas/:id/milestones', (req, res) => {
  const { title, target_date } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM life_milestones WHERE area_id = ?').get(req.params.id);
  const r = db.prepare('INSERT INTO life_milestones (area_id, title, target_date, sort_order) VALUES (?, ?, ?, ?)').run(
    req.params.id, title, target_date || null, (maxOrder.m ?? -1) + 1
  );
  res.status(201).json(db.prepare('SELECT * FROM life_milestones WHERE id = ?').get(r.lastInsertRowid));
});

router.patch('/milestones/:id', (req, res) => {
  const { title, completed, target_date } = req.body;
  const completedAt = completed === true ? new Date().toISOString() : (completed === false ? null : undefined);
  db.prepare(`
    UPDATE life_milestones SET
      title        = COALESCE(?, title),
      completed    = COALESCE(?, completed),
      completed_at = CASE WHEN ? IS NOT NULL THEN ? ELSE completed_at END,
      target_date  = COALESCE(?, target_date)
    WHERE id = ?
  `).run(title, completed !== undefined ? (completed ? 1 : 0) : null,
    completedAt, completedAt, target_date, req.params.id);
  res.json(db.prepare('SELECT * FROM life_milestones WHERE id = ?').get(req.params.id));
});

router.delete('/milestones/:id', (req, res) => {
  const info = db.prepare('DELETE FROM life_milestones WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Overall life score ─────────────────────────────────────────
router.get('/score', (req, res) => {
  seedDefaultAreas(req.user.id);
  const areas = db.prepare('SELECT progress FROM life_areas WHERE user_id = ?').all(req.user.id);
  const score = areas.length
    ? Math.round(areas.reduce((s, a) => s + a.progress, 0) / areas.length)
    : 0;
  res.json({ score, areas: areas.length });
});

module.exports = router;
