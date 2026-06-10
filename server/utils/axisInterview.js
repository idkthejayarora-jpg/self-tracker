'use strict';
const db = require('../db/database');
const { SQL_OFF } = require('./dateUtils');
const { analyzeUserData } = require('./lifeManager');

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ── Time-aware greeting — the way a friend opens a call ─────────────────────
function greeting(name) {
  const h = new Date().getHours();
  // ", <name>" only when we actually know one — avoids "Hey hey" fallbacks
  const n = name ? `, ${name}` : '';
  if (h < 5) return pick([
    `Still up${n}? Alright — since we're both here, let's close the day out properly.`,
    `It's late${n}. Before you crash, talk to me for a minute.`,
  ]);
  if (h < 12) return pick([
    `Morning${n}. Let's take stock before the day runs off with you.`,
    `Hey${n} — got a minute? Let's look at where things stand.`,
  ]);
  if (h < 17) return pick([
    `Hey${n}. Midday check-in — nothing formal, just talk to me.`,
    `Afternoon${n}. Let's see how the day's treating you.`,
  ]);
  return pick([
    `Evening${n}. Day's winding down — let's talk it through.`,
    `Hey${n}. Before the day closes, walk me through it.`,
    `Alright${n}, it's that time. Just you and me — how did today go?`,
  ]);
}

// ── Data-aware "genuine concern" questions ────────────────────────────────────
// Each returns { id, topic, question } only when the underlying condition holds,
// so Jay only brings up things that are actually true about the user's day —
// phrased the way a person who noticed would actually say it.
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
        ? pick([
            `By the way — I noticed you haven't trained in ${wkDays} days. Is your body asking for rest, or is something else going on?`,
            `One thing I caught: no training for ${wkDays} days now. What's that about — rest, or avoidance?`,
          ])
        : `I haven't seen any training from you yet. Where are you at with moving your body — honestly?` });
  }

  // No sleep logged last night
  const sleptLast = db.prepare(
    `SELECT 1 FROM sleep_logs WHERE user_id=? AND date >= date('now', ${SQL_OFF}, '-1 day') LIMIT 1`
  ).get(userId);
  if (!sleptLast) {
    out.push({ id: 'sleep', topic: 'recovery', priority: 2,
      question: pick([
        `You never told me how you slept last night. How was it really — and how's the energy been holding up today?`,
        `I don't have last night's sleep from you. Rough night, or did it just slip your mind? How rested do you actually feel?`,
      ]) });
  }

  // Overdue tasks
  if (snap.overdueCount > 0) {
    const n = snap.overdueCount;
    out.push({ id: 'overdue', topic: 'focus', priority: 3,
      question: pick([
        `So… there ${n > 1 ? `are ${n} things` : `'s one thing`} sitting past deadline. Which one are you dodging — and what's really behind it?`,
        `You've got ${n > 1 ? `${n} overdue tasks` : `an overdue task`} hanging around. What's the real reason it hasn't moved?`,
      ]) });
  }

  // A habit broke its chain (3+ day miss penalty today)
  const brokeHabit = db.prepare(
    `SELECT COUNT(*) AS n FROM habit_penalties WHERE user_id=? AND kind='penalty' AND date >= date('now', ${SQL_OFF}, '-1 day')`
  ).get(userId);
  if ((brokeHabit?.n || 0) > 0) {
    out.push({ id: 'habit', topic: 'discipline', priority: 4,
      question: pick([
        `One of your habits slipped past three days — that chain's broken. What happened there? And could you restart it tonight?`,
        `A habit streak just died on you. No lecture — I just want to know what broke it.`,
      ]) });
  }

  // Low recent mood
  if (snap.recentMoodAvg !== null && snap.recentMoodAvg <= 2.5) {
    out.push({ id: 'mood', topic: 'mental', priority: 5,
      question: pick([
        `I've noticed your mood's been low all week. I'm not going to pretend I didn't see it — what's underneath that?`,
        `Your week's been heavier than usual, mood-wise. What's actually going on?`,
      ]) });
  }

  // Neglected life area
  if (snap.neglectedAreas?.length) {
    const a = snap.neglectedAreas[0];
    out.push({ id: 'neglect', topic: 'balance', priority: 2,
      question: pick([
        `It's been two weeks since you touched ${a.name}. Did it stop mattering, or did it just quietly fall off the radar?`,
        `${a.name} has gone quiet on your end — two weeks, nothing. Still care about it?`,
      ]) });
  }

  // Positive: strong streak — affirm + push
  if (snap.overallStreak >= 3) {
    out.push({ id: 'streak', topic: 'momentum', priority: 1,
      question: pick([
        `You're ${snap.overallStreak} days into a streak, by the way — that's real. What's keeping it alive?`,
        `Quick one — ${snap.overallStreak} straight days now. What's the secret, so we don't lose it?`,
      ]) });
  }

  // Sort by priority (higher = more pressing), take top 3
  out.sort((a, b) => b.priority - a.priority);
  return out.slice(0, 3).map(({ priority, ...q }) => q);
}

