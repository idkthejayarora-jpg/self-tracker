'use strict';
const db = require('../db/database');
const { awardPoints } = require('./pointsUtils');
const { localDate } = require('./dateUtils');

// ── Tunables ─────────────────────────────────────────────────────────────────
const MISS_THRESHOLD = 3;     // days missed in a row before enforcement kicks in
const PENALTY_BASE   = 100;   // day-3 penalty
const PENALTY_CAP    = 400;
const REDEEM_PER     = 50;    // redemption = REDEEM_PER * missStreak
const REDEEM_CAP     = 400;
const MOMENTUM_HOURS = 24;
const MOMENTUM_MULT  = 2.0;

// Escalating penalty: day3 -100, day4 -200, day5+ -400 (capped). Returns a
// positive magnitude (caller applies the negative sign).
function penaltyFor(missStreak) {
  if (missStreak < MISS_THRESHOLD) return 0;
  return Math.min(PENALTY_CAP, PENALTY_BASE * Math.pow(2, missStreak - MISS_THRESHOLD));
}

// Comeback bonus — scales with how deep the hole was.
function redemptionFor(missStreak) {
  return Math.min(REDEEM_CAP, REDEEM_PER * missStreak);
}

// ── Date helpers ──────────────────────────────────────────────────────────────
// Decrement a YYYY-MM-DD string by one day, anchored at UTC noon to avoid any
// DST/timezone drift (pure calendar arithmetic — no wall-clock involved).
function prevDay(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ── Miss-streak: consecutive missed days ending YESTERDAY ─────────────────────
// A day is "missed" if there is no habit_log with done=1 for that date.
// Today is never counted (the day isn't over). Clamped at the habit's
// creation date — a habit can't be missed before it existed.
function computeMissStreak(userId, habit) {
  const habitStart = String(habit.created_at).slice(0, 10); // YYYY-MM-DD

  // Pull all done=1 dates into a Set for O(1) lookups (one query, not N).
  const doneRows = db.prepare(
    'SELECT date FROM habit_logs WHERE user_id = ? AND habit_id = ? AND done = 1'
  ).all(userId, habit.id);
  const doneSet = new Set(doneRows.map(r => r.date));

  let miss = 0;
  let day = prevDay(localDate());      // start at yesterday (local)
  for (let n = 0; n < 365; n++) {
    if (day < habitStart) break;        // before the habit existed → stop
    if (doneSet.has(day)) break;        // a completed day breaks the miss streak
    miss++;
    day = prevDay(day);
  }
  return miss;
}

// ── Momentum buff ─────────────────────────────────────────────────────────────
function activeMomentum(userId) {
  const row = db.prepare(
    `SELECT * FROM user_buffs
     WHERE user_id = ? AND kind = 'momentum' AND expires_at > datetime('now')
     ORDER BY expires_at DESC LIMIT 1`
  ).get(userId);
  return row || null;
}

function grantMomentum(userId) {
  // Replace any existing momentum buff with a fresh 24h window.
  db.prepare(`DELETE FROM user_buffs WHERE user_id = ? AND kind = 'momentum'`).run(userId);
  db.prepare(
    `INSERT INTO user_buffs (user_id, kind, multiplier, expires_at)
     VALUES (?, 'momentum', ?, datetime('now', '+${MOMENTUM_HOURS} hours'))`
  ).run(userId, MOMENTUM_MULT);
  return activeMomentum(userId);
}

// ── Enforcement scan — applies pending daily penalties idempotently ───────────
// Lazy-eval on app open (no cron). Returns the current violation list.
function runEnforcement(userId) {
  const today  = localDate();
  const habits = db.prepare('SELECT * FROM habits WHERE user_id = ?').all(userId);
  const violations = [];

  for (const habit of habits) {
    // Done today → back on track, not a current violation (and no new penalty).
    const doneToday = db.prepare(
      'SELECT 1 FROM habit_logs WHERE user_id=? AND habit_id=? AND date=? AND done=1 LIMIT 1'
    ).get(userId, habit.id, today);
    if (doneToday) continue;

    const missStreak = computeMissStreak(userId, habit);
    if (missStreak < MISS_THRESHOLD) continue;

    const amount = penaltyFor(missStreak);

    // Already penalized this habit today? (UNIQUE guard on insert too)
    const already = db.prepare(
      `SELECT 1 FROM habit_penalties WHERE user_id=? AND habit_id=? AND date=? AND kind='penalty' LIMIT 1`
    ).get(userId, habit.id, today);

    if (!already) {
      try {
        db.prepare(
          `INSERT INTO habit_penalties (user_id, habit_id, date, kind, miss_streak, points)
           VALUES (?, ?, ?, 'penalty', ?, ?)`
        ).run(userId, habit.id, today, missStreak, -amount);
        awardPoints(userId, 'habit_penalty', 'miss', -amount, habit.id, habit.name);
      } catch (e) {
        // UNIQUE race — penalty already applied; ignore
        if (!/UNIQUE/i.test(e.message)) console.error('[habitEnforcement] penalty insert:', e.message);
      }
    }

    violations.push({
      habit_id:    habit.id,
      name:        habit.name,
      icon:        habit.icon,
      color:       habit.color,
      missStreak,
      penaltyToday: amount,
    });
  }

  return violations;
}

module.exports = {
  MISS_THRESHOLD,
  penaltyFor,
  redemptionFor,
  computeMissStreak,
  activeMomentum,
  grantMomentum,
  runEnforcement,
};
