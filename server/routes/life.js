const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { SQL_OFF } = require('../utils/dateUtils');
const { parseAmbitions, generateSummary } = require('../utils/ambitionsParser');
const { extractSectors } = require('../utils/sectorDetector');
const { analyzeUserData, getRecommendations, generateReply } = require('../utils/lifeManager');

// Ensure life_ambitions table exists
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS life_ambitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      raw_text TEXT DEFAULT '',
      goals_json TEXT DEFAULT '[]',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
} catch (_) {}

// Add conversation_json column if not already present
try {
  db.prepare(`ALTER TABLE life_ambitions ADD COLUMN conversation_json TEXT DEFAULT '[]'`).run();
} catch (_) {}

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
  const uid = req.user.id;
  seedDefaultAreas(uid);
  const areas = db.prepare('SELECT * FROM life_areas WHERE user_id = ? ORDER BY sort_order, id').all(uid);
  const milestones = db.prepare(`
    SELECT lm.* FROM life_milestones lm
    JOIN life_areas la ON la.id = lm.area_id
    WHERE la.user_id = ?
  `).all(uid);

  // All task titles last 60 days (for keyword matching against area names)
  const allTasks = db.prepare(`
    SELECT title, status FROM tasks
    WHERE user_id = ? AND created_at >= date('now', ${SQL_OFF}, '-60 days')
  `).all(uid);

  // Tasks explicitly tagged per area
  const taggedStats = db.prepare(`
    SELECT life_area_id,
      COUNT(*) as total,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done
    FROM tasks WHERE user_id = ? AND life_area_id IS NOT NULL
    GROUP BY life_area_id
  `).all(uid);
  const taggedMap = Object.fromEntries(taggedStats.map(t => [t.life_area_id, t]));

  // Journal text last 30 days
  const journals = db.prepare(`
    SELECT content FROM journal_entries WHERE user_id = ? AND date >= date('now', ${SQL_OFF}, '-30 days')
  `).all(uid);
  const allJournalText = journals.map(j => (j.content || '').toLowerCase()).join(' ');

  const result = areas.map(a => {
    // 1. TAGGED TASKS: explicitly linked tasks for this area
    const ts = taggedMap[a.id];
    const taggedScore = ts && ts.total > 0 ? Math.round((ts.done / ts.total) * 100) : null;

    // 2. KEYWORD TASKS: tasks whose titles mention this area's keywords (last 60 days)
    //    Split area name into meaningful words (skip short words like "and", "&", "the")
    const keywords = a.name.toLowerCase()
      .split(/[\s&,\/+]+/)
      .filter(w => w.length >= 4);
    let kwTotal = 0, kwDone = 0;
    if (keywords.length > 0) {
      for (const t of allTasks) {
        const titleLower = (t.title || '').toLowerCase();
        if (keywords.some(kw => titleLower.includes(kw))) {
          kwTotal++;
          if (t.status === 'completed') kwDone++;
        }
      }
    }
    const kwScore = kwTotal > 0 ? Math.min(100, Math.round((kwDone / kwTotal) * 100)) : null;

    // 3. JOURNAL MENTIONS
    const mentionRegex = keywords.length > 0
      ? new RegExp(keywords.join('|'), 'gi')
      : new RegExp(a.name.toLowerCase(), 'g');
    const mentionCount = (allJournalText.match(mentionRegex) || []).length;
    const journalScore = Math.min(100, mentionCount * 8); // 12 mentions = 100

    // 4. MILESTONE completion
    const areaMs = milestones.filter(m => m.area_id === a.id);
    const msDone  = areaMs.filter(m => m.completed).length;
    const msScore = areaMs.length > 0 ? Math.round((msDone / areaMs.length) * 100) : null;

    // ── Composite auto-score ──────────────────────────────────
    // Only area-specific signals drive the score so each area is independent.
    // Global baselines (habits, overall tasks) are NOT included here —
    // they were making every area show the same number.
    const signals = [];
    const weights = [];

    if (taggedScore !== null) { signals.push(taggedScore);  weights.push(40); }
    if (kwScore !== null)      { signals.push(kwScore);      weights.push(30); }
    if (journalScore > 0)      { signals.push(journalScore); weights.push(20); }
    if (msScore !== null)      { signals.push(msScore);      weights.push(10); }

    let autoScore = null;
    if (signals.length > 0) {
      const totalWeight = weights.reduce((s, w) => s + w, 0);
      autoScore = Math.round(
        signals.reduce((s, v, i) => s + v * weights[i], 0) / totalWeight
      );
    }

    // Combined task stats for display (tagged + keyword)
    const displayTaskTotal = (ts?.total || 0) + kwTotal;
    const displayTaskDone  = (ts?.done  || 0) + kwDone;

    return {
      ...a,
      milestones: areaMs,
      taskStats: { total: displayTaskTotal, done: displayTaskDone },
      journalMentions: mentionCount,
      autoScore,
      msScore,
      // Final display score: manual override if set >0, else computed
      displayScore: a.progress > 0 ? a.progress : (autoScore ?? 0),
    };
  });

  res.json(result);
});

