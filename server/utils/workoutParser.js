'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// WORKOUT QUICK-LOG PARSER
// Converts free-form text into structured workout session data.
// "chest day, bench 4x8 80kg, cable flies 3x12, 20 min cardio"
// → { dayId, dayName, exercises: [{name, sets, reps, weight}], cardioMinutes }
// ─────────────────────────────────────────────────────────────────────────────

const db = require('../db/database');
const { overlap } = require('./localParser');

function tokenise(str) {
  return str.toLowerCase().split(/\W+/).filter(t => t.length > 1);
}

// Keyword maps for common shorthand day names
const DAY_KEYWORDS = {
  chest:     ['chest', 'bench', 'pec', 'push'],
  back:      ['back', 'row', 'lat', 'pull', 'deadlift'],
  legs:      ['leg', 'squat', 'quad', 'hamstring', 'glute', 'lunge'],
  shoulders: ['shoulder', 'delt', 'ohp', 'overhead', 'press'],
  arms:      ['arm', 'bicep', 'tricep', 'curl'],
  core:      ['core', 'abs', 'plank', 'crunch'],
  cardio:    ['cardio', 'run', 'treadmill', 'cycle', 'hiit', 'skip'],
  push:      ['push'],
  pull:      ['pull'],
  upper:     ['upper'],
  lower:     ['lower'],
  fullbody:  ['full', 'body', 'fullbody'],
};

// ── Sets/reps/weight extraction ────────────────────────────────────────────
// Matches: "4x8", "4 x 8", "4 sets 8 reps", "4 sets of 8", "4×8"
const SET_REP_RE = /(\d+)\s*(?:x|×|sets?\s*(?:of\s+)?)\s*(\d+(?:[–\-]\d+)?)\s*(?:reps?)?/gi;

// Matches weight: "80kg", "80 kg", "80 lbs", "@ 80kg", "at 80kg"
const WEIGHT_RE = /(?:[@at]\s*)?(\d+(?:\.\d+)?)\s*(kg|kgs|lbs?|pounds?)/i;

// Cardio: "20 min cardio", "20 minutes running", "30 min on treadmill"
const CARDIO_RE = /(\d+)\s*(?:min(?:utes?)?|hrs?|hours?)\s*(?:of\s+)?(?:cardio|running?|treadmill|cycling?|cycling|skipping|jump\s+rope|hiit|rowing?)/i;
const CARDIO_RE2 = /(?:cardio|run|treadmill|cycling?|skipping|hiit|rowing?)\s*(?:for\s+)?(\d+)\s*(?:min(?:utes?)?|hrs?)/i;

/**
 * parseWorkoutText(text, userId)
 * Returns:
 * {
 *   dayId: number|null,
 *   dayName: string,
 *   exercises: [{ planExerciseId, exerciseId, name, sets, reps, weight }],
 *   cardioMinutes: number,
 *   rawText: string
 * }
 */
