const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const db = require('../db/database');
const { getTotalPoints } = require('../utils/pointsUtils');
const { SQL_OFF } = require('../utils/dateUtils');

router.use(authMiddleware);

// ── Merit-based rank system (v3 — 3-tier class hierarchy) ────────────────────
// Stats score      (0–45): weighted avg of 7 live stats (Wealth ×0.5)
// Streaks score    (0–15): max current streak / 14 × 15
// Skills score     (0–15): avg skill level × 3, capped
// Claims score     (0–10): claimed × 2, capped
// Points score     (0–15): floor(totalPoints / 200), capped
// Max merit = 100
//
// ┌──────── KING CLASS (75–100) ────────────────────────────────────────────┐
// │  ∞   Rank  90–100  Absolute Ruler     — no rank above, the infinite end │
// │  S+  Rank  75–89   Shadow Monarch     — King-class, one step from apex  │
// ├──────── GENERAL CLASS (50–74) ──────────────────────────────────────────┤
// │  S   Rank  65–74   Supreme General    — commands every front             │
// │  A   Rank  50–64   Battle Commander   — hardened across all disciplines  │
// ├──────── SOLDIER CLASS (0–49) — 4 ranks ─────────────────────────────────┤
// │  B   Rank  35–49   Elite Soldier      — top of Soldier, promotion close  │
// │  C   Rank  25–34   Veteran Soldier    — real foundations built            │
// │  D   Rank  15–24   Foot Soldier       — on the path, earning every point  │
// │  E   Rank   0–14   Raw Recruit        — the journey begins                │
// └─────────────────────────────────────────────────────────────────────────┘

const RANK_TIERS = [
  { rank: '∞',  cls: 'King',    min: 90, color: '#93c5fd', label: 'Absolute Ruler',   desc: 'Beyond all ranks — the infinite threshold' },
  { rank: 'S+', cls: 'King',    min: 75, color: '#e2c97e', label: 'Shadow Monarch',   desc: 'King-class power — one step from infinity' },
  { rank: 'S',  cls: 'General', min: 65, color: '#ef4444', label: 'Supreme General',  desc: 'Commands every front — peak of General class' },
  { rank: 'A',  cls: 'General', min: 50, color: '#f97316', label: 'Battle Commander', desc: 'Hardened across all disciplines' },
  { rank: 'B',  cls: 'Soldier', min: 35, color: '#a855f7', label: 'Elite Soldier',    desc: 'Top of Soldier ranks — promotion is close' },
  { rank: 'C',  cls: 'Soldier', min: 25, color: '#22c55e', label: 'Veteran Soldier',  desc: 'Real foundations built — seasoned fighter' },
  { rank: 'D',  cls: 'Soldier', min: 15, color: '#3b82f6', label: 'Foot Soldier',     desc: 'On the path — earning every point' },
  { rank: 'E',  cls: 'Soldier', min:  0, color: '#6b7280', label: 'Raw Recruit',      desc: 'The journey begins — Soldier class' },
];

function computeMeritScore(stats, skills, claims, totalPoints, maxCurrentStreak) {
  // Stats: if a system is genuinely unused its stat is null/undefined → treat as
  // a neutral 30 so one unused feature doesn't crater the whole score.
  // Wealth always defaults to 50 (break-even) when no finance data exists.
  const s = {
    strength:   stats.strength   ?? 30,
    vitality:   stats.vitality   ?? 30,   // no sleep logs → neutral, not zero
    discipline: stats.discipline ?? 30,   // no habits → neutral
    focus:      stats.focus      ?? 30,   // no tasks → neutral
    endurance:  stats.endurance  ?? 20,
    creativity: stats.creativity ?? 20,   // not a creator → neutral
    wealth:     stats.wealth     ?? 50,
  };

  const weightedSum  = s.strength + s.vitality + s.discipline + s.focus +
                       s.endurance + s.creativity + 0.5 * s.wealth;
  const weightedAvg  = weightedSum / 6.5;
  const statScore    = Math.round((weightedAvg / 100) * 45);

  // Streak: 14-day current streak = full 15 pts (was 30 — too brutal)
  const streakScore  = Math.min(15, Math.round((maxCurrentStreak / 14) * 15));

  // Skills: level 5 avg = full 15 pts; all-level-1 still earns ~3 pts
  const avgSkillLvl  = skills.length > 0
    ? skills.reduce((a, sk) => a + (sk.level || 1), 0) / skills.length : 1;
  const skillScore   = Math.min(15, Math.round(avgSkillLvl * 3));

  // Claims: unchanged
  const claimedCount = claims.filter(c => c.status === 'claimed').length;
  const claimScore   = Math.min(10, claimedCount * 2);

  // Points: every 200 pts = 1 merit point → 3 000 pts needed for full 15
  // (was /800 → needed 12 000 pts — basically unreachable)
  // Clamp ≥ 0: penalties can drive totalPoints negative, which must not
  // produce a negative merit component and corrupt the total.
  const ptsScore     = Math.max(0, Math.min(15, Math.floor(totalPoints / 200)));

  return {
    total: statScore + streakScore + skillScore + claimScore + ptsScore,
    breakdown: { statScore, streakScore, skillScore, claimScore, ptsScore },
  };
}