router.get('/areas/:id/tasks', (req, res) => {
  const area = db.prepare('SELECT id FROM life_areas WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!area) return res.status(404).json({ error: 'Not found' });
  const tasks = db.prepare(`
    SELECT id, title, status, due_date, priority FROM tasks
    WHERE user_id=? AND life_area_id=?
    ORDER BY CASE status WHEN 'completed' THEN 1 ELSE 0 END, created_at DESC
    LIMIT 20
  `).all(req.user.id, req.params.id);
  res.json(tasks);
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

  // Verify area belongs to this user
  const area = db.prepare('SELECT id FROM life_areas WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!area) return res.status(404).json({ error: 'Area not found' });

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

// ── Sector detection + fill ───────────────────────────────────

// GET /sectors — all areas with task-completion fill %
router.get('/sectors', (req, res) => {
  const uid = req.user.id;
  const areas = db.prepare('SELECT * FROM life_areas WHERE user_id=? ORDER BY sort_order, id').all(uid);

  const result = areas.map(area => {
    // Tagged tasks (explicit life_area_id link) — all time
    const tagged = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done
      FROM tasks WHERE user_id=? AND life_area_id=?
    `).get(uid, area.id);

    // Keyword-matched tasks (last 60 days, loose link)
    const keywords = area.name.toLowerCase().split(/[\s&,\/]+/).filter(w => w.length >= 4);
    let kwStats = { total: 0, done: 0 };
    if (keywords.length) {
      const whereClauses = keywords.map(() => 'LOWER(title) LIKE ?').join(' OR ');
      const kwArgs = [uid, ...keywords.map(k => `%${k}%`)];
      kwStats = db.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done
        FROM tasks WHERE user_id=?
        AND (${whereClauses})
        AND life_area_id IS NULL
        AND datetime(created_at) >= datetime('now', ${SQL_OFF}, '-60 days')
      `).get(...kwArgs) || { total: 0, done: 0 };
    }

    const total   = (tagged.total || 0) + (kwStats.total || 0);
    const done    = (tagged.done  || 0) + (kwStats.done  || 0);
    const fillPct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

    return {
      id: area.id, name: area.name, icon: area.icon, color: area.color,
      fillPct, total, done,
    };
  });

  const amb = db.prepare('SELECT raw_text FROM life_ambitions WHERE user_id=?').get(uid);
  res.json({ sectors: result, rawText: amb?.raw_text || '' });
});

// POST /detect-sectors — parse text, upsert life_areas, return sectors
router.post('/detect-sectors', (req, res) => {
  const uid = req.user.id;
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'No text provided' });

  const detected = extractSectors(text);

  // Persist the raw text in life_ambitions
  db.prepare(`
    INSERT INTO life_ambitions (user_id, raw_text, goals_json, updated_at)
    VALUES (?, ?, '[]', CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      raw_text   = excluded.raw_text,
      updated_at = CURRENT_TIMESTAMP
  `).run(uid, text);

  // Upsert one life_area per detected sector (create if not exists by name)
  for (let i = 0; i < detected.length; i++) {
    const s = detected[i];
    const existing = db.prepare('SELECT id FROM life_areas WHERE user_id=? AND name=?').get(uid, s.name);
    if (!existing) {
      db.prepare(
        'INSERT INTO life_areas (user_id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)'
      ).run(uid, s.name, s.icon, s.color, i);
    }
  }

  res.json({ detected: detected.map(s => s.name) });
});

// ── Ambitions ─────────────────────────────────────────────────

// GET saved ambitions
router.get('/ambitions', (req, res) => {
  const uid = req.user.id;
  const row = db.prepare('SELECT * FROM life_ambitions WHERE user_id = ?').get(uid);
  if (!row) return res.json({ raw_text: '', goals: [] });
  res.json({ raw_text: row.raw_text, goals: JSON.parse(row.goals_json || '[]') });
});