// ── Closing reflection — a friend's honest sign-off, not a system report ─────
function generateClosing(userId, transcript) {
  const hour = new Date().getHours();
  const evening = hour >= 17 || hour < 5;
  const tod = evening ? 'tonight' : 'today';
  const snap = analyzeUserData(userId);
  const answered = transcript.filter(t => t.a && t.a.trim()).length;
  const blob = transcript.map(t => (t.a || '').toLowerCase()).join(' ');

  const heavy = /(tired|exhausted|stressed|anxious|overwhelmed|sad|down|rough|hard|struggl|cant|can't|couldn|failed|lazy|stuck)/.test(blob);
  const strong = /(great|good|crushed|finished|proud|win|won|nailed|productive|energ|happy|calm|clear)/.test(blob);

  let opening;
  if (heavy && !strong) {
    opening = pick([
      `Listen… today sounded heavy. And you still sat here and told me the truth about it. That counts for more than you think.`,
      `Okay. Rough one — I'm not going to dress it up. But you showed up and said it out loud, and that's how heavy days lose their grip.`,
    ]);
  } else if (strong && !heavy) {
    opening = pick([
      `You know what — that was a good day. Don't rush past it. Actually let it land.`,
      `That's a strong day, and I want you to notice it instead of already thinking about tomorrow. Days like this stack up.`,
    ]);
  } else if (answered >= 4) {
    opening = pick([
      `Alright, I've got the picture. Mixed day — some weight, some wins — and you were straight with me about both. That's all I ask.`,
      `Okay. Bit of both today, then. You didn't hide the rough parts, and that matters.`,
    ]);
  } else {
    opening = pick([
      `Short one ${tod} — that's fine. Even checking in keeps you honest with yourself.`,
      `That's enough for today. Showing up at all is the part most people skip.`,
    ]);
  }

  let nudge = '';
  if (snap.overdueCount > 0) nudge = pick([
    ` Tomorrow, knock out just one of those overdue things first — watch how much lighter the rest feels.`,
    ` Do me one favor tomorrow: clear one overdue item before anything else. Just one.`,
  ]);
  else if (snap.neglectedAreas?.length) nudge = pick([
    ` And give ${snap.neglectedAreas[0].name} ten minutes tomorrow. Ten. That's all it takes to break the silence.`,
    ` Oh — and ${snap.neglectedAreas[0].name}. Ten minutes tomorrow. You'll be glad you did.`,
  ]);
  else if (snap.overallStreak >= 3) nudge = pick([
    ` Protect that streak tomorrow. It's quietly becoming who you are.`,
    ` And don't let that streak die tomorrow — it's the best thing you've got going.`,
  ]);
  else nudge = evening ? pick([
    ` Get some real rest tonight. We go again tomorrow.`,
    ` Sleep properly tonight, yeah? Tomorrow we go again.`,
  ]) : pick([
    ` Keep the rest of the day simple — one thing at a time.`,
    ` There's still day left — spend it on something that matters.`,
  ]);

  return `${opening}${nudge}`;
}

module.exports = { greeting, buildConcerns, generateClosing };
