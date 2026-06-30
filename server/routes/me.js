const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const db = require('../db/database');
const { getTotalPoints } = require('../utils/pointsUtils');
const { SQL_OFF } = require('../utils/dateUtils');

router.use(authMiddleware);

// ── The Ascension Pyramid (v5 — 16 ranks, 5 leagues, pure-form gating) ────────
// Merit (0–100) = your CURRENT FORM, built live from five pillars:
//   Consistency (0–25) — current streak (the daily turn-up)
//   Discipline  (0–25) — habit + task completion rates
//   Vitality    (0–20) — training + sleep + endurance
//   Mastery     (0–15) — average skill level
//   Momentum    (0–15) — points grind + claimed milestones
//
// Your RANK is the highest tier your form has ever cracked — a permanent
// high-water mark (prestige). Form can dip without stripping your title; you
// only rise by setting a NEW peak. The summit (Aetherial Apex, merit 96+)
// demands near-perfect form across every pillar at once — exceptionally rare.
//
// 16 ranks climb through 5 leagues. Each rank owns a CARD FINISH (escalating
// premium look), an INSIGNIA shape, and a PERKS ladder.
//
//   V · MYTHIC   (86–100)  crowns     — ∞ M3 M2 M1   near-mythical apex tier
//   IV · RADIANT (67–85)   ringed stars — R3 R2 R1   the luminary elite
//   III · STORM  (46–66)   stars      — S3 S2 S1      command ascent
//   II · IRON    (22–45)   barred chevrons — I3 I2 I1 forged by repetition
//   I · ASH      (0–21)    chevrons   — A3 A2 A1       the climb begins
//
// Ordered HIGH → LOW so getRankFromMerit returns the first tier you satisfy.
const RANK_TIERS = [
  { rank: '∞',  code: '∞',  cls: 'MYTHIC',  min: 96, color: '#f0c27a', tier: 'aurora',   label: 'Aetherial Apex',      desc: 'The summit — near-perfect form across every pillar',
    insignia: { shape: 'crown', count: 0, bar: false, ring: false, crown: 3 },
    perks: ['Living aurora card — the rarest finish', 'Eternal halo & sparkle crown', 'The single highest rank in existence', 'Form 96+/100 sustained — almost nobody reaches here'] },
  { rank: 'M3', code: 'M3', cls: 'MYTHIC',  min: 93, color: '#e8a87c', tier: 'aurora',   label: 'Mythic Transcendent', desc: 'Beyond elite — one breath from the apex',
    insignia: { shape: 'crown', count: 0, bar: false, ring: false, crown: 2 },
    perks: ['Aurora card finish', 'Haloed crown insignia', 'Transcendent banner'] },
  { rank: 'M2', code: 'M2', cls: 'MYTHIC',  min: 90, color: '#e0975a', tier: 'obsidian', label: 'Mythic Eternal',      desc: 'Holographic monarch — the air is thin up here',
    insignia: { shape: 'crown', count: 0, bar: false, ring: false, crown: 1 },
    perks: ['Holographic card', 'Jewelled crown', 'Eternal seal'] },
  { rank: 'M1', code: 'M1', cls: 'MYTHIC',  min: 86, color: '#cd5240', tier: 'obsidian', label: 'Mythic Sovereign',    desc: 'You enter the Mythic league — the final ascent',
    insignia: { shape: 'crown', count: 0, bar: false, ring: false, crown: 0 },
    perks: ['Holographic foil card', 'Sovereign crown insignia', 'Mythic-league banner'] },
  { rank: 'R3', code: 'R3', cls: 'RADIANT', min: 80, color: '#c2553d', tier: 'crimson',  label: 'Radiant Ascendant',   desc: 'Top of the luminary elite — Mythic beckons',
    insignia: { shape: 'star', count: 3, bar: false, ring: true, crown: 0 },
    perks: ['Crimson foil card', 'Triple ringed star', 'Ascendant seal'] },
  { rank: 'R2', code: 'R2', cls: 'RADIANT', min: 74, color: '#d96a4e', tier: 'crimson',  label: 'Radiant Paragon',     desc: 'A paragon among the few who reach this air',
    insignia: { shape: 'star', count: 2, bar: false, ring: true, crown: 0 },
    perks: ['Crimson card', 'Twin ringed stars', 'Paragon banner'] },
  { rank: 'R1', code: 'R1', cls: 'RADIANT', min: 67, color: '#e08b4e', tier: 'gold',     label: 'Radiant Knight',      desc: 'You break into the Radiant league — luminary tier',
    insignia: { shape: 'star', count: 1, bar: false, ring: true, crown: 0 },
    perks: ['Gold-foil card', 'Ringed star insignia', 'Radiant-league banner'] },
  { rank: 'S3', code: 'S3', cls: 'STORM',   min: 60, color: '#d97757', tier: 'gold',     label: 'Storm Sovereign',     desc: 'Commands every front — peak of the Storm league',
    insignia: { shape: 'star', count: 3, bar: false, ring: false, crown: 0 },
    perks: ['Gold-foil card', 'Triple-star insignia', 'Storm-league banner'] },
  { rank: 'S2', code: 'S2', cls: 'STORM',   min: 53, color: '#db8f50', tier: 'silver',   label: 'Storm Breaker',       desc: 'Breaking through — the ascent steepens',
    insignia: { shape: 'star', count: 2, bar: false, ring: false, crown: 0 },
    perks: ['Silver-foil card', 'Twin-star insignia', 'Animated sheen'] },
  { rank: 'S1', code: 'S1', cls: 'STORM',   min: 46, color: '#d49a45', tier: 'silver',   label: 'Storm Caller',        desc: 'You enter the Storm league — command tier',
    insignia: { shape: 'star', count: 1, bar: false, ring: false, crown: 0 },
    perks: ['Silver-foil card', 'Star insignia', 'Card sheen'] },
  { rank: 'I3', code: 'I3', cls: 'IRON',    min: 38, color: '#cf8a3e', tier: 'iron',     label: 'Iron Warden',         desc: 'Tempered hard — top of the Iron league',
    insignia: { shape: 'chevron', count: 3, bar: true, ring: false, crown: 0 },
    perks: ['Iron-plate card', 'Triple barred chevron', 'Warden stamp'] },
  { rank: 'I2', code: 'I2', cls: 'IRON',    min: 30, color: '#c0894f', tier: 'iron',     label: 'Iron Vanguard',       desc: 'Forged by repetition — holding the line',
    insignia: { shape: 'chevron', count: 2, bar: true, ring: false, crown: 0 },
    perks: ['Iron-plate card', 'Barred chevrons', 'Vanguard stamp'] },
  { rank: 'I1', code: 'I1', cls: 'IRON',    min: 22, color: '#b5895f', tier: 'bronze',   label: 'Iron Recruit',        desc: 'You enter the Iron league — forged tier',
    insignia: { shape: 'chevron', count: 1, bar: true, ring: false, crown: 0 },
    perks: ['Bronze-edged card', 'Barred chevron insignia'] },
  { rank: 'A3', code: 'A3', cls: 'ASH',     min: 14, color: '#a9906b', tier: 'bronze',   label: 'Ash Forged',          desc: 'Real foundations — top of the Ash league',
    insignia: { shape: 'chevron', count: 3, bar: false, ring: false, crown: 0 },
    perks: ['Bronze-edged card', 'Triple chevron insignia'] },
  { rank: 'A2', code: 'A2', cls: 'ASH',     min:  7, color: '#9a8a6e', tier: 'kraft',    label: 'Ash Cinder',          desc: 'Catching — earning every point',
    insignia: { shape: 'chevron', count: 2, bar: false, ring: false, crown: 0 },
    perks: ['Kraft card', 'Double chevron insignia'] },
  { rank: 'A1', code: 'A1', cls: 'ASH',     min:  0, color: '#8a8473', tier: 'kraft',    label: 'Ash Ember',           desc: 'The climb begins — base of the pyramid',
    insignia: { shape: 'chevron', count: 1, bar: false, ring: false, crown: 0 },
    perks: ['Full tracker unlocked', 'Kraft rank card', 'Merit tracking begins'] },
];

