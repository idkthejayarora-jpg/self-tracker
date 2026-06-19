const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const db = require('../db/database');
const { getTotalPoints } = require('../utils/pointsUtils');
const { SQL_OFF } = require('../utils/dateUtils');

router.use(authMiddleware);

// ── Merit-based rank system (v4 — 5 pillars, premium rank tiers) ─────────────
// Merit (0–100) is built from five clear pillars:
//   Consistency (0–25) — current streak (the daily turn-up)
//   Discipline  (0–25) — habit + task completion rates
//   Vitality    (0–20) — training + sleep + endurance
//   Mastery     (0–15) — average skill level
//   Momentum    (0–15) — points grind + claimed milestones
//
// Each rank has its own CARD FINISH (escalating premium look) and a PERKS
// ladder — climbing literally upgrades how your card looks and what it unlocks.
//
// ┌─ KING CLASS (75–100) ── apex finishes ──────────────────────────────────┐
// │  ∞   90–100  Absolute Ruler   — living aurora card, the rarest finish    │
// │  S+  75–89   Shadow Monarch   — holographic foil                         │
// ├─ GENERAL CLASS (50–74) ── metal foils ──────────────────────────────────┤
// │  S   65–74   Supreme General  — crimson + gold, animated shine           │
// │  A   50–64   Battle Commander — gold foil + glow                         │
// ├─ SOLDIER CLASS (0–49) ── matte → metal ─────────────────────────────────┤
// │  B   35–49   Elite Soldier    — silver foil                              │
// │  C   25–34   Veteran Soldier  — iron plate                               │
// │  D   15–24   Foot Soldier     — bronze edge                              │
// │  E    0–14   Raw Recruit      — plain kraft                              │
// └──────────────────────────────────────────────────────────────────────────┘

const RANK_TIERS = [
  { rank: '∞',  cls: 'King',    min: 90, color: '#e8a87c', tier: 'aurora',   label: 'Absolute Ruler',   desc: 'Beyond all ranks — the infinite threshold',
    perks: ['Living aurora card — the rarest finish', 'Animated holographic sheen', 'Infinite crown on your avatar', 'Apex rank — nothing stands above'] },
  { rank: 'S+', cls: 'King',    min: 75, color: '#e08b4e', tier: 'obsidian', label: 'Shadow Monarch',   desc: 'King-class power — one step from infinity',
    perks: ['Holographic monarch card', 'Living foil shimmer', 'Shadow Monarch crown', 'King-class banner'] },
  { rank: 'S',  cls: 'General', min: 65, color: '#c2553d', tier: 'crimson',  label: 'Supreme General',  desc: 'Commands every front — peak of General class',
    perks: ['Crimson general card', 'Animated shine sweep', 'Supreme seal', 'General-class banner'] },
  { rank: 'A',  cls: 'General', min: 50, color: '#d97757', tier: 'gold',     label: 'Battle Commander', desc: 'Hardened across all disciplines',
    perks: ['Gold-foil card', 'Commander glow', 'Animated sheen unlocked'] },
  { rank: 'B',  cls: 'Soldier', min: 35, color: '#d4a27f', tier: 'silver',   label: 'Elite Soldier',    desc: 'Top of Soldier ranks — promotion is close',
    perks: ['Silver-foil card', 'Elite insignia', 'Card sheen'] },
  { rank: 'C',  cls: 'Soldier', min: 25, color: '#cf8a3e', tier: 'iron',     label: 'Veteran Soldier',  desc: 'Real foundations built — seasoned fighter',
    perks: ['Iron-plate card', 'Veteran stamp'] },
  { rank: 'D',  cls: 'Soldier', min: 15, color: '#b98a64', tier: 'bronze',   label: 'Foot Soldier',     desc: 'On the path — earning every point',
    perks: ['Bronze-edged card', 'Foot Soldier insignia'] },
  { rank: 'E',  cls: 'Soldier', min:  0, color: '#a59785', tier: 'kraft',    label: 'Raw Recruit',      desc: 'The journey begins — Soldier class',
    perks: ['Full tracker unlocked', 'Kraft rank card', 'Merit tracking begins'] },
];

function computeMeritScore(stats, skills, claims, totalPoints, maxCurrentStreak) {
  const n = (v, d) => (v == null ? d : v); // neutral default when a feature is unused

  // 1 · Consistency (0–25) — current streak, 21 straight days = full
  const consistency = Math.min(25, Math.round((maxCurrentStreak / 21) * 25));

  // 2 · Discipline (0–25) — habit + task completion (neutral 30 when unused)
  const disciplinePct = (n(stats.discipline, 30) + n(stats.focus, 30)) / 2;
  const discipline = Math.min(25, Math.round((disciplinePct / 100) * 25));

  // 3 · Vitality (0–20) — training + sleep + endurance
  const bodyPct = (n(stats.strength, 20) + n(stats.vitality, 30) + n(stats.endurance, 20)) / 3;
  const vitality = Math.min(20, Math.round((bodyPct / 100) * 20));

  // 4 · Mastery (0–15) — average skill level (lvl 5 avg = full)
  const avgSkillLvl = skills.length > 0
    ? skills.reduce((a, sk) => a + (sk.level || 1), 0) / skills.length : 1;
  const mastery = Math.min(15, Math.round(avgSkillLvl * 3));

  // 5 · Momentum (0–15) — points grind (≤10) + claimed milestones (≤5)
  const claimedCount = claims.filter(c => c.status === 'claimed').length;
  const ptsPart   = Math.min(10, Math.max(0, Math.floor(totalPoints / 200)));
  const claimPart = Math.min(5, claimedCount);
  const momentum  = ptsPart + claimPart;

  const total = Math.min(100, consistency + discipline + vitality + mastery + momentum);
  return {
    total,
    breakdown: { consistency, discipline, vitality, mastery, momentum },
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
    rankTier:  rankTier.tier,
    rankPerks: rankTier.perks,
    meritScore:     merit.total,
    meritBreakdown: merit.breakdown,
    nextRank: nextTier ? {
      rank:     nextTier.rank,
      rankClass:nextTier.cls,
      min:      nextTier.min,
      color:    nextTier.color,
      label:    nextTier.label,
      tier:     nextTier.tier,
      perks:    nextTier.perks,
    } : null,
    // Full ladder (low → high) so the UI can show every rank's card + perks
    ranks: [...RANK_TIERS].reverse().map(t => ({
      rank: t.rank, cls: t.cls, min: t.min, color: t.color,
      tier: t.tier, label: t.label, desc: t.desc, perks: t.perks,
    })),
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
