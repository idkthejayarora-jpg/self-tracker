'use strict';
const db = require('../db/database');
const { overlap } = require('./localParser');

// ── Award points (append to points_log) ──────────────────────────────────────
function awardPoints(userId, source, action, points, sourceId = null, note = null) {
  try {
    db.prepare(`
      INSERT INTO points_log (user_id, source, source_id, action, points, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, source, sourceId, action, points, note);
  } catch (e) {
    console.error('[points] awardPoints failed:', e.message);
  }
}

// ── Dedup: has this exact source+sourceId+action already been awarded today? ─
function alreadyAwardedToday(userId, source, sourceId, action) {
  try {
    return !!db.prepare(
      `SELECT 1 FROM points_log
       WHERE user_id = ? AND source = ? AND COALESCE(source_id, 0) = COALESCE(?, 0)
         AND action = ? AND DATE(created_at) = DATE('now')
       LIMIT 1`
    ).get(userId, source, sourceId, action);
  } catch (_) { return false; }
}

// One-shot guard for actions that should only fire once per (source, sourceId, action) — ever.
function alreadyAwardedEver(userId, source, sourceId, action) {
  try {
    return !!db.prepare(
      `SELECT 1 FROM points_log
       WHERE user_id = ? AND source = ? AND COALESCE(source_id, 0) = COALESCE(?, 0)
         AND action = ? LIMIT 1`
    ).get(userId, source, sourceId, action);
  } catch (_) { return false; }
}

function getTotalPoints(userId) {
  try {
    const row = db.prepare('SELECT SUM(points) as total FROM points_log WHERE user_id = ?').get(userId);
    return row?.total ?? 0;
  } catch { return 0; }
}

// ── XP level thresholds (lifetime points) ────────────────────────────────────
const LEVELS = [
  { level: 1, min: 0,     max: 499,   label: 'Beginner' },
  { level: 2, min: 500,   max: 1499,  label: 'Builder'  },
  { level: 3, min: 1500,  max: 3499,  label: 'Achiever' },
  { level: 4, min: 3500,  max: 6999,  label: 'Champion' },
  { level: 5, min: 7000,  max: 11999, label: 'Warrior'  },
  { level: 6, min: 12000, max: null,  label: 'Legend'   },
];

function getLevelInfo(total) {
  const current = LEVELS.findLast(l => total >= l.min) || LEVELS[0];
  const next = LEVELS.find(l => l.level === current.level + 1) || null;
  const progressPct = next
    ? Math.min(100, Math.round(((total - current.min) / (next.min - current.min)) * 100))
    : 100;
  return {
    level: current.level,
    levelLabel: current.label,
    nextLevel: next ? next.min - total : null,
    progressPct,
  };
}

// ── Skill XP — generic application from any activity ─────────────────────────
// Replaces the checkin-only computeSkillUpgrades pipeline. Any activity route
// can call this with a list of `hints` (keywords) and matching me_skills will
// gain XP. On overflow (xp >= 100), level increments and xp wraps.
//
// XP awards (per call):
//   workout: 10  (15 if hints include 'pr')
//   content: 12
//   sleep:    5
//   journal:  8
//   task:     6  (12 if priority='urgent')
//   habit:    5
//   body:     5
//   diet:     3
//
// Matches by tokenising hints, then for each skill computing overlap()
// against the combined skill.name + skill.category text.
function applySkillXP(userId, source, hints = []) {
  try {
    const skills = db.prepare('SELECT * FROM me_skills WHERE user_id = ?').all(userId);
    if (!skills.length) return [];

    const tokens = [];
    for (const h of hints) {
      if (!h) continue;
      String(h).toLowerCase().split(/\W+/).filter(t => t.length > 1).forEach(t => tokens.push(t));
    }
    if (!tokens.length) return [];

    // XP per source
    const xpMap = {
      workout: tokens.includes('pr') ? 15 : 10,
      content: 12,
      sleep:    5,
      journal:  8,
      task:     tokens.includes('urgent') ? 12 : 6,
      habit:    5,
      body:     5,
      diet:     3,
      milestone: 20,
    };
    const xpDelta = xpMap[source] ?? 5;

    const upgrades = [];
    for (const skill of skills) {
      const targetText = `${skill.name} ${skill.category || ''}`;
      const score = overlap(tokens, targetText);
      if (score < 0.4) continue;

      let newXp = (skill.xp || 0) + xpDelta;
      let newLevel = skill.level || 1;
      while (newXp >= 100) {
        newLevel++;
        newXp -= 100;
      }

      db.prepare('UPDATE me_skills SET level=?, xp=? WHERE id=?')
        .run(newLevel, newXp, skill.id);

      upgrades.push({ id: skill.id, name: skill.name, oldLevel: skill.level, newLevel, xp: newXp });
    }
    return upgrades;
  } catch (e) {
    console.error('[points] applySkillXP failed:', e.message);
    return [];
  }
}

module.exports = {
  awardPoints,
  alreadyAwardedToday,
  alreadyAwardedEver,
  getTotalPoints,
  getLevelInfo,
  applySkillXP,
};
