'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// WORKOUT QUICK-LOG PARSER — NARRATIVE MODE
//
// Handles casual speech, not just structured "4x8 80kg" format:
//   "it was a bad chest day, hit 35 on flat bench and 5 reps were all i got,
//    then i did incline bench and it was just 30kgs on that"
//
// Strategy:
//   1. Detect day type + session quality from mood words
//   2. Split into exercise blocks on "then", "after", "also", etc.
//   3. Extract weight: "hit X on Y", "X kg on that", "just X", bare Xkg
//   4. Extract reps: "X reps", "X reps were all i got", "only X"
//   5. Extract exercise name: strip all numeric/filler tokens, match plan
//   6. Handle "on that" pronoun → inherit last named exercise
// ─────────────────────────────────────────────────────────────────────────────

const db = require('../db/database');
const { overlap } = require('./localParser');

function tok(str) {
  return str.toLowerCase().split(/\W+/).filter(t => t.length > 1);
}

// ── Day keywords ──────────────────────────────────────────────────────────────
const DAY_KW = {
  chest:     /\b(chest|bench\s+press|pec|push\s+day)\b/i,
  back:      /\b(back\s+day|back\s+workout|lats?|deadlift|row|pulldown)\b/i,
  legs:      /\b(leg\s+day|squat|quads?|hamstring|glutes?|lunge)\b/i,
  shoulders: /\b(shoulder|delt|ohp|overhead\s+press)\b/i,
  arms:      /\b(arm\s+day|bicep|tricep|curl\s+day)\b/i,
  core:      /\b(core\s+day|abs\s+day|plank\s+day)\b/i,
  push:      /\b(push\s+day)\b/i,
  pull:      /\b(pull\s+day)\b/i,
  upper:     /\b(upper\s+day|upper\s+body)\b/i,
  lower:     /\b(lower\s+day|lower\s+body)\b/i,
};

// ── Session quality (good/avg/bad) ────────────────────────────────────────────
const QUALITY_MAP = [
  { score: 5, rx: /\b(amazing|incredible|best|perfect|beast|crushed|killed|goated|fire)\b/i },
  { score: 4, rx: /\b(great|good|solid|strong|productive|decent)\b/i },
  { score: 3, rx: /\b(avg|average|okay|ok|alright|fine|medium|meh|normal|usual)\b/i },
  { score: 2, rx: /\b(bad|weak|low|off|rough|subpar|slow|tired)\b/i },
  { score: 1, rx: /\b(terrible|awful|horrible|worst|failure|failed)\b/i },
];

function detectQuality(text) {
  for (const q of QUALITY_MAP) {
    if (q.rx.test(text)) return q.score;
  }
  return null;
}

// ── Cardio ────────────────────────────────────────────────────────────────────
const CARDIO_RE  = /(\d+)\s*(?:min(?:utes?)?|hrs?|hours?)\s*(?:of\s+)?(?:cardio|running?|treadmill|cycling?|skipping|jump\s+rope|hiit|rowing?)/i;
const CARDIO_RE2 = /(?:cardio|run(?:ning)?|treadmill|cycling?|skipping|hiit|rowing?)\s*(?:for\s+)?(\d+)\s*(?:min(?:utes?)?|hrs?)/i;

// ── Weight extraction ─────────────────────────────────────────────────────────
// Explicit kg/lbs
const WEIGHT_UNIT_RE = /\b(\d+(?:\.\d+)?)\s*(kgs?|lbs?|pounds?|kilos?)\b/i;
// "hit 35 on ..." / "deadlifted 100" / "benched 80"
const HIT_RE         = /\b(?:hit|pressed?|lifted|used?|went\s+with|doing?|did|deadlifted?|squatted?|benched?|curled?|rowed?)\s+(\d+(?:\.\d+)?)\s*(kgs?|lbs?|pounds?|kilos?)?\b/i;
// "just X" / "only X"
const JUST_NUM_RE    = /\b(?:just|only)\s+(\d+(?:\.\d+)?)\s*(kgs?|lbs?|pounds?|kilos?)?\b/i;
// "X on [exercise]" — weight before "on"
const ON_WEIGHT_RE   = /\b(\d+(?:\.\d+)?)\s*(kgs?|lbs?|pounds?|kilos?)?\s+on\b/i;
// "at X" / "with X" — "incline at 50", "curls with 20"
const AT_WEIGHT_RE   = /\b(?:at|with)\s+(\d+(?:\.\d+)?)\s*(kgs?|lbs?|pounds?|kilos?)?\b/i;

