'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL RULE-BASED PARSER
// No external API — pure regex + keyword matching.
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. MOOD ───────────────────────────────────────────────────────────────────
const MOOD_RULES = [
  { score: 1, rx: /\b(depressed|hopeless|devastated|terrible|horrible|awful|miserable|crying|breakdown|panic|cant cope|can't cope|falling apart)\b/i },
  { score: 2, rx: /\b(stressed|anxious|overwhelmed|drained|burned.?out|frustrated|angry|worried|exhausted|rough day|bad day|struggling|upset|tired|low energy)\b/i },
  { score: 3, rx: /\b(okay|ok|alright|fine|decent|so.?so|average|meh|neutral|not bad|managing)\b/i },
  { score: 4, rx: /\b(good|happy|content|pleased|satisfied|productive|accomplished|motivated|solid|well|focused|confident)\b/i },
  { score: 5, rx: /\b(great|amazing|fantastic|excellent|incredible|awesome|pumped|energized|on fire|crushing it|killing it|best day|proud|epic|euphoric|unstoppable|locked in)\b/i },
];

function detectMood(text) {
  for (let i = MOOD_RULES.length - 1; i >= 0; i--) {
    if (MOOD_RULES[i].rx.test(text)) return MOOD_RULES[i].score;
  }
  return null;
}

// ── 2. SLEEP ──────────────────────────────────────────────────────────────────
const BED_RX   = /(?:slept\s+at|went\s+to\s+bed\s+(?:at|around)|bed\s+at|sleep\s+at|crashed\s+at|knocked\s+out\s+at|passed\s+out\s+at|lights?\s+out\s+at)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
const WAKE_RX  = /(?:woke\s+(?:up\s+)?(?:at|around)|up\s+at|awoke?\s+(?:at|around)|alarm\s+(?:at|was))\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
const DUR_RX   = /(?:(?:slept|got|had)\s+(?:(?:about|around|only|just)\s+)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:of\s+sleep)?)|(?:(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s+(?:of\s+sleep|sleep))/i;
const SLEEP_QUALITY = {
  bad:  /\b(couldn't sleep|couldn't fall asleep|bad sleep|terrible sleep|restless|insomnia|tossing|turning|barely slept|poor sleep)\b/i,
  ok:   /\b(okay sleep|decent sleep|slept okay|average sleep|so.?so sleep)\b/i,
  good: /\b(slept well|good sleep|great sleep|amazing sleep|deep sleep|slept great|solid sleep|slept through)\b/i,
};

function normaliseHour(h, m, ampm, ctx) {
  h = parseInt(h, 10);
  m = parseInt(m || '0', 10);
  if (ampm) {
    const ap = ampm.toLowerCase();
    if (ap === 'pm' && h !== 12) h += 12;
    else if (ap === 'am' && h === 12) h = 0;
  } else {
    // Heuristic: bedtime context → 8–11 is likely PM; wake context → 4–11 stays AM
    if (ctx === 'bed' && h >= 8 && h <= 11) h += 12;
    if (ctx === 'bed' && h === 12) h = 0; // midnight
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function detectSleep(text) {
  const bedMatch  = BED_RX.exec(text);
  const wakeMatch = WAKE_RX.exec(text);
  const durMatch  = DUR_RX.exec(text);

  const bedtime   = bedMatch  ? normaliseHour(bedMatch[1],  bedMatch[2],  bedMatch[3],  'bed')  : null;
  const wake_time = wakeMatch ? normaliseHour(wakeMatch[1], wakeMatch[2], wakeMatch[3], 'wake') : null;

  let duration_minutes = null;
  if (durMatch) {
    const hrs = parseFloat(durMatch[1] || durMatch[2]);
    duration_minutes = Math.round(hrs * 60);
  } else if (bedtime && wake_time) {
    const [bh, bm] = bedtime.split(':').map(Number);
    const [wh, wm] = wake_time.split(':').map(Number);
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    if (mins < 0) mins += 1440;
    duration_minutes = mins;
  }

  // Quality from keywords, or estimate from duration
  let quality = null;
  if (SLEEP_QUALITY.bad.test(text))  quality = 2;
  else if (SLEEP_QUALITY.ok.test(text))  quality = 3;
  else if (SLEEP_QUALITY.good.test(text)) quality = 5;
  else if (duration_minutes) {
    if      (duration_minutes >= 480) quality = 5;
    else if (duration_minutes >= 420) quality = 4;
    else if (duration_minutes >= 360) quality = 3;
    else                              quality = 2;
  }

  if (!bedtime && !wake_time && !duration_minutes) return null;
  return { bedtime, wake_time, duration_minutes, quality, notes: null };
}

// ── 3. TASK & HABIT FUZZY MATCHING ───────────────────────────────────────────
// Completion signals before the subject
const DONE_SIGNALS = /\b(finished|completed|done with|wrapped up|knocked out|checked off|submitted|sent|delivered|fixed|solved|wrote|written|read|reviewed|attended|called|posted|published|launched|shipped|recorded|filmed|edited|cleaned|cooked|paid|booked|signed|filed)\b/i;

function tokenise(str) {
  return str.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

// Returns 0–1 overlap score (how many target tokens appear in query)
function overlap(queryTokens, targetStr) {
  const tTokens = tokenise(targetStr);
  if (!tTokens.length) return 0;
  const matched = tTokens.filter(t => queryTokens.some(q => q === t || q.includes(t) || t.includes(q)));
  return matched.length / tTokens.length;
}

function detectCompletedTasks(text, tasks) {
  if (!tasks.length) return [];
  // Only scan around completion signal words
  if (!DONE_SIGNALS.test(text)) return [];
  const qTokens = tokenise(text);
  return tasks
    .filter(t => overlap(qTokens, t.title) >= 0.5)
    .map(t => t.id);
}

function detectCompletedHabits(text, habits) {
  if (!habits.length) return [];
  const qTokens = tokenise(text);
  // For habits we're more permissive — any mention with enough overlap
  return habits
    .filter(h => !h.done && overlap(qTokens, h.name) >= 0.5)
    .map(h => h.id);
}

// ── 4. WORKOUT / SKILL DETECTION ─────────────────────────────────────────────
const MUSCLE_MAP = [
  { key: 'back',      emoji: '🔙', label: 'Back',         rx: /\b(back\s+day|hit\s+back|train\s+back|back\s+workout|lats?|deadlift|row|pull.?up|pulldown|rack\s+pull|good\s+morning)\b/i },
  { key: 'chest',     emoji: '🏋️', label: 'Chest',        rx: /\b(chest\s+day|hit\s+chest|bench|pec|push.?up|fly|chest\s+press|incline|decline|dips?)\b/i },
  { key: 'legs',      emoji: '🦵', label: 'Legs',         rx: /\b(leg\s+day|hit\s+legs|squat|quad|hamstring|glute|lunge|calf|leg\s+press|rdl|hip\s+thrust|hack\s+squat)\b/i },
  { key: 'shoulders', emoji: '🔱', label: 'Shoulders',    rx: /\b(shoulder|ohp|overhead\s+press|lateral\s+raise|delt|shrug|front\s+raise|arnold|pike)\b/i },
  { key: 'arms',      emoji: '💪', label: 'Arms',         rx: /\b(arm\s+day|bicep|tricep|curl|skullcrusher|hammer\s+curl|preacher|cable\s+curl|dips?)\b/i },
  { key: 'core',      emoji: '🎯', label: 'Core / Abs',   rx: /\b(core|abs?|plank|crunch|oblique|sit.?up|cable\s+crunch|hanging\s+raise|l.sit)\b/i },
  { key: 'cardio',    emoji: '🏃', label: 'Cardio',       rx: /\b(ran|run|running|cardio|jog|jogged|cycling|swim|hiit|sprint|treadmill|stairmaster|skipping|jump\s+rope|walked\s+\d+|walked\s+for)\b/i },
  { key: 'yoga',      emoji: '🧘', label: 'Flexibility',  rx: /\b(yoga|stretch|mobility|flexibility|foam\s+roll|pilates)\b/i },
  { key: 'martial',   emoji: '🥊', label: 'Martial Arts', rx: /\b(mma|boxing|jiu.?jitsu|bjj|muay\s+thai|kickbox|karate|wrestling|sparring|grappling)\b/i },
];

// PR detection — any mention of personal record / new best
const PR_RX      = /\b(?:new\s+)?(?:pr|pb|personal\s+(?:record|best)|new\s+(?:record|best)|hit\s+a\s+(?:new\s+)?(?:pr|pb|record)|new\s+max)\b/i;
const WEIGHT_RX  = /\b(\d+(?:\.\d+)?)\s*(?:kg|kgs|lbs?|pounds?)\b/i;

function detectWorkout(text) {
  const muscles = MUSCLE_MAP.filter(m => m.rx.test(text)).map(m => m.key);
  const hasPR    = PR_RX.test(text);
  const weightMatch = WEIGHT_RX.exec(text);
  const weight   = weightMatch ? parseFloat(weightMatch[1]) : null;

  // General workout mention even if no specific muscle
  const generalWorkout = /\b(worked out|gym|workout|training|trained|session|lifting|weights|exercise)\b/i.test(text);

  return {
    muscles,
    hasPR,
    weight,
    hasWorkout: muscles.length > 0 || generalWorkout,
  };
}

// ── 5. SKILL AUTO-UPGRADE ─────────────────────────────────────────────────────
// Given detected activities, returns list of {skill_id, xp_delta, label} to apply
// Skills matched by keyword overlap between skill name and muscle label / key
function computeSkillUpgrades(workoutResult, userSkills) {
  if (!workoutResult.hasWorkout && !workoutResult.hasPR) return [];
  const upgrades = [];
  const seen = new Set();

  for (const muscleKey of workoutResult.muscles) {
    const muscle = MUSCLE_MAP.find(m => m.key === muscleKey);
    if (!muscle) continue;
    const xp = workoutResult.hasPR ? 25 : 10;

    // Find user skills whose name overlaps with this muscle label/key
    const matched = userSkills.filter(s => {
      const sTokens = tokenise(s.name);
      const mTokens = tokenise(muscle.label + ' ' + muscle.key);
      return sTokens.some(st => mTokens.some(mt => st === mt || st.includes(mt) || mt.includes(st)));
    });

    for (const skill of matched) {
      if (!seen.has(skill.id)) {
        seen.add(skill.id);
        upgrades.push({ skill_id: skill.id, skill_name: skill.name, xp_delta: xp,
          reason: workoutResult.hasPR ? `New PR — ${muscle.label}` : `${muscle.label} workout` });
      }
    }

    // Also match any skill with "health", "fitness", "strength", "physical" in name
    const generalSkills = userSkills.filter(s =>
      !seen.has(s.id) && /\b(health|fitness|strength|physical|athletic|body|training|workout)\b/i.test(s.name)
    );
    for (const skill of generalSkills) {
      seen.add(skill.id);
      upgrades.push({ skill_id: skill.id, skill_name: skill.name, xp_delta: workoutResult.hasPR ? 15 : 8,
        reason: `Workout activity detected` });
    }
  }

  // General workout (no specific muscle) → only update generic health/fitness skills
  if (workoutResult.muscles.length === 0 && workoutResult.hasWorkout) {
    const generalSkills = userSkills.filter(s =>
      !seen.has(s.id) && /\b(health|fitness|strength|physical|athletic|body|training|workout)\b/i.test(s.name)
    );
    for (const skill of generalSkills) {
      seen.add(skill.id);
      upgrades.push({ skill_id: skill.id, skill_name: skill.name, xp_delta: 8, reason: 'Workout logged' });
    }
  }

  return upgrades;
}

// ── 6. FRIENDLY RESPONSE (template-based) ────────────────────────────────────
const CLOSERS = [
  'Keep building.', 'Stay consistent.', 'The work compounds.',
  'Level up in progress.', 'You\'re on the path.', 'Momentum is real.',
  'One day at a time.', 'Consistency is the cheat code.',
];

function buildResponse(mood, tasks, habits, sleep, skillUpgrades, workoutResult) {
  const parts = [];

  if (mood) {
    const labels = { 1: 'rough', 2: 'tough', 3: 'okay', 4: 'good', 5: 'great' };
    const openers = {
      1: 'Rough one — that\'s noted.', 2: 'Tough day logged.',
      3: 'Okay day — still showing up.', 4: 'Good day.', 5: 'You\'re on fire.',
    };
    parts.push(openers[mood] || `Feeling ${labels[mood]} today.`);
  }

  if (sleep) {
    if (sleep.duration_minutes) {
      const h = Math.floor(sleep.duration_minutes / 60);
      const m = sleep.duration_minutes % 60;
      parts.push(`Logged ${h}h${m > 0 ? ` ${m}m` : ''} of sleep.`);
    } else {
      parts.push('Sleep logged.');
    }
  }

  if (tasks.length)   parts.push(`${tasks.length} task${tasks.length > 1 ? 's' : ''} marked done.`);
  if (habits.length)  parts.push(`${habits.length} habit${habits.length > 1 ? 's' : ''} checked off.`);

  if (workoutResult.hasWorkout) {
    const muscles = workoutResult.muscles.map(k => MUSCLE_MAP.find(m => m.key === k)?.label).filter(Boolean);
    if (workoutResult.hasPR) {
      parts.push(`New PR detected${muscles.length ? ` — ${muscles.join(', ')}` : ''}! 🏆`);
    } else if (muscles.length) {
      parts.push(`${muscles.join(' + ')} session logged.`);
    } else {
      parts.push('Workout logged.');
    }
  }

  if (skillUpgrades.length) {
    const names = [...new Set(skillUpgrades.map(u => u.skill_name))].slice(0, 3).join(', ');
    parts.push(`Skills boosted: ${names}.`);
  }

  if (!parts.length) parts.push('Entry logged.');

  parts.push(CLOSERS[Math.floor(Math.random() * CLOSERS.length)]);
  return parts.join(' ');
}

// ── 7. MAIN PARSE FUNCTION ────────────────────────────────────────────────────
function parse(text, tasks = [], habits = [], userSkills = []) {
  const mood              = detectMood(text);
  const sleep             = detectSleep(text);
  const completed_task_ids   = detectCompletedTasks(text, tasks);
  const completed_habit_ids  = detectCompletedHabits(text, habits);
  const workoutResult     = detectWorkout(text);
  const skillUpgrades     = computeSkillUpgrades(workoutResult, userSkills);

  const friendly_response = buildResponse(
    mood,
    tasks.filter(t => completed_task_ids.includes(t.id)),
    habits.filter(h => completed_habit_ids.includes(h.id)),
    sleep, skillUpgrades, workoutResult,
  );

  return {
    mood,
    journal_entry: text.trim(),   // full text saved verbatim — user's own words
    completed_task_ids,
    completed_habit_ids,
    sleep,
    workoutResult,
    skillUpgrades,
    friendly_response,
  };
}

module.exports = { parse, detectMood, detectSleep, detectWorkout, computeSkillUpgrades, MUSCLE_MAP, overlap, tokenise };
