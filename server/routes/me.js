const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const db = require('../db/database');
const { getTotalPoints } = require('../utils/pointsUtils');

router.use(authMiddleware);

// ── Rank helpers ──────────────────────────────────────────────────────────────
const RANKS = [
  { rank: 'E',   min: 0,      color: '#6b7280' },
  { rank: 'D',   min: 500,    color: '#3b82f6' },
  { rank: 'C',   min: 1500,   color: '#22c55e' },
  { rank: 'B',   min: 3500,   color: '#a855f7' },
  { rank: 'A',   min: 7000,   color: '#f97316' },
  { rank: 'S',   min: 12000,  color: '#ef4444' },
  { rank: 'SS',  min: 20000,  color: '#f59e0b' },
  { rank: 'SSS', min: 35000,  color: '#e2c97e' },
];

function getRank(pts) {
  let r = RANKS[0];
  for (const rank of RANKS) { if (pts >= rank.min) r = rank; }
  return r;
}

// ── GET /summary ─ everything in one shot ─────────────────────────────────────
router.get('/summary', (req, res) => {
  const uid = req.user.id;

  // Profile
  const profile = db.prepare('SELECT * FROM me_profile WHERE user_id = ?').get(uid) || {
    character_name: '', title: '', class: '', bio: '', adventure: '', avatar_emoji: '⚔️',
  };

  // Rank
  const totalPoints = getTotalPoints(uid);
  const rankInfo = getRank(totalPoints);

  // ── Stats ──
  // STRENGTH: workout sessions this month
  const workoutSessions = (db.prepare(
    "SELECT COUNT(*) as n FROM workout_sessions WHERE user_id=? AND strftime('%Y-%m',date)=strftime('%Y-%m','now')"
  ).get(uid) || {}).n || 0;
  const strength = Math.min(100, Math.round((workoutSessions / 20) * 100));

  // VITALITY: avg sleep quality last 7 nights
  const sleepRow = db.prepare(
    "SELECT AVG(quality) as q FROM sleep_logs WHERE user_id=? AND date >= date('now','-7 days')"
  ).get(uid);
  const vitality = sleepRow?.q ? Math.round(sleepRow.q * 20) : 0;

  // DISCIPLINE: habit completion rate this week
  const habitTotal = (db.prepare('SELECT COUNT(*) as n FROM habits WHERE user_id=?').get(uid) || {}).n || 0;
  const habitDone = (db.prepare(
    "SELECT COUNT(*) as n FROM habit_logs WHERE user_id=? AND done=1 AND date >= date('now','-7 days')"
  ).get(uid) || {}).n || 0;
  const maxHabitDays = habitTotal * 7;
  const discipline = maxHabitDays > 0 ? Math.min(100, Math.round((habitDone / maxHabitDays) * 100)) : 0;

  // FOCUS: task completion rate this month
  const taskTotal = (db.prepare(
    "SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND created_at >= date('now','start of month')"
  ).get(uid) || {}).n || 0;
  const taskDone = (db.prepare(
    "SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND status='completed' AND completed_at >= date('now','start of month')"
  ).get(uid) || {}).n || 0;
  const focus = taskTotal > 0 ? Math.min(100, Math.round((taskDone / taskTotal) * 100)) : 0;

  // ENDURANCE: longest streak
  const longestStreak = (db.prepare(
    'SELECT MAX(longest_streak) as m FROM streaks WHERE user_id=?'
  ).get(uid) || {}).m || 0;
  const endurance = Math.min(100, Math.round((longestStreak / 30) * 100));

  // WEALTH: finance net this month → 0-100 (50 = break-even)
  const finRow = db.prepare(
    "SELECT SUM(CASE WHEN type='income' THEN amount ELSE -amount END) as net FROM finance_entries WHERE user_id=? AND strftime('%Y-%m',date)=strftime('%Y-%m','now')"
  ).get(uid);
  const net = finRow?.net || 0;
  const wealth = net >= 0
    ? Math.min(100, 50 + Math.round((net / 10000) * 50))
    : Math.max(0,  50 - Math.round((Math.abs(net) / 10000) * 50));

  const stats = { strength, vitality, discipline, focus, endurance, wealth };

  // ── Collections ──
  const skills  = db.prepare('SELECT * FROM me_skills  WHERE user_id=? ORDER BY sort_order, created_at').all(uid);
  const claims  = db.prepare('SELECT * FROM me_claims  WHERE user_id=? ORDER BY sort_order, created_at').all(uid);
  const mentors = db.prepare('SELECT * FROM me_mentors WHERE user_id=? ORDER BY sort_order, created_at').all(uid);

  res.json({
    profile,
    rank: rankInfo.rank,
    rankColor: rankInfo.color,
    totalPoints,
    stats,
    skills,
    claims,
    mentors,
  });
});

// ── Profile ───────────────────────────────────────────────────────────────────
router.put('/profile', (req, res) => {
  const uid = req.user.id;
  const { character_name = '', title = '', class: cls = '', bio = '', adventure = '', avatar_emoji = '⚔️' } = req.body;
  db.prepare(`
    INSERT INTO me_profile (user_id, character_name, title, class, bio, adventure, avatar_emoji, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      character_name=excluded.character_name, title=excluded.title,
      class=excluded.class, bio=excluded.bio, adventure=excluded.adventure,
      avatar_emoji=excluded.avatar_emoji, updated_at=CURRENT_TIMESTAMP
  `).run(uid, character_name, title, cls, bio, adventure, avatar_emoji);
  res.json({ ok: true });
});