function extractWeight(seg) {
  let m;
  if ((m = WEIGHT_UNIT_RE.exec(seg))) return convWeight(m[1], m[2]);
  if ((m = HIT_RE.exec(seg)))        return convWeight(m[1], m[2] || 'kg');
  if ((m = ON_WEIGHT_RE.exec(seg)))  return convWeight(m[1], m[2] || 'kg');
  if ((m = JUST_NUM_RE.exec(seg)))   return convWeight(m[1], m[2] || 'kg');
  if ((m = AT_WEIGHT_RE.exec(seg)))  return convWeight(m[1], m[2] || 'kg');
  return null;
}

function convWeight(val, unit = 'kg') {
  const n = parseFloat(val);
  if (/lbs?|pounds?/i.test(unit)) return +(n * 0.453592).toFixed(1);
  return n;
}

// ── Reps extraction ───────────────────────────────────────────────────────────
// "X reps", "X rep", "X reps were all i got/managed/could"
const REPS_RE       = /\b(\d+)\s*reps?\b/i;
// "only X", "just X" when no explicit "reps" but context implies it (used as fallback)
const BARE_REPS_RE  = /\b(?:only|just|barely|managed)\s+(\d+)\b/i;
// "all i got/managed/could do/could manage"
const ALL_GOT_RE    = /\b(\d+)\s*(?:reps?\s+)?(?:is|was|were|are)\s+all\s+(?:i\s+)?(?:got|could|managed|did|could\s+do|could\s+manage)\b/i;
// "first X reps", "last X reps"
const ORDINAL_REPS  = /\b(?:first|last|only)\s+(\d+)\s*reps?\b/i;

function extractReps(seg) {
  let m;
  if ((m = ALL_GOT_RE.exec(seg)))    return parseInt(m[1]);
  if ((m = ORDINAL_REPS.exec(seg)))  return parseInt(m[1]);
  if ((m = REPS_RE.exec(seg)))       return parseInt(m[1]);
  return null;
}

// ── Sets extraction ───────────────────────────────────────────────────────────
const SET_REP_RE   = /\b(\d+)\s*(?:x|×|sets?\s+(?:of\s+)?)\s*(\d+(?:[–\-]\d+)?)\s*(?:reps?)?\b/gi;
const SETS_ONLY_RE = /\b(\d+)\s*sets?\b/i;

function extractSets(seg) {
  SET_REP_RE.lastIndex = 0;
  const m = SET_REP_RE.exec(seg);
  if (m) return { sets: parseInt(m[1]), reps: m[2] };
  const sm = SETS_ONLY_RE.exec(seg);
  if (sm) return { sets: parseInt(sm[1]), reps: null };
  return null;
}

// ── Exercise name cleaning ────────────────────────────────────────────────────
// Words to strip after extracting numeric data
const FILLER_RE = /\b(i|then|did|hit|also|went|after|that|it|was|just|only|on|with|and|the|a|an|some|my|at|this|for|got|good|bad|avg|average|great|solid|terrible|okay|but|so|day|workout|session|gym|today|knocked|out|managed|tried|about|around|like|bit|little|set|sets)\b/gi;

// Strip leading standalone muscle context words only when NOT followed by a compound exercise term
// e.g. "back deadlift" → "deadlift", but "leg press", "chest fly", "back squat" are kept intact
const LEADING_CONTEXT_RE = /^(chest|back|arms?|shoulders?|core|push|pull|upper|lower)\s+(?!(?:press|fl(?:y|ies|ye)?|raise|curl|extension|squat|row|dip|pullover|shrug|lunge|pulldown|pushdown))/i;

// Normalize past-tense workout verbs to base form
const VERB_NORM_RE = /\b(deadlift|squat|bench|curl|row|press|lunge|dip|shrug|crunch)(?:ed|ted)\b/gi;
// Remove "at X" and "with X" weight indicators from name
const AT_WEIGHT_CLEAN = /\b(?:at|with)\s+\d+(?:\.\d+)?\s*(?:kgs?|lbs?|pounds?|kilos?)?\b/gi;

function cleanToExerciseName(seg) {
  SET_REP_RE.lastIndex = 0;
  let s = seg;
  // Step 1: normalize past-tense verbs FIRST so "squatted 80" → "squat 80"
  // (prevents HIT_RE from swallowing the verb+number together)
  s = s.replace(VERB_NORM_RE, '$1');
  // Step 2: strip structured set×rep patterns
  s = s.replace(SET_REP_RE, ' ');
  // Step 3: strip weight+unit combos
  s = s
    .replace(WEIGHT_UNIT_RE, ' ')
    .replace(AT_WEIGHT_CLEAN, ' ')
    .replace(ALL_GOT_RE, ' ')
    .replace(REPS_RE, ' ')
    .replace(BARE_REPS_RE, ' ')
    .replace(HIT_RE, ' ')
    .replace(ON_WEIGHT_RE, ' ')
    .replace(JUST_NUM_RE, ' ');
  // Step 4: strip remaining bare numbers (e.g. "squat 80" → "squat")
  s = s.replace(/\b\d+(?:\.\d+)?\b/g, ' ');
  // Step 5: filler words
  s = s.replace(FILLER_RE, ' ');
  // Step 6: non-alpha
  s = s.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  // Strip leading standalone muscle context word
  s = s.replace(LEADING_CONTEXT_RE, '').trim();
  return s;
}

