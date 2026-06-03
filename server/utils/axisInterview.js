'use strict';
const db = require('../db/database');
const { SQL_OFF } = require('./dateUtils');
const { analyzeUserData } = require('./lifeManager');

// ── Time-aware greeting ───────────────────────────────────────────────────────
function greeting(name) {
  const h = new Date().getHours();
  const part = h < 5 ? 'You’re up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const who  = name ? `, ${name}` : '';
  return `${part}${who}. Before we close out the day, I want to walk through a few things with you. Be honest with me.`;
}

// ── Data-aware "genuine concern" questions ────────────────────────────────────
// Each returns { id, topic, question } only when the underlying condition holds,
// so AXIS only raises things that are actually true about the user's day.
function buildConcerns(userId) {
  const out = [];
  const snap = analyzeUserData(userId);

  // No workout in the last 3 days
  const lastWorkout = db.prepare(
    `SELECT MAX(date) AS d FROM workout_sessions WHERE user_id=?`
  ).get(userId);
  const wkDays = lastWorkout?.d
    ? db.prepare(`SELECT CAST(julianday(date('now', ${SQL_OFF})) - julianday(?) AS INT) AS n`).get(lastWorkout.d)?.n
    : 999;
  if (wkDays >= 3) {
    out.push({ id: 'workout', topic: 'body', priority: 3,
      question: lastWorkout?.d
        ? `Your training's gone quiet — ${wkDays} days without a session logged. Is your body genuinely asking for rest, or is something else getting in the way?`
        : `I don't see any training logged yet. What's your relationship with movement right now — honestly?` });
  }

  // No sleep logged last night
  const sleptLast = db.prepare(
    `SELECT 1 FROM sleep_logs WHERE user_id=? AND date >= date('now', ${SQL_OFF}, '-1 day') LIMIT 1`
  ).get(userId);
  if (!sleptLast) {
    out.push({ id: 'sleep', topic: 'recovery', priority: 2,
      question: `I don't have last night's sleep. How did you actually rest — and how's your energy holding up today?` });
  }

  // Overdue tasks
  if (snap.overdueCount > 0) {
    out.push({ id: 'overdue', topic: 'focus', priority: 3,
      question: `You've got ${snap.overdueCount} task${snap.overdueCount > 1 ? 's' : ''} past the deadline. Which one are you avoiding — and what's really behind the delay?` });
  }

  // A habit broke its chain (3+ day miss penalty today)
  const brokeHabit = db.prepare(
    `SELECT COUNT(*) AS n FROM habit_penalties WHERE user_id=? AND kind='penalty' AND date >= date('now', ${SQL_OFF}, '-1 day')`
  ).get(userId);
  if ((brokeHabit?.n || 0) > 0) {
    out.push({ id: 'habit', topic: 'discipline', priority: 4,
      question: `A habit slipped past three days and it's costing you. What broke the chain — and what would it take to restart it tonight?` });
  }

  // Low recent mood
  if (snap.recentMoodAvg !== null && snap.recentMoodAvg <= 2.5) {
    out.push({ id: 'mood', topic: 'mental', priority: 5,
      question: `Your mood's been running low this week. I'm not going to gloss over that — what's sitting underneath it?` });
  }

  // Neglected life area
  if (snap.neglectedAreas?.length) {
    const a = snap.neglectedAreas[0];
    out.push({ id: 'neglect', topic: 'balance', priority: 2,
      question: `You haven't moved on ${a.name} in two weeks. Has it stopped mattering, or has it just quietly fallen off?` });
  }

  // Positive: strong streak — affirm + push
  if (snap.overallStreak >= 3) {
    out.push({ id: 'streak', topic: 'momentum', priority: 1,
      question: `You're ${snap.overallStreak} days into a streak — that's not nothing. What's the one thing keeping it alive, so we can protect it?` });
  }

  // Sort by priority (higher = more pressing), take top 3
  out.sort((a, b) => b.priority - a.priority);
  return out.slice(0, 3).map(({ priority, ...q }) => q);
}

// ── Closing reflection ────────────────────────────────────────────────────────
function generateClosing(userId, transcript) {
  const snap = analyzeUserData(userId);
  const answered = transcript.filter(t => t.a && t.a.trim()).length;
  const blob = transcript.map(t => (t.a || '').toLowerCase()).join(' ');

  const heavy = /(tired|exhausted|stressed|anxious|overwhelmed|sad|down|rough|hard|struggl|cant|can't|couldn|failed|lazy|stuck)/.test(blob);
  const strong = /(great|good|crushed|finished|proud|win|won|nailed|productive|energ|happy|calm|clear)/.test(blob);

  let opening;
  if (heavy && !strong) {
    opening = `Thank you for being straight with me. Today sounded heavy, and you still showed up to account for it — that matters more than you think.`;
  } else if (strong && !heavy) {
    opening = `That's a strong day, and I want you to actually register it instead of rushing past it. Momentum like this compounds.`;
  } else if (answered >= 4) {
    opening = `Okay. I've got a clear picture now. Mixed day — some weight, some wins — and you faced both honestly.`;
  } else {
    opening = `Logged. Even a short debrief keeps you in contact with your own life, so — good.`;
  }

  let nudge = '';
  if (snap.overdueCount > 0) nudge = ` Tomorrow, clear just one of those overdue items first — the rest gets lighter after that.`;
  else if (snap.neglectedAreas?.length) nudge = ` And give ${snap.neglectedAreas[0].name} ten minutes tomorrow. Small, but it breaks the neglect.`;
  else if (snap.overallStreak >= 3) nudge = ` Protect that streak tomorrow — it's becoming who you are.`;
  else nudge = ` Rest properly tonight. We go again tomorrow.`;

  return `${opening}${nudge}`;
}

module.exports = { greeting, buildConcerns, generateClosing };