function parseWorkoutText(text, userId) {
  const lower = text.toLowerCase();
  const qTokens = tokenise(text);

  // ── 1. Match workout plan day ─────────────────────────────────────────────
  const planDays = db.prepare(
    'SELECT * FROM workout_plan_days WHERE user_id = ? ORDER BY sort_order, id'
  ).all(userId);

  const planExercises = planDays.length
    ? db.prepare(`
        SELECT wpe.* FROM workout_plan_exercises wpe
        JOIN workout_plan_days wpd ON wpd.id = wpe.day_id
        WHERE wpd.user_id = ? ORDER BY wpe.sort_order, wpe.id
      `).all(userId)
    : [];

  let bestDay = null;
  let bestScore = 0;

  for (const day of planDays) {
    // Score 1: name overlap
    let score = overlap(qTokens, day.name) * 3;

    // Score 2: keyword bonus — look for day keywords in text
    const dName = day.name.toLowerCase();
    for (const [key, kws] of Object.entries(DAY_KEYWORDS)) {
      const matchesDay = kws.some(k => dName.includes(k));
      const matchesText = kws.some(k => lower.includes(k));
      if (matchesDay && matchesText) score += 2;
    }

    // Score 3: exercise name overlap with the text
    const dayExercises = planExercises.filter(e => e.day_id === day.id);
    for (const ex of dayExercises) {
      const s = overlap(qTokens, ex.name);
      if (s >= 0.5) score += s * 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDay = day;
    }
  }

  // ── 2. Extract cardio minutes ─────────────────────────────────────────────
  let cardioMinutes = 0;
  const cm1 = CARDIO_RE.exec(text);
  const cm2 = CARDIO_RE2.exec(text);
  const cmatch = cm1 || cm2;
  if (cmatch) {
    const val = parseInt(cmatch[1]);
    // If it looks like hours (small number + "hr"), convert
    if (/hrs?|hours?/i.test(cmatch[0])) {
      cardioMinutes = val * 60;
    } else {
      cardioMinutes = val;
    }
  }

  // ── 3. Extract exercise mentions with sets/reps/weight ────────────────────
  // Strategy: split text on commas/semicolons/newlines into segments,
  // try to match each segment to a plan exercise or treat as freeform

  const segments = text
    .split(/[,;\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 2);

  const dayExList = bestDay
    ? planExercises.filter(e => e.day_id === bestDay.id)
    : [];

  const foundExercises = [];
  const usedPlanIds = new Set();

  for (const seg of segments) {
    const segLower = seg.toLowerCase();

    // Skip cardio segments
    if (CARDIO_RE.test(seg) || CARDIO_RE2.test(seg)) continue;

    // Skip pure "day" mention segments (e.g. "chest day", "push day") when no sets/reps found
    const isPureDayMention = /^(chest|back|leg|push|pull|shoulder|arm|bicep|tricep|core|full.?body|upper|lower|cardio)\s+(day|workout|session)$/i.test(seg.trim());
    if (isPureDayMention) continue;

    // Extract sets × reps
    let sets = null, reps = null;
    SET_REP_RE.lastIndex = 0;
    const srMatch = SET_REP_RE.exec(seg);
    if (srMatch) {
      sets = parseInt(srMatch[1]);
      reps = srMatch[2]; // could be "8-12"
    }

    // Extract weight
    let weight = null;
    const wMatch = WEIGHT_RE.exec(seg);
    if (wMatch) {
      weight = parseFloat(wMatch[1]);
      if (/lbs?|pounds?/i.test(wMatch[2])) weight = +(weight * 0.453592).toFixed(1);
    }

    // Clean segment: remove set/rep/weight tokens to get exercise name
    let cleanSeg = seg
      .replace(SET_REP_RE, '')
      .replace(WEIGHT_RE, '')
      .replace(/\s*@\s*/g, ' ')           // remove @ symbol only
      .replace(/\bat\b\s*/g, ' ')          // remove standalone "at" (word boundary)
      .replace(/\b(did|hit|some|few|heavy|light|warm.?up|and|the|a|an|on|with|for|my|day)\b/gi, ' ')
      .replace(/[^a-zA-Z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanSeg.length < 2) continue;

    // Match against plan exercises
    const segTokens = tokenise(cleanSeg);
    let bestEx = null;
    let bestExScore = 0;

    for (const ex of dayExList) {
      if (usedPlanIds.has(ex.id)) continue;
      const s = overlap(segTokens, ex.name);
      if (s > bestExScore) { bestExScore = s; bestEx = ex; }
    }

    // Also try ALL plan exercises if no day match
    if (!bestEx || bestExScore < 0.3) {
      for (const ex of planExercises) {
        if (usedPlanIds.has(ex.id)) continue;
        const s = overlap(segTokens, ex.name);
        if (s > bestExScore) { bestExScore = s; bestEx = ex; }
      }
    }

    const matched = bestEx && bestExScore >= 0.3;

    // Only include if we have at least a name to work with
    const exName = matched
      ? bestEx.name
      : capitalise(cleanSeg.split(' ').slice(0, 4).join(' '));

    if (!exName || exName.length < 2) continue;

    if (matched) usedPlanIds.add(bestEx.id);

    foundExercises.push({
      planExerciseId: matched ? bestEx.id : null,
      name: exName,
      sets: sets ?? (matched ? (parseInt(bestEx.sets) || 3) : 3),
      reps: reps ?? (matched ? (bestEx.reps || '8') : '8'),
      weight: weight ?? (matched && bestEx.weight ? parseFloat(bestEx.weight) || null : null),
    });
  }

  return {
    dayId: bestDay?.id ?? null,
    dayName: bestDay?.name ?? 'Workout',
    exercises: foundExercises,
    cardioMinutes,
    rawText: text,
  };
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = { parseWorkoutText };