function getRankFromMerit(meritTotal) {
  for (const tier of RANK_TIERS) {
    if (meritTotal >= tier.min) return tier;
  }
  return RANK_TIERS[RANK_TIERS.length - 1];
}

function getNextRank(currentRank) {
  const idx = RANK_TIERS.findIndex(t => t.rank === currentRank);
  return idx > 0 ? RANK_TIERS[idx - 1] : null;
}

// ── GET /summary ─ everything in one shot ─────────────────────────────────────
router.get('/summary', (req, res) => {
  const uid = req.user.id;

  // Profile
  const profile = db.prepare('SELECT * FROM me_profile WHERE user_id = ?').get(uid) || {
    character_name: '', title: '', class: '', bio: '', adventure: '', avatar_emoji: '⚔️',
  };

  // Total points (for points sub-score)
  const totalPoints = getTotalPoints(uid);

  // ── Stats ──
  // Each stat returns null when the feature hasn't been used at all so the
  // merit formula can apply a neutral default instead of a punishing zero.

  // STRENGTH: workout sessions this month — 12 sessions = 100 (was 20, too brutal)
  const workoutSessions = (db.prepare(
    `SELECT COUNT(*) as n FROM workout_sessions WHERE user_id=? AND strftime('%Y-%m',date)=strftime('%Y-%m', date('now', ${SQL_OFF}))`
  ).get(uid) || {}).n || 0;
  const strength = Math.min(100, Math.round((workoutSessions / 12) * 100));

  // VITALITY: avg sleep quality last 7 nights — null if nothing logged
  const sleepRow = db.prepare(
    `SELECT AVG(quality) as q, COUNT(*) as cnt FROM sleep_logs WHERE user_id=? AND date >= date('now', ${SQL_OFF}, '-7 days')`
  ).get(uid);
  const vitality = (sleepRow?.cnt > 0 && sleepRow?.q)
    ? Math.round(sleepRow.q * 20)
    : null;   // null → neutral 30 in formula

  // DISCIPLINE: habit completion rate this week — null if no habits exist
  const habitTotal = (db.prepare('SELECT COUNT(*) as n FROM habits WHERE user_id=?').get(uid) || {}).n || 0;
  const habitDone = (db.prepare(
    `SELECT COUNT(*) as n FROM habit_logs WHERE user_id=? AND done=1 AND date >= date('now', ${SQL_OFF}, '-7 days')`
  ).get(uid) || {}).n || 0;
  const maxHabitDays = habitTotal * 7;
  const discipline = maxHabitDays > 0
    ? Math.min(100, Math.round((habitDone / maxHabitDays) * 100))
    : null;   // null → neutral 30

  // FOCUS: task completion rate this month — null if no tasks created this month
  const taskTotal = (db.prepare(
    `SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND created_at >= date('now', ${SQL_OFF}, 'start of month')`
  ).get(uid) || {}).n || 0;
  const taskDone = (db.prepare(
    `SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND status='completed' AND completed_at >= date('now', ${SQL_OFF}, 'start of month')`
  ).get(uid) || {}).n || 0;
  const focus = taskTotal > 0
    ? Math.min(100, Math.round((taskDone / taskTotal) * 100))
    : null;   // null → neutral 30

  // ENDURANCE: longest streak ever — 14 days = 100 (was 30, near-impossible)
  const longestStreak = (db.prepare(
    'SELECT MAX(longest_streak) as m FROM streaks WHERE user_id=?'
  ).get(uid) || {}).m || 0;
  const endurance = Math.min(100, Math.round((longestStreak / 14) * 100));

  // WEALTH: finance net this month — 50 when no entries (break-even assumed)
  const finRow = db.prepare(
    `SELECT SUM(CASE WHEN type='income' THEN amount ELSE -amount END) as net,
            COUNT(*) as cnt
     FROM finance_entries WHERE user_id=? AND strftime('%Y-%m',date)=strftime('%Y-%m', date('now', ${SQL_OFF}))`
  ).get(uid);
  const net    = finRow?.net || 0;
  const wealth = finRow?.cnt > 0
    ? (net >= 0
        ? Math.min(100, 50 + Math.round((net / 10000) * 50))
        : Math.max(0,   50 - Math.round((Math.abs(net) / 10000) * 50)))
    : null;   // null → formula uses 50 default

  // CREATIVITY: content posts this month — 4 posts = 100 (was 8)
  // null if never used the Creator feature
  let creativity = null;
  try {
    const contentRow = db.prepare(
      `SELECT COUNT(*) as n FROM content_ideas WHERE user_id=? AND status='posted'
       AND posted_at >= date('now', ${SQL_OFF}, 'start of month')`
    ).get(uid);
    if (contentRow?.n > 0) {
      creativity = Math.min(100, Math.round((contentRow.n / 4) * 100));
    }
    // if n === 0 stay null → neutral 20 in formula (not penalised for non-creator)
  } catch (_) { /* content tables may not exist */ }

  const stats = { strength, vitality, discipline, focus, endurance, wealth, creativity };

  // ── Max current streak across all activity types (for streak sub-score) ──
  const streakRow = db.prepare('SELECT MAX(current_streak) as m FROM streaks WHERE user_id=?').get(uid);
  const maxCurrentStreak = streakRow?.m || 0;

  // ── Collections ──
  const skills  = db.prepare('SELECT * FROM me_skills  WHERE user_id=? ORDER BY sort_order, created_at').all(uid);
  const claims  = db.prepare('SELECT * FROM me_claims  WHERE user_id=? ORDER BY sort_order, created_at').all(uid);
  const mentors = db.prepare('SELECT * FROM me_mentors WHERE user_id=? ORDER BY sort_order, created_at').all(uid);

  // ── Merit-based rank ──
  const merit     = computeMeritScore(stats, skills, claims, totalPoints, maxCurrentStreak);
  const rankTier  = getRankFromMerit(merit.total);
  const nextTier  = getNextRank(rankTier.rank);

  res.json({
    profile,
    rank:      rankTier.rank,
    rankClass: rankTier.cls,
    rankColor: rankTier.color,
    rankLabel: rankTier.label,
    rankDesc:  rankTier.desc,
    meritScore:     merit.total,
    meritBreakdown: merit.breakdown,
    nextRank: nextTier ? {
      rank:     nextTier.rank,
      rankClass:nextTier.cls,
      min:      nextTier.min,
      color:    nextTier.color,
      label:    nextTier.label,
    } : null,
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

  // ── Anti-exploit: claim must be 3+ days old OR its deadline has passed ──
  if (status === 'claimed' && claim.status !== 'claimed') {
    const createdAt = new Date(claim.created_at);
    const ageDays = Math.floor((Date.now() - createdAt.getTime()) / 86400000);
    const deadlinePassed = claim.deadline && claim.deadline <= new Date().toISOString().slice(0, 10);
    if (ageDays < 3 && !deadlinePassed) {
      const wait = 3 - ageDays;
      return res.status(400).json({
        error: `Claim too fresh — earn it. ${wait} day${wait !== 1 ? 's' : ''} of cooldown left, or set a deadline that's passed.`,
      });
    }
    // Award points for claiming (one-shot per claim id)
    try {
      const { awardPoints, alreadyAwardedEver } = require('../utils/pointsUtils');
      if (!alreadyAwardedEver(uid, 'claim', parseInt(req.params.id), 'claim')) {
        awardPoints(uid, 'claim', 'claim', 30, parseInt(req.params.id), claim.title);
      }
    } catch (_) {}
  }

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
