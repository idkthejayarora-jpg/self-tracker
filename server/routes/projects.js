const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// ── Progress milestones: crossing each awards a one-shot bonus ────────────────
// The bonus scales with the threshold so finishing a project is a big payoff.
// Wired from tasks.js on task completion via awardProjectMilestones().
const MILESTONES = [
  { pct: 25,  action: 'milestone_25',  points: 20 },
  { pct: 50,  action: 'milestone_50',  points: 40 },
  { pct: 75,  action: 'milestone_75',  points: 60 },
  { pct: 100, action: 'milestone_100', points: 150 },
];

// Compute {total, done, pct} for a project's tasks.
function projectProgress(projectId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done
    FROM tasks WHERE project_id = ?
  `).get(projectId) || { total: 0, done: 0 };
  const total = row.total || 0;
  const done = row.done || 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, pct };
}

// ── GET /projects ─ list with live progress ───────────────────────────────────
router.get('/', (req, res) => {
  const projects = db.prepare(
    'SELECT * FROM projects WHERE user_id = ? ORDER BY status = \'done\', sort_order, created_at DESC'
  ).all(req.user.id);
  res.json(projects.map(p => ({ ...p, progress: projectProgress(p.id) })));
});

// ── GET /projects/:id/tasks ─ tasks belonging to a project ────────────────────
router.get('/:id/tasks', (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const tasks = db.prepare(`
    SELECT * FROM tasks WHERE user_id = ? AND project_id = ?
    ORDER BY CASE status WHEN 'completed' THEN 1 WHEN 'cancelled' THEN 1 ELSE 0 END,
             due_date ASC, created_at ASC
  `).all(req.user.id, req.params.id);
  res.json(tasks);
});

// ── POST /projects ────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { name, description = '', color = '#d97757', icon = '📁' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Project name required' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM projects WHERE user_id = ?').get(req.user.id).m;
  const info = db.prepare(`
    INSERT INTO projects (user_id, name, description, color, icon, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, name.trim(), description.trim(), color, icon, maxOrder + 1);
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...row, progress: { total: 0, done: 0, pct: 0 } });
});

// ── PATCH /projects/:id ───────────────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const { name, description, color, icon, status, sort_order } = req.body;
  db.prepare(`
    UPDATE projects SET
      name        = COALESCE(?, name),
      description = COALESCE(?, description),
      color       = COALESCE(?, color),
      icon        = COALESCE(?, icon),
      status      = COALESCE(?, status),
      sort_order  = COALESCE(?, sort_order)
    WHERE id = ? AND user_id = ?
  `).run(name ?? null, description ?? null, color ?? null, icon ?? null, status ?? null, sort_order ?? null,
    req.params.id, req.user.id);
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json({ ...row, progress: projectProgress(row.id) });
});

// ── DELETE /projects/:id ─ tasks keep existing (project_id → NULL via FK) ──────
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Milestone awarding — called from tasks.js after a project task completes ──
// Returns an array of {pct, points} bonuses newly awarded (for optional UI).
function awardProjectMilestones(userId, projectId) {
  try {
    const { awardPoints, alreadyAwardedEver } = require('../utils/pointsUtils');
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
    if (!project) return [];
    const { pct, total } = projectProgress(projectId);
    if (total === 0) return [];

    const awarded = [];
    for (const m of MILESTONES) {
      if (pct >= m.pct && !alreadyAwardedEver(userId, 'project', projectId, m.action)) {
        awardPoints(userId, 'project', m.action, m.points, projectId,
          `${project.name} — ${m.pct}% complete`);
        awarded.push({ pct: m.pct, points: m.points });
      }
    }
    // Auto-flip status to done at 100%
    if (pct >= 100 && project.status !== 'done') {
      db.prepare('UPDATE projects SET status = \'done\' WHERE id = ?').run(projectId);
    }
    return awarded;
  } catch (e) {
    console.error('[projects] milestone award failed:', e.message);
    return [];
  }
}

router.awardProjectMilestones = awardProjectMilestones;
module.exports = router;