// POST — parse text + save
router.post('/ambitions/parse', (req, res) => {
  const uid = req.user.id;
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'No text provided' });

  const goals   = parseAmbitions(text);
  const summary = generateSummary(goals);

  db.prepare(`
    INSERT INTO life_ambitions (user_id, raw_text, goals_json, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      raw_text   = excluded.raw_text,
      goals_json = excluded.goals_json,
      updated_at = CURRENT_TIMESTAMP
  `).run(uid, text, JSON.stringify(goals));

  res.json({ goals, summary });
});

// ── AXIS Chat ─────────────────────────────────────────────────
// Helper: compute sector fills for a user (same logic as GET /sectors)
function getSectorFills(uid) {
  const areas = db.prepare('SELECT * FROM life_areas WHERE user_id=? ORDER BY sort_order, id').all(uid);
  return areas.map(area => {
    const tagged = db.prepare(`
      SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done
      FROM tasks WHERE user_id=? AND life_area_id=?
    `).get(uid, area.id);

    const keywords = area.name.toLowerCase().split(/[\s&,\/]+/).filter(w => w.length >= 4);
    let kwStats = { total: 0, done: 0 };
    if (keywords.length) {
      const where = keywords.map(() => 'LOWER(title) LIKE ?').join(' OR ');
      kwStats = db.prepare(`
        SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done
        FROM tasks WHERE user_id=? AND (${where})
        AND life_area_id IS NULL
        AND datetime(created_at) >= datetime('now', ${SQL_OFF}, '-60 days')
      `).get(uid, ...keywords.map(k => `%${k}%`)) || { total: 0, done: 0 };
    }

    const total   = (tagged?.total || 0) + (kwStats.total || 0);
    const done    = (tagged?.done  || 0) + (kwStats.done  || 0);
    const fillPct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

    return { id: area.id, name: area.name, icon: area.icon, color: area.color, fillPct, total, done };
  });
}

router.post('/chat', (req, res) => {
  const uid = req.user.id;
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  // 1. Load existing conversation
  const row = db.prepare('SELECT conversation_json, raw_text FROM life_ambitions WHERE user_id=?').get(uid);
  let history = [];
  try { history = JSON.parse(row?.conversation_json || '[]'); } catch (_) {}

  // 2. Append user message
  const now = new Date().toISOString();
  history.push({ role: 'user', content: message.trim(), ts: now });

  // 3. Extract + upsert sectors from this message
  const detected = extractSectors(message);
  const newSectorNames = [];
  for (let i = 0; i < detected.length; i++) {
    const s = detected[i];
    const existing = db.prepare('SELECT id FROM life_areas WHERE user_id=? AND name=?').get(uid, s.name);
    if (!existing) {
      const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM life_areas WHERE user_id=?').get(uid);
      db.prepare(
        'INSERT INTO life_areas (user_id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)'
      ).run(uid, s.name, s.icon, s.color, (maxOrder?.m ?? -1) + 1);
      newSectorNames.push(s.name);
    }
  }

  // 4. Analyze user data
  const snapshot = analyzeUserData(uid);

  // 5. Get fresh sector fills (post-upsert)
  const sectors = getSectorFills(uid);

  // 6. Recommendations
  const recs = getRecommendations(message, sectors, snapshot);

  // 7. Generate reply
  const reply = generateReply(message, snapshot, recs, newSectorNames);

  // 8. Append manager message (with recs embedded)
  const managerMsg = { role: 'manager', content: reply, ts: new Date().toISOString(), recommendations: recs };
  history.push(managerMsg);

  // 9. Keep last 30 messages
  if (history.length > 30) history = history.slice(-30);

  // 10. Save back
  const rawText = row?.raw_text || message.trim();
  db.prepare(`
    INSERT INTO life_ambitions (user_id, raw_text, conversation_json, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      raw_text          = excluded.raw_text,
      conversation_json = excluded.conversation_json,
      updated_at        = CURRENT_TIMESTAMP
  `).run(uid, rawText, JSON.stringify(history));

  res.json({ reply, recommendations: recs, sectors, history });
});

// GET conversation history + sectors (for page load)
router.get('/chat/history', (req, res) => {
  const uid = req.user.id;
  const row = db.prepare('SELECT conversation_json FROM life_ambitions WHERE user_id=?').get(uid);
  let history = [];
  try { history = JSON.parse(row?.conversation_json || '[]'); } catch (_) {}
  const sectors = getSectorFills(uid);
  res.json({ history, sectors });
});

module.exports = router;
