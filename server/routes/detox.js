const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { localDate, SQL_NOW } = require('../utils/dateUtils');

router.use(authMiddleware);

// ── Apps ──────────────────────────────────────────────────────────────────────

router.get('/apps', (req, res) => {
  const apps = db.prepare(`SELECT * FROM detox_apps WHERE user_id=? ORDER BY sort_order,created_at`).all(req.user.id);
  res.json(apps);
});

router.post('/apps', (req, res) => {
  const { name, icon='📱', color='#6366f1', daily_limit_minutes=0 } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const r = db.prepare(`INSERT INTO detox_apps (user_id,name,icon,color,daily_limit_minutes) VALUES (?,?,?,?,?)`).run(req.user.id, name.trim(), icon, color, daily_limit_minutes);
  res.status(201).json(db.prepare('SELECT * FROM detox_apps WHERE id=?').get(r.lastInsertRowid));
});

router.delete('/apps/:id', (req, res) => {
  db.prepare('DELETE FROM detox_apps WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ── Daily logs ────────────────────────────────────────────────────────────────

router.get('/today', (req, res) => {
  const date = req.query.date || localDate();
  const apps = db.prepare(`SELECT * FROM detox_apps WHERE user_id=? ORDER BY sort_order,created_at`).all(req.user.id);
  const logs = db.prepare(`SELECT * FROM detox_logs WHERE user_id=? AND date=?`).all(req.user.id, date);
  const logMap = Object.fromEntries(logs.map(l => [l.app_id, l]));
  res.json(apps.map(a => ({ ...a, log: logMap[a.id] || null })));
});

router.put('/log/:appId', (req, res) => {
  const date = req.body.date || localDate();
  const { status='clean', minutes_used=0, note='' } = req.body;
  // verify app belongs to user
  const app = db.prepare('SELECT id FROM detox_apps WHERE id=? AND user_id=?').get(req.params.appId, req.user.id);
  if (!app) return res.status(404).json({ error: 'Not found' });
  db.prepare(`
    INSERT INTO detox_logs (user_id, app_id, date, status, minutes_used, note)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id,app_id,date) DO UPDATE SET status=excluded.status, minutes_used=excluded.minutes_used, note=excluded.note
  `).run(req.user.id, req.params.appId, date, status, minutes_used, note);
  res.json({ ok: true });
});

// ── Streaks per app ────────────────────────────────────────────────────────────

router.get('/streaks', (req, res) => {
  const apps = db.prepare(`SELECT * FROM detox_apps WHERE user_id=?`).all(req.user.id);
  const streaks = apps.map(app => {
    // Count consecutive clean days backwards from today
    const logs = db.prepare(`
      SELECT date, status FROM detox_logs
      WHERE user_id=? AND app_id=? AND date <= ${SQL_NOW}
      ORDER BY date DESC
    `).all(req.user.id, app.id);

    let streak = 0;
    let prev = null;
    for (const l of logs) {
      if (l.status !== 'clean') break;
      if (prev) {
        const diff = (new Date(prev) - new Date(l.date)) / 86400000;
        if (diff !== 1) break;
      }
      streak++;
      prev = l.date;
    }
    const longest = db.prepare(`
      SELECT COUNT(*) as c FROM detox_logs
      WHERE user_id=? AND app_id=? AND status='clean'
    `).get(req.user.id, app.id)?.c || 0;
    return { app_id: app.id, name: app.name, icon: app.icon, color: app.color, streak, longest };
  });
  res.json(streaks);
});

module.exports = router;