// ── Exercise block splitter ───────────────────────────────────────────────────
// Splits narrative text into per-exercise blocks
function splitIntoExerciseBlocks(text) {
  // Step 1: Split on narrative transitions — "then [i] did/hit/went", "after that", "also did"
  const NARR_SEP = /\s+(?:then|after\s+that|after\s+which|also|followed\s+by|next\s+up)\s+(?:i\s+)?(?:did|hit|went|tried|do|also\s+did|also\s+hit|went\s+with)?\s*/i;

  const step1 = text
    .split(NARR_SEP)
    .map(b => (b || '').trim())
    .filter(b => b && b.length > 2);

  // Step 2: Within each block, also split on commas (any comma is a potential exercise boundary)
  // This handles both "bench, cable flies, tricep" and "bench 4x8 80kg, cable flies 3x12"
  const step2 = [];
  for (const block of step1) {
    // Don't split if there are no commas
    if (!block.includes(',')) { step2.push(block); continue; }
    const parts = block.split(/\s*,\s*/).map(s => s.trim()).filter(s => s.length > 1);
    step2.push(...parts);
  }

  // Step 3: Split on semicolons and newlines
  const step3 = [];
  for (const block of step2) {
    const parts = block.split(/[;\n]+/).map(s => s.trim()).filter(s => s.length > 1);
    step3.push(...parts);
  }

  // Deduplicate
  const seen = new Set();
  return step3.filter(b => {
    if (seen.has(b)) return false;
    seen.add(b);
    return true;
  });
}

// ── Plan matching ─────────────────────────────────────────────────────────────
function matchPlanDay(text, planDays, planExercises) {
  const lText = text.toLowerCase();
  const qTok  = tok(text);
  let bestDay = null, bestScore = 0;

  for (const day of planDays) {
    let score = overlap(qTok, day.name) * 3;
    const dLow = day.name.toLowerCase();

    // Keyword bonus
    for (const [, rx] of Object.entries(DAY_KW)) {
      if (rx.test(dLow) && rx.test(lText)) score += 2;
    }
    // Also check bare day keywords in text
    for (const [, rx] of Object.entries(DAY_KW)) {
      if (rx.test(lText)) score += 0.5;
    }
    // Exercise overlap bonus
    const exs = planExercises.filter(e => e.day_id === day.id);
    for (const ex of exs) {
      const s = overlap(qTok, ex.name);
      if (s >= 0.4) score += s * 2;
    }

    if (score > bestScore) { bestScore = score; bestDay = day; }
  }
  return bestDay;
}

function matchPlanExercise(cleanName, dayExercises, allExercises, usedIds) {
  const cTok = tok(cleanName);
  if (!cTok.length) return null;

  let best = null, bestScore = 0;

  for (const ex of dayExercises) {
    if (usedIds.has(ex.id)) continue;
    const s = overlap(cTok, ex.name);
    if (s > bestScore) { bestScore = s; best = ex; }
  }
  // Fallback: all exercises
  if (!best || bestScore < 0.3) {
    for (const ex of allExercises) {
      if (usedIds.has(ex.id)) continue;
      const s = overlap(cTok, ex.name);
      if (s > bestScore) { bestScore = s; best = ex; }
    }
  }
  return bestScore >= 0.25 ? best : null;
}