// League display metadata — drives the class banner + sidebar pill.
const LEAGUE_META = {
  MYTHIC:  { label: 'Mythic',  roman: 'V',   sublabel: 'Apex tier · near-mythical',     color: '#e8a87c' },
  RADIANT: { label: 'Radiant', roman: 'IV',  sublabel: 'Luminary tier · the elite few', color: '#e08b4e' },
  STORM:   { label: 'Storm',   roman: 'III', sublabel: 'Command tier · the ascent',     color: '#d97757' },
  IRON:    { label: 'Iron',    roman: 'II',  sublabel: 'Forged tier · tempered hard',   color: '#cf8a3e' },
  ASH:     { label: 'Ash',     roman: 'I',   sublabel: 'Ground tier · the climb begins', color: '#a5a293' },
};

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

  // ── Merit-based rank (pure form) + prestige high-water mark ──
  const merit = computeMeritScore(stats, skills, claims, totalPoints, maxCurrentStreak);
  const currentForm = merit.total;                          // live, can dip

  // Peak merit = the highest form you've ever reached. Rank is derived from
  // this, so a dip in current form never strips your hard-won title.
  const storedPeak = (db.prepare('SELECT peak_merit FROM me_profile WHERE user_id=?').get(uid) || {}).peak_merit || 0;
  const peakMerit = Math.max(storedPeak, currentForm);
  if (peakMerit > storedPeak) {
    db.prepare(`
      INSERT INTO me_profile (user_id, peak_merit) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET peak_merit = excluded.peak_merit
    `).run(uid, peakMerit);
  }

  const rankTier = getRankFromMerit(peakMerit);             // your peak title
  const nextTier = getNextRank(rankTier.rank);
  const league   = LEAGUE_META[rankTier.cls] || {};

  const ladderEntry = (t) => ({
    rank: t.rank, code: t.code, cls: t.cls, min: t.min, color: t.color,
    tier: t.tier, label: t.label, desc: t.desc, perks: t.perks,
    insignia: t.insignia,
    league: (LEAGUE_META[t.cls] || {}).label || t.cls,
  });

  res.json({
    profile,
    rank:        rankTier.code,           // short badge code (peak)
    rankCode:    rankTier.code,
    rankName:    rankTier.label,          // full mythic title (peak)
    rankClass:   rankTier.cls,            // league key
    leagueLabel: league.label || rankTier.cls,
    leagueRoman: league.roman || '',
    leagueSub:   league.sublabel || '',
    rankColor:   rankTier.color,
    rankLabel:   rankTier.label,
    rankDesc:    rankTier.desc,
    rankTier:    rankTier.tier,
    rankPerks:   rankTier.perks,
    insignia:    rankTier.insignia,
    // Form vs peak
    meritScore:     currentForm,          // kept name — drives existing form bars
    currentForm,
    peakMerit,
    meritBreakdown: merit.breakdown,
    nextRank: nextTier ? {
      rank:      nextTier.code,
      code:      nextTier.code,
      name:      nextTier.label,
      rankClass: nextTier.cls,
      league:    (LEAGUE_META[nextTier.cls] || {}).label || nextTier.cls,
      min:       nextTier.min,
      color:     nextTier.color,
      label:     nextTier.label,
      tier:      nextTier.tier,
      perks:     nextTier.perks,
      insignia:  nextTier.insignia,
      formToGo:  Math.max(0, nextTier.min - currentForm),
    } : null,
    // Full ladder (low → high) so the UI can show every rank's card + perks
    ranks: [...RANK_TIERS].reverse().map(ladderEntry),
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