// ── Skills ────────────────────────────────────────────────────────────────────
router.get('/skills', (req, res) => {
  res.json(db.prepare('SELECT * FROM me_skills WHERE user_id=? ORDER BY sort_order, created_at').all(req.user.id));
});

router.post('/skills', (req, res) => {
  const uid = req.user.id;
  const { name, description = '', level = 1, xp = 0, icon = '⚡', category = 'general', sort_order = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const r = db.prepare(
    'INSERT INTO me_skills (user_id,name,description,level,xp,icon,category,sort_order) VALUES (?,?,?,?,?,?,?,?)'
  ).run(uid, name, description, level, xp, icon, category, sort_order);
  res.status(201).json(db.prepare('SELECT * FROM me_skills WHERE id=?').get(r.lastInsertRowid));
});

router.patch('/skills/:id', (req, res) => {
  const uid = req.user.id;
  const skill = db.prepare('SELECT * FROM me_skills WHERE id=? AND user_id=?').get(req.params.id, uid);
  if (!skill) return res.status(404).json({ error: 'Not found' });
  const { name, description, level, xp, icon, category, sort_order } = req.body;
  db.prepare(`UPDATE me_skills SET
    name=COALESCE(?,name), description=COALESCE(?,description), level=COALESCE(?,level),
    xp=COALESCE(?,xp), icon=COALESCE(?,icon), category=COALESCE(?,category),
    sort_order=COALESCE(?,sort_order)
    WHERE id=?`
  ).run(name??null, description??null, level??null, xp??null, icon??null, category??null, sort_order??null, req.params.id);
  res.json(db.prepare('SELECT * FROM me_skills WHERE id=?').get(req.params.id));
});

router.delete('/skills/:id', (req, res) => {
  db.prepare('DELETE FROM me_skills WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ── Claims ────────────────────────────────────────────────────────────────────
router.get('/claims', (req, res) => {
  res.json(db.prepare('SELECT * FROM me_claims WHERE user_id=? ORDER BY sort_order, created_at').all(req.user.id));
});

router.post('/claims', (req, res) => {
  const uid = req.user.id;
  const { title, description='', claim_type='quest', deadline=null, reward_text='', icon='🎯', sort_order=0 } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const r = db.prepare(
    'INSERT INTO me_claims (user_id,title,description,claim_type,deadline,reward_text,icon,sort_order) VALUES (?,?,?,?,?,?,?,?)'
  ).run(uid, title, description, claim_type, deadline, reward_text, icon, sort_order);
  res.status(201).json(db.prepare('SELECT * FROM me_claims WHERE id=?').get(r.lastInsertRowid));
});

router.patch('/claims/:id', (req, res) => {
  const uid = req.user.id;
  const claim = db.prepare('SELECT * FROM me_claims WHERE id=? AND user_id=?').get(req.params.id, uid);
  if (!claim) return res.status(404).json({ error: 'Not found' });
  const { title, description, claim_type, status, deadline, reward_text, icon } = req.body;
  db.prepare(`UPDATE me_claims SET
    title=COALESCE(?,title), description=COALESCE(?,description),
    claim_type=COALESCE(?,claim_type), status=COALESCE(?,status),
    deadline=COALESCE(?,deadline), reward_text=COALESCE(?,reward_text), icon=COALESCE(?,icon)
    WHERE id=?`
  ).run(title??null, description??null, claim_type??null, status??null, deadline??null, reward_text??null, icon??null, req.params.id);
  res.json(db.prepare('SELECT * FROM me_claims WHERE id=?').get(req.params.id));
});

router.delete('/claims/:id', (req, res) => {
  db.prepare('DELETE FROM me_claims WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ── Mentors ───────────────────────────────────────────────────────────────────
router.get('/mentors', (req, res) => {
  res.json(db.prepare('SELECT * FROM me_mentors WHERE user_id=? ORDER BY sort_order, created_at').all(req.user.id));
});

router.post('/mentors', (req, res) => {
  const uid = req.user.id;
  const { name, era='', domain='', trait='', progress=0, icon='👤', notes='', sort_order=0 } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const r = db.prepare(
    'INSERT INTO me_mentors (user_id,name,era,domain,trait,progress,icon,notes,sort_order) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(uid, name, era, domain, trait, progress, icon, notes, sort_order);
  res.status(201).json(db.prepare('SELECT * FROM me_mentors WHERE id=?').get(r.lastInsertRowid));
});

router.patch('/mentors/:id', (req, res) => {
  const uid = req.user.id;
  const mentor = db.prepare('SELECT * FROM me_mentors WHERE id=? AND user_id=?').get(req.params.id, uid);
  if (!mentor) return res.status(404).json({ error: 'Not found' });
  const { name, era, domain, trait, progress, icon, notes } = req.body;
  db.prepare(`UPDATE me_mentors SET
    name=COALESCE(?,name), era=COALESCE(?,era), domain=COALESCE(?,domain),
    trait=COALESCE(?,trait), progress=COALESCE(?,progress), icon=COALESCE(?,icon), notes=COALESCE(?,notes)
    WHERE id=?`
  ).run(name??null, era??null, domain??null, trait??null, progress??null, icon??null, notes??null, req.params.id);
  res.json(db.prepare('SELECT * FROM me_mentors WHERE id=?').get(req.params.id));
});

router.delete('/mentors/:id', (req, res) => {
  db.prepare('DELETE FROM me_mentors WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