// ── Main export ───────────────────────────────────────────────────────────────
function parseWorkoutText(text, userId) {
  const lower = text.toLowerCase();

  const planDays     = db.prepare('SELECT * FROM workout_plan_days WHERE user_id=? ORDER BY sort_order,id').all(userId);
  const planExercises = planDays.length
    ? db.prepare(`SELECT wpe.* FROM workout_plan_exercises wpe JOIN workout_plan_days wpd ON wpd.id=wpe.day_id WHERE wpd.user_id=? ORDER BY wpe.sort_order,wpe.id`).all(userId)
    : [];

  // ── Session quality ──
  const quality = detectQuality(text);

  // ── Cardio ──
  let cardioMinutes = 0;
  const cm = CARDIO_RE.exec(text) || CARDIO_RE2.exec(text);
  if (cm) {
    const v = parseInt(cm[1]);
    cardioMinutes = /hrs?|hours?/i.test(cm[0]) ? v * 60 : v;
  }

  // ── Match plan day ──
  const bestDay    = matchPlanDay(text, planDays, planExercises);
  const dayExList  = bestDay ? planExercises.filter(e => e.day_id === bestDay.id) : [];

  // ── Split into exercise blocks ──
  const blocks = splitIntoExerciseBlocks(text);

  const foundExercises = [];
  const usedPlanIds    = new Set();
  let lastExerciseName = null;  // for "on that" pronoun resolution

  for (const block of blocks) {
    // Skip pure day/quality/cardio blocks
    if (/^(it\s+was\s+(a\s+)?)?(good|bad|avg|average|okay|great|solid|terrible|rough)\s+(chest|back|leg|push|pull|shoulder|arm|core|upper|lower|full.?body|cardio|workout)?\s*(day|session|workout)?$/i.test(block.trim())) continue;
    if (CARDIO_RE.test(block) || CARDIO_RE2.test(block)) continue;

    // ── Extract numeric values ──
    // Check for structured "NxM" first
    const srMatch = (() => { SET_REP_RE.lastIndex = 0; return SET_REP_RE.exec(block); })();
    let sets = srMatch ? parseInt(srMatch[1]) : null;
    let reps = srMatch ? srMatch[2] : null;

    // If no structured sets/reps, try narrative reps
    if (!reps) {
      const r = extractReps(block);
      if (r !== null) reps = String(r);
    }

    // Weight
    let weight = extractWeight(block);

    // ── "on that" / "it was X" pronoun → refers to previous exercise ──
    const isPronoun = /\b(on\s+that|on\s+it|it\s+was|that\s+was|on\s+this)\b/i.test(block);
    const hasBareExercise = /\b(bench|press(?:ed)?|squat(?:ted)?|curls?|rows?|fl(?:y|ies)|dips?|raises?|crunch(?:es)?|plank|deadlift(?:ed)?|pulldown|pushups?|pullups?|extension|pullover|shrug|lunge|dip)\b/i.test(block);

    // If this block is "just X on that" or "it was just X" with no new exercise name
    // → it's adding weight context to the last exercise
    if (isPronoun && !hasBareExercise && weight !== null && foundExercises.length > 0) {
      // Patch last exercise with this weight
      const last = foundExercises[foundExercises.length - 1];
      if (last.weight === null) last.weight = weight;
      if (!last.reps && reps) last.reps = reps;
      continue;
    }

    // ── Clean to exercise name ──
    let cleanName = cleanToExerciseName(block);

    // Remove trailing/leading noise words specific to workout narrative
    cleanName = cleanName
      .replace(/\b(incline|decline|flat|close|wide|hammer|reverse|cable|barbell|dumbbell|db|bb|machine)\b/gi, w => w) // keep modifiers
      .replace(/^\s*(then\s+)?(i\s+)?(did\s+|hit\s+|went\s+with\s+|also\s+)?\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanName.length < 2) continue;

    // Skip if the remaining name is ONLY a muscle/day context word (e.g. pure "chest" from "chest day")
    if (/^(chest|back|legs?|arms?|shoulders?|core|push|pull|upper|lower|gym|today)s?$/i.test(cleanName)) continue;

    // ── Match plan exercise ──
    const planEx  = matchPlanExercise(cleanName, dayExList, planExercises, usedPlanIds);
    const exName  = planEx ? planEx.name : titleCase(cleanName);
    if (!exName || exName.length < 2) continue;
    if (planEx) usedPlanIds.add(planEx.id);

    lastExerciseName = exName;

    // Default sets: if user said nothing about sets, log 1 (they described one attempt)
    foundExercises.push({
      planExerciseId: planEx?.id ?? null,
      name:   exName,
      sets:   sets  ?? (planEx ? (parseInt(planEx.sets) || 1) : 1),
      reps:   reps  ?? (planEx ? (planEx.reps || null) : null),
      weight: weight ?? (planEx && planEx.weight ? parseFloat(planEx.weight) || null : null),
    });
  }

  // Build readable day name
  let dayName = bestDay?.name ?? null;
  if (!dayName) {
    // Infer from text keywords
    for (const [key, rx] of Object.entries(DAY_KW)) {
      if (rx.test(lower)) { dayName = capitalise(key) + ' Day'; break; }
    }
    dayName = dayName ?? 'Workout';
  }

  return {
    dayId:          bestDay?.id ?? null,
    dayName,
    quality,
    exercises:      foundExercises,
    cardioMinutes,
    rawText:        text,
  };
}

function capitalise(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

function titleCase(str) {
  return str.split(' ').map(w => capitalise(w.toLowerCase())).join(' ');
}

module.exports = { parseWorkoutText };
