const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { updateStreak } = require('../utils/streakUtils');
const { awardPoints, applySkillXP } = require('../utils/pointsUtils');
const { localDate, SQL_OFF } = require('../utils/dateUtils');
const { parseWorkoutText } = require('../utils/workoutParser');
const EXERCISE_CATALOG = require('../utils/exerciseCatalog');

router.use(authMiddleware);

// ── Exercises ─────────────────────────────────────────────────
router.get('/exercises', (req, res) => {
  res.json(db.prepare('SELECT * FROM exercises WHERE user_id = ? ORDER BY category, name').all(req.user.id));
});

// GET /exercise-search?q= — the user's own exercises plus the built-in
// catalog, ranked. Own exercises carry their id; catalog hits are created
// on selection via POST /exercises.
router.get('/exercise-search', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  // catalogOnly → swap picker: the built-in library only, never the user's
  // own ad-hoc exercises.
  const catalogOnly = req.query.catalogOnly === '1' || req.query.catalogOnly === 'true';
  const mine = catalogOnly ? [] : db.prepare('SELECT * FROM exercises WHERE user_id = ? ORDER BY name').all(req.user.id);
  const mineNames = new Set(mine.map(m => m.name.toLowerCase()));

  const score = (name, keywords) => {
    if (!q) return 0;
    const n = name.toLowerCase();
    if (n === q) return 100;
    if (n.startsWith(q)) return 80;
    if (n.includes(q)) return 60;
    const kws = (keywords || []).map(k => k.toLowerCase());
    if (kws.some(k => k === q)) return 70;
    if (kws.some(k => k.startsWith(q) || k.includes(q))) return 50;
    // every query word appears somewhere
    const words = q.split(/\s+/).filter(Boolean);
    const hay = `${n} ${kws.join(' ')}`;
    if (words.length > 1 && words.every(w => hay.includes(w))) return 40;
    return 0;
  };

  const results = [];
  for (const m of mine) {
    const s = q ? score(m.name, []) : 1;
    if (s > 0 || !q) results.push({ id: m.id, name: m.name, category: m.category, muscle: 'My exercises', mine: true, _s: s + 5 }); // own exercises edge out catalog ties
  }
  for (const c of EXERCISE_CATALOG) {
    if (!catalogOnly && mineNames.has(c.name.toLowerCase())) continue; // already in their library
    // muscle-group queries ("chest", "biceps") surface the whole group
    const muscleHit = q && c.muscle.toLowerCase().startsWith(q) ? 45 : 0;
    const s = q ? Math.max(score(c.name, c.keywords), muscleHit) : 0;
    if (s > 0 || !q) results.push({ id: null, name: c.name, category: c.category, muscle: c.muscle, mine: false, _s: s });
  }

  // Searching → flat ranked shortlist. Empty query → the entire catalog,
  // in catalog order, so the client can render a browsable grouped list.
  if (q) {
    results.sort((a, b) => b._s - a._s || a.name.localeCompare(b.name));
    return res.json(results.slice(0, 15).map(({ _s, ...r }) => r));
  }
  res.json(results.map(({ _s, ...r }) => r));
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
  applySkillXP(req.user.id, 'workout', ['workout','strength','fitness', name || '']);
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
    WHERE user_id = ? AND date >= date('now', ${SQL_OFF}, '-56 days')
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

// ── Workout Plan ──────────────────────────────────────────────
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Plan days CRUD
router.get('/plan/days', (req, res) => {
  const days = db.prepare('SELECT * FROM workout_plan_days WHERE user_id=? ORDER BY sort_order,id').all(req.user.id);
  const exercises = db.prepare(`
    SELECT wpe.* FROM workout_plan_exercises wpe
    JOIN workout_plan_days wpd ON wpd.id = wpe.day_id
    WHERE wpd.user_id = ? ORDER BY wpe.sort_order, wpe.id
  `).all(req.user.id);
  const result = days.map(d => ({ ...d, exercises: exercises.filter(e => e.day_id === d.id) }));
  res.json(result);
});

router.post('/plan/days', (req, res) => {
  const { name, icon='💪', color='#d97757' } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM workout_plan_days WHERE user_id=?').get(req.user.id);
  const r = db.prepare('INSERT INTO workout_plan_days (user_id,name,icon,color,sort_order) VALUES (?,?,?,?,?)').run(req.user.id, name, icon, color, (maxOrder?.m ?? -1) + 1);
  const day = db.prepare('SELECT * FROM workout_plan_days WHERE id=?').get(r.lastInsertRowid);
  res.status(201).json({ ...day, exercises: [] });
});

router.patch('/plan/days/:id', (req, res) => {
  const { name, icon, color } = req.body;
  const existing = db.prepare('SELECT * FROM workout_plan_days WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE workout_plan_days SET name=?,icon=?,color=? WHERE id=?').run(name??existing.name, icon??existing.icon, color??existing.color, req.params.id);
  res.json(db.prepare('SELECT * FROM workout_plan_days WHERE id=?').get(req.params.id));
});

router.delete('/plan/days/:id', (req, res) => {
  db.prepare('DELETE FROM workout_plan_days WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// Exercises CRUD
router.post('/plan/days/:dayId/exercises', (req, res) => {
  const day = db.prepare('SELECT * FROM workout_plan_days WHERE id=? AND user_id=?').get(req.params.dayId, req.user.id);
  if (!day) return res.status(404).json({ error: 'Day not found' });
  const { name, sets=3, reps='8-12', weight='', notes='' } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM workout_plan_exercises WHERE day_id=?').get(req.params.dayId);
  const r = db.prepare('INSERT INTO workout_plan_exercises (day_id,name,sets,reps,weight,notes,sort_order) VALUES (?,?,?,?,?,?,?)').run(req.params.dayId, name, sets, reps, weight, notes, (maxOrder?.m ?? -1) + 1);
  res.status(201).json(db.prepare('SELECT * FROM workout_plan_exercises WHERE id=?').get(r.lastInsertRowid));
});

router.patch('/plan/exercises/:id', (req, res) => {
  const ex = db.prepare(`SELECT wpe.* FROM workout_plan_exercises wpe JOIN workout_plan_days wpd ON wpd.id=wpe.day_id WHERE wpe.id=? AND wpd.user_id=?`).get(req.params.id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { name, sets, reps, weight, notes } = req.body;
  db.prepare('UPDATE workout_plan_exercises SET name=?,sets=?,reps=?,weight=?,notes=? WHERE id=?').run(name??ex.name, sets??ex.sets, reps??ex.reps, weight??ex.weight, notes??ex.notes, req.params.id);
  res.json(db.prepare('SELECT * FROM workout_plan_exercises WHERE id=?').get(req.params.id));
});

router.delete('/plan/exercises/:id', (req, res) => {
  db.prepare('DELETE FROM workout_plan_exercises WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// One-click log from plan day
router.post('/plan/log/:dayId', (req, res) => {
  const day = db.prepare('SELECT * FROM workout_plan_days WHERE id=? AND user_id=?').get(req.params.dayId, req.user.id);
  if (!day) return res.status(404).json({ error: 'Day not found' });
  const exercises = db.prepare('SELECT * FROM workout_plan_exercises WHERE day_id=? ORDER BY sort_order').all(req.params.dayId);
  const today = localDate();
  const r = db.prepare('INSERT INTO workout_sessions (user_id, date, name, notes, plan_day_id) VALUES (?,?,?,?,?)').run(req.user.id, today, day.name, `${day.name} — from plan`, day.id);
  const sessionId = r.lastInsertRowid;
  // Pre-populate sets (1 set per exercise as placeholder)
  exercises.forEach(ex => {
    // Try to find exercise by name in user's exercise list
    let exercise = db.prepare('SELECT id FROM exercises WHERE user_id=? AND name=?').get(req.user.id, ex.name);
    if (!exercise) {
      const nr = db.prepare('INSERT INTO exercises (user_id,name) VALUES (?,?)').run(req.user.id, ex.name);
      exercise = { id: nr.lastInsertRowid };
    }
    db.prepare('INSERT INTO workout_sets (session_id,exercise_id,reps,weight,notes) VALUES (?,?,?,?,?)').run(sessionId, exercise.id, parseInt(ex.reps)||0, parseFloat(ex.weight)||0, `${ex.sets} sets × ${ex.reps}`);
  });
  res.status(201).json({ sessionId, day: day.name, exercisesAdded: exercises.length });
});

// ── Today's rotation ──────────────────────────────────────────
// PPL (or any split) repeats in plan order. "Today" = the day after the last
// completed plan day, wrapping around. Once you've started a plan day today,
// that day is locked in for the rest of the day.

function categoryForDay(name = '') {
  const n = name.toLowerCase();
  if (/push|chest|bench|press|shoulder|delt|tricep/.test(n)) return 'push';
  if (/pull|back|row|deadlift|bicep|lat|curl/.test(n))       return 'pull';
  if (/leg|squat|lunge|hamstring|quad|calf|glute/.test(n))   return 'legs';
  if (/cardio|run|hiit|cycle|condition/.test(n))             return 'cardio';
  if (/core|abs|plank/.test(n))                              return 'core';
  return 'other';
}

// Resolve the current rotation day for a user. Returns { day, sessionId, days } or null.
function getRotationDay(userId) {
  const days = db.prepare('SELECT * FROM workout_plan_days WHERE user_id=? ORDER BY sort_order, id').all(userId);
  if (!days.length) return null;
  const today = localDate();

  // Already started a plan day today → lock onto it.
  const todaySession = db.prepare(
    'SELECT * FROM workout_sessions WHERE user_id=? AND date=? AND plan_day_id IS NOT NULL ORDER BY created_at DESC LIMIT 1'
  ).get(userId, today);
  if (todaySession) {
    const day = days.find(d => d.id === todaySession.plan_day_id);
    if (day) return { day, sessionId: todaySession.id, days };
  }

  // Otherwise advance one step past the most recent *worked* plan day — only
  // sessions with logged sets count, so empty "preview" switches don't drift it.
  const last = db.prepare(`
    SELECT s.* FROM workout_sessions s
    WHERE s.user_id=? AND s.plan_day_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM workout_sets ws WHERE ws.session_id = s.id)
    ORDER BY s.date DESC, s.created_at DESC LIMIT 1
  `).get(userId);
  let idx = 0;
  if (last) {
    const lastIdx = days.findIndex(d => d.id === last.plan_day_id);
    if (lastIdx !== -1) idx = (lastIdx + 1) % days.length;
  }
  return { day: days[idx], sessionId: null, days };
}

// Create (without awarding) or fetch today's session for a plan day.
function ensureTodaySession(userId, day) {
  const today = localDate();
  const existing = db.prepare(
    'SELECT * FROM workout_sessions WHERE user_id=? AND date=? AND plan_day_id=? ORDER BY created_at DESC LIMIT 1'
  ).get(userId, today, day.id);
  if (existing) return existing.id;
  const r = db.prepare(
    'INSERT INTO workout_sessions (user_id, date, name, notes, plan_day_id) VALUES (?,?,?,?,?)'
  ).run(userId, today, day.name, `${day.name} — from plan`, day.id);
  return r.lastInsertRowid;
}

router.get('/today', (req, res) => {
  const rot = getRotationDay(req.user.id);
  if (!rot) return res.json({ hasPlan: false });
  const { day, sessionId, days } = rot;

  const exercises = db.prepare('SELECT * FROM workout_plan_exercises WHERE day_id=? ORDER BY sort_order, id').all(day.id);

  // Done = this exercise has sets logged in today's session
  let doneNames = new Set();
  if (sessionId) {
    const rows = db.prepare(`
      SELECT DISTINCT LOWER(e.name) AS n
      FROM workout_sets ws JOIN exercises e ON e.id = ws.exercise_id
      WHERE ws.session_id = ?
    `).all(sessionId);
    doneNames = new Set(rows.map(r => r.n));
  }

  const idx = days.findIndex(d => d.id === day.id);
  res.json({
    hasPlan: true,
    sessionId,
    rotation: { index: idx, total: days.length },
    allDays: days.map(d => ({ id: d.id, name: d.name, icon: d.icon, color: d.color })),
    day: {
      id: day.id, name: day.name, icon: day.icon, color: day.color,
      exercises: exercises.map(ex => ({
        id: ex.id, name: ex.name, sets: ex.sets, reps: ex.reps, weight: ex.weight,
        done: doneNames.has(ex.name.toLowerCase()),
      })),
    },
  });
});

// Tick an exercise done / undone for today
router.post('/today/toggle', (req, res) => {
  const { dayId, planExerciseId, done } = req.body;
  const day = db.prepare('SELECT * FROM workout_plan_days WHERE id=? AND user_id=?').get(dayId, req.user.id);
  if (!day) return res.status(404).json({ error: 'Day not found' });
  const pex = db.prepare('SELECT * FROM workout_plan_exercises WHERE id=? AND day_id=?').get(planExerciseId, dayId);
  if (!pex) return res.status(404).json({ error: 'Exercise not found' });

  const sessionId = ensureTodaySession(req.user.id, day);

  // Find or create the matching exercise in the user's library
  let exRow = db.prepare('SELECT id FROM exercises WHERE user_id=? AND LOWER(name)=LOWER(?)').get(req.user.id, pex.name);
  if (!exRow) {
    const nr = db.prepare('INSERT INTO exercises (user_id, name, category) VALUES (?,?,?)').run(req.user.id, pex.name, categoryForDay(day.name));
    exRow = { id: nr.lastInsertRowid };
  }

  const setsBefore = db.prepare('SELECT COUNT(*) c FROM workout_sets WHERE session_id=?').get(sessionId).c;

  // Always clear this exercise's sets first (idempotent)
  db.prepare('DELETE FROM workout_sets WHERE session_id=? AND exercise_id=?').run(sessionId, exRow.id);

  if (done) {
    const setCount = Math.min(parseInt(pex.sets) || 1, 12);
    const reps = parseInt(pex.reps) || null;
    const weight = parseFloat(pex.weight) || null;
    let order = (db.prepare('SELECT MAX(sort_order) m FROM workout_sets WHERE session_id=?').get(sessionId).m ?? -1) + 1;
    for (let i = 0; i < setCount; i++) {
      db.prepare('INSERT INTO workout_sets (session_id, exercise_id, reps, weight, sort_order) VALUES (?,?,?,?,?)').run(sessionId, exRow.id, reps, weight, order++);
    }
    // First exercise of the day → this counts as a workout
    if (setsBefore === 0) {
      updateStreak(req.user.id, 'workout');
      awardPoints(req.user.id, 'workout', 'session', 30, sessionId, day.name);
      applySkillXP(req.user.id, 'workout', ['workout', 'strength', 'fitness', day.name]);
    }
  }

  res.json({ ok: true, sessionId, done: !!done });
});

// Edit an exercise's weight — carries forward to next rotation (progressive overload)
router.patch('/today/weight', (req, res) => {
  const { planExerciseId, weight } = req.body;
  const pex = db.prepare(`
    SELECT wpe.*, wpd.user_id AS owner FROM workout_plan_exercises wpe
    JOIN workout_plan_days wpd ON wpd.id = wpe.day_id
    WHERE wpe.id=? AND wpd.user_id=?
  `).get(planExerciseId, req.user.id);
  if (!pex) return res.status(404).json({ error: 'Not found' });

  const clean = (weight === '' || weight == null) ? '' : String(weight).trim();
  db.prepare('UPDATE workout_plan_exercises SET weight=? WHERE id=?').run(clean, planExerciseId);

  // If already logged today, update those sets too
  const today = localDate();
  const s = db.prepare('SELECT id FROM workout_sessions WHERE user_id=? AND date=? AND plan_day_id=?').get(req.user.id, today, pex.day_id);
  if (s) {
    const exRow = db.prepare('SELECT id FROM exercises WHERE user_id=? AND LOWER(name)=LOWER(?)').get(req.user.id, pex.name);
    if (exRow) db.prepare('UPDATE workout_sets SET weight=? WHERE session_id=? AND exercise_id=?').run(parseFloat(clean) || null, s.id, exRow.id);
  }
  res.json({ ok: true, weight: clean });
});

// Manually switch which plan day is "today" (override the rotation)
router.post('/today/set-day', (req, res) => {
  const { dayId } = req.body;
  const day = db.prepare('SELECT * FROM workout_plan_days WHERE id=? AND user_id=?').get(dayId, req.user.id);
  if (!day) return res.status(404).json({ error: 'Day not found' });
  const today = localDate();

  const existing = db.prepare(
    'SELECT * FROM workout_sessions WHERE user_id=? AND date=? AND plan_day_id IS NOT NULL ORDER BY created_at DESC LIMIT 1'
  ).get(req.user.id, today);

  if (existing && existing.plan_day_id !== dayId) {
    // Switching day → drop the old day's ticks and repoint the session
    db.prepare('DELETE FROM workout_sets WHERE session_id=?').run(existing.id);
    db.prepare('UPDATE workout_sessions SET plan_day_id=?, name=?, notes=? WHERE id=?').run(dayId, day.name, `${day.name} — from plan`, existing.id);
  } else if (!existing) {
    db.prepare('INSERT INTO workout_sessions (user_id, date, name, notes, plan_day_id) VALUES (?,?,?,?,?)').run(req.user.id, today, day.name, `${day.name} — from plan`, dayId);
  }
  res.json({ ok: true, dayId });
});

// ── Quick-log (NLP) ──────────────────────────────────────────
router.post('/quick-log', (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });

  const parsed = parseWorkoutText(text.trim(), req.user.id);
  const today = localDate();

  // Create session
  const sessionResult = db.prepare(
    'INSERT INTO workout_sessions (user_id, date, name, notes) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, today, parsed.dayName || 'Quick Log', text.trim());
  const sessionId = sessionResult.lastInsertRowid;

  updateStreak(req.user.id, 'workout');
  awardPoints(req.user.id, 'workout', 'session', 30, sessionId, parsed.dayName);
  applySkillXP(req.user.id, 'workout',
    [parsed.dayName || '', ...(parsed.exercises || []).map(e => e.name || '')]);

  // Insert sets for each matched exercise
  const loggedExercises = [];
  let sortOrder = 0;

  for (const ex of parsed.exercises) {
    // Find or create exercise in the user's exercise library
    let exRow = db.prepare('SELECT id FROM exercises WHERE user_id = ? AND LOWER(name) = LOWER(?)').get(req.user.id, ex.name);
    if (!exRow) {
      const nr = db.prepare('INSERT INTO exercises (user_id, name) VALUES (?, ?)').run(req.user.id, ex.name);
      exRow = { id: nr.lastInsertRowid };
    }

    // Insert one set per "sets" count (or just one representative set)
    const setCount = Math.min(ex.sets || 1, 10);
    for (let i = 0; i < setCount; i++) {
      db.prepare(
        'INSERT INTO workout_sets (session_id, exercise_id, reps, weight, sort_order) VALUES (?, ?, ?, ?, ?)'
      ).run(sessionId, exRow.id, parseInt(ex.reps) || null, ex.weight || null, sortOrder++);
    }

    loggedExercises.push({
      exercise_id: exRow.id,
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      weight: ex.weight,
    });
  }

  // Build human-readable preview
  const parts = [`✓ Logged ${parsed.dayName}`];
  if (loggedExercises.length) {
    const exSummary = loggedExercises.slice(0, 4).map(e =>
      `${e.name} ${e.sets}×${e.reps}${e.weight ? ` @ ${e.weight}kg` : ''}`
    ).join(', ');
    parts.push(exSummary);
  }
  if (parsed.cardioMinutes > 0) parts.push(`${parsed.cardioMinutes} min cardio`);

  res.status(201).json({
    session_id: sessionId,
    dayName: parsed.dayName,
    exercises: loggedExercises,
    cardioMinutes: parsed.cardioMinutes,
    preview: parts.join(' — '),
  });
});

// ── PDF plan parser ───────────────────────────────────────────
function dayMeta(name) {
  const n = name.toLowerCase();
  if (/back|pull|row|deadlift/.test(n))           return { icon: '🔙', color: '#b5764f' };
  if (/chest|push|bench|press/.test(n))           return { icon: '🏋️', color: '#d97757' };
  if (/leg|squat|lunge|hamstring|quad/.test(n))   return { icon: '🦵', color: '#cf8a3e' };
  if (/shoulder|delt|overhead/.test(n))           return { icon: '💪', color: '#e8a87c' };
  if (/arm|bicep|tricep|curl/.test(n))            return { icon: '💪', color: '#c2553d' };
  if (/cardio|run|hiit|cycle/.test(n))            return { icon: '🏃', color: '#b3372e' };
  if (/core|abs|plank/.test(n))                   return { icon: '🎯', color: '#d9a066' };
  if (/full.?body|total/.test(n))                 return { icon: '⚡', color: '#a97e5f' };
  return { icon: '💪', color: '#d97757' };
}

function parsePlanText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const days = [];
  let current = null;

  // Patterns that signal a new training day
  const DAY_RE = [
    /^(day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /^(push|pull|legs?|chest|back|shoulder|arm|bicep|tricep|core|cardio|upper|lower|full.?body)/i,
    /^[A-Z][A-Z &]+$/, // ALL CAPS line ≤ 40 chars
  ];

  // Sets × reps patterns: "3x10", "3×10", "3 sets of 10", "3 sets × 10 reps", "4 × 8-12"
  const SR_RE = /(\d+)\s*(?:sets?\s*(?:of|[x×*])?\s*)?[x×*]\s*([\d][\d\-]*)/i;
  const SR2_RE = /(\d+)\s*sets?\s+(?:of\s+)?(\d[\d\-]*)/i;

  for (const line of lines) {
    // Skip very short / purely numeric lines
    if (line.length < 2 || /^\d+$/.test(line)) continue;

    const isHeader = line.length <= 50 && DAY_RE.some(r => r.test(line));

    if (isHeader) {
      // Clean up common suffixes like ": Day 1"
      const cleanName = line.replace(/^\d+\.\s*/, '').replace(/:$/, '').trim();
      current = { name: cleanName, ...dayMeta(cleanName), exercises: [] };
      days.push(current);
      continue;
    }

    if (!current) continue;

    // Try to extract sets × reps
    let sets = 3, reps = '8-12';
    let name = line;

    const m = line.match(SR_RE) || line.match(SR2_RE);
    if (m) {
      sets = Math.min(10, parseInt(m[1]) || 3);
      reps = m[2] || '8-12';
      name = line.replace(m[0], '').replace(/^\s*[-–—:,•·]\s*/, '').replace(/[-–—:,]+$/, '').trim();
    }

    // Extract weight like "@ 80kg" or "80 kg"
    let weight = '';
    const wm = name.match(/@\s*([\d.]+\s*kg)/i) || name.match(/([\d.]+\s*kg)/i);
    if (wm) { weight = wm[1].trim(); name = name.replace(wm[0], '').trim(); }

    name = name.replace(/^\s*[-–—•·\d.]+\s*/, '').trim(); // strip leading bullets/numbers
    if (name.length >= 2 && name.length <= 80) {
      current.exercises.push({ name, sets, reps, weight });
    }
  }

  return days.filter(d => d.exercises.length > 0);
}

// PDF parse — extract text AND return structured plan
router.post('/plan/parse-pdf', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const parser = new PDFParse({ data: req.file.buffer });
    const data = await parser.getText();
    const plan = parsePlanText(data.text);
    res.json({ text: data.text, pages: data.total, plan });
  } catch (e) {
    res.status(500).json({ error: 'Failed to parse PDF' });
  }
});

module.exports = router;
