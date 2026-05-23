'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// DIET QUICK-LOG PARSER — NARRATIVE MODE
//
// Handles casual speech:
//   "i had oats in breakfast then i had a protein shake in evening
//    lunch then rice and chicken for dinner"
//
// Strategy:
//   1. Split on "then [i] had", "also had", "after that", commas before meal words
//   2. Detect meal type from: "in/for/at [meal]", time-of-day words, running state
//   3. Strip all structural/filler words → food name remains
//   4. Fuzzy-match against saved_meals for macros
// ─────────────────────────────────────────────────────────────────────────────

const db = require('../db/database');
const { overlap } = require('./localParser');

function tok(str) {
  return str.toLowerCase().split(/\W+/).filter(t => t.length > 1);
}

// ── Meal type detection ───────────────────────────────────────────────────────
// Order matters — more specific first
const MEAL_SIGNALS = [
  { type: 'breakfast', rx: /\b(breakfast|brunch|first\s+meal|morning\s+meal|woke?\s*up\s+and\s+had|had\s+in\s+the\s+morning)\b/i },
  { type: 'breakfast', rx: /\bin\s+(the\s+)?morning\b/i },
  { type: 'lunch',     rx: /\b(lunch|noon|midday|afternoon\s+meal|had\s+at\s+noon)\b/i },
  // "evening lunch" → treat as lunch, not dinner
  { type: 'lunch',     rx: /\bevening\s+lunch\b/i },
  { type: 'dinner',    rx: /\b(dinner|supper|last\s+meal|tonight|night\s+meal|had\s+at\s+night)\b/i },
  { type: 'dinner',    rx: /\bin\s+(the\s+)?(evening|night)\b/i },
  // "afternoon" → lunch/snack boundary — treat as lunch
  { type: 'lunch',     rx: /\bin\s+(the\s+)?afternoon\b/i },
  { type: 'snack',     rx: /\b(snack|mid.?meal|between\s+meals?|quick\s+bite|pre.?workout|post.?workout|pre\s+gym|post\s+gym|during\s+workout)\b/i },
];

function detectMealType(segment) {
  // Pick the signal whose match starts EARLIEST in the string.
  // This ensures "snacks after breakfast" → snack (not breakfast),
  // because "snacks" appears before "breakfast".
  let earliest = null, earliestIdx = Infinity;
  for (const { type, rx } of MEAL_SIGNALS) {
    const plain = new RegExp(rx.source, rx.flags.replace('g', ''));
    const m = plain.exec(segment);
    if (m && m.index < earliestIdx) {
      earliestIdx = m.index;
      earliest = type;
    }
  }
  return earliest;
}

// ── Quantity multiplier ───────────────────────────────────────────────────────
// Matches explicit unit words: "2 cups", "1 bowl", "3 scoops", "500 ml", "150 g"
const QTY_UNIT_RE = /\b(\d+(?:\.\d+)?)\s*(?:scoops?|servings?|portions?|pieces?|slices?|cups?|bowls?|katoris?|plates?|cans?|bars?|glasses?|ml|millil[ei]tr?e?s?|grams?|gm|kg)\b/i;
// Matches "2 chapatis", "3 eggs", "4 rotis" — leading number straight before food name
const INLINE_NUM_RE = /\b(\d+(?:\.\d+)?)\s+(?!\s*(?:min(?:utes?)?|hours?|days?|weeks?|months?|years?|km|m\b|kg\b|lbs?))/i;
const HALF_RE    = /\bhalf\b/i;
const DOUBLE_RE  = /\b(double|2x|two\s+portions?|two\s+servings?)\b/i;
// Size words → approximate multipliers
const SIZE_MAP = [
  [/\b(large|big|huge|xl)\b/i,    1.5],
  [/\bmedium\b/i,                  1.0],
  [/\b(small|little|tiny|mini)\b/i, 0.7],
];

function detectMultiplier(seg) {
  if (DOUBLE_RE.test(seg)) return 2;
  if (HALF_RE.test(seg))   return 0.5;
  // Explicit unit: "1 cup of dahi" → 1, "500 ml milk" → 500 (raw, diet.js uses this)
  const mu = QTY_UNIT_RE.exec(seg);
  if (mu) return parseFloat(mu[1]);
  // Inline count: "2 chapatis", "3 eggs"
  const mn = INLINE_NUM_RE.exec(seg);
  if (mn) return parseFloat(mn[1]);
  // Size descriptor
  for (const [rx, val] of SIZE_MAP) {
    if (rx.test(seg)) return val;
  }
  return 1;
}

// ── Filler words to strip AFTER meal type is detected ────────────────────────
// These are the connective tissue of casual speech
const FILLER_RE = /\b(i|then|also|had|have|ate|eat|was|were|it|just|only|a|an|the|some|my|for|in|at|with|and|got|grabbed?|picked|taken?|went|went\s+with|did|do|took|consumed?|drank?|drink|post|pre)\b/gi;

// Time-of-day words that aren't meal names (to strip after detecting meal type)
const TIME_WORDS_RE = /\b(morning|evening|afternoon|night|midnight|early|late|today|yesterday)\b/gi;

// Meal name words themselves (to strip after we've captured meal type)
const MEAL_WORDS_RE = /\b(breakfast|brunch|lunch|dinner|supper|snacks?|meals?)\b/gi;

// ── Segment splitter ──────────────────────────────────────────────────────────
function splitSegments(text) {
  // Split on:
  //  1. "then [i/we] [had/ate/drank/got/also...]"  — most common
  //  2. bare "then" or "and then" — "then blah" / "then oats for lunch"
  //  3. "also [had/ate/drank]"
  //  4. "after that [i] [had/ate]"
  //  5. commas — always split on commas (food lists: "oats, eggs, toast")
  //  6. semicolons, newlines

  // Step 1: Split on narrative transitions and commas
  const SEP = /\s*,\s*|\s*;\s*|\n+|\s+(?:and\s+)?then\s+(?:(?:i|we)\s+)?(?:(?:also|also\s+)?(?:had|ate|drank?|took|got|grabbed?)?\s*)|\s+also\s+(?:had|ate|drank?)\b|\s+after\s+(?:that\s+)?(?:i\s+)?(?:had|ate|drank?)\b/i;

  const raw = text
    .split(SEP)
    .map(s => (s || '').trim())
    .filter(s => s && s.length > 1);

  // Step 2: Filter out "and" fragments that are clearly part of a compound food name
  // Merge back short fragments (<3 tokens) that don't contain a meal keyword and follow a word
  const merged = [];
  for (const seg of raw) {
    const wordCount = seg.split(/\s+/).length;
    // If the segment is just 1 word and doesn't have a meal type, it was probably
    // part of "X and Y" split — merge with previous
    if (wordCount === 1 && merged.length > 0 && !detectMealType(seg)) {
      merged[merged.length - 1] = merged[merged.length - 1] + ' and ' + seg;
    } else {
      merged.push(seg);
    }
  }

  return merged;
}

// Unit-of-measure words that aren't part of a food name
const UNIT_WORDS_RE = /\b(cups?|bowls?|katoris?|glasses?|plates?|pieces?|scoops?|tbsp|tsp|tablespoons?|teaspoons?|servings?|portions?|ml|millil[ei]tr?e?s?|grams?|gm|kg|lbs?|litres?|liters?)\b/gi;
// Descriptor / temporal words
const DESCRIPTOR_RE = /\b(medium|large|small|big|little|tiny|huge|mini|full|sized?|size|after|before|around|about|approximately)\b/gi;

// ── Clean segment → food name ─────────────────────────────────────────────────
function extractFoodName(seg) {
  return seg
    .replace(TIME_WORDS_RE, ' ')
    .replace(MEAL_WORDS_RE, ' ')
    .replace(/\b(in|for|at|with)\s+(the\s+)?(morning|evening|afternoon|night)?\b/gi, ' ')
    .replace(/\b(in|for|at)\s*$/gi, '')
    .replace(DESCRIPTOR_RE, ' ')     // strip "medium sized", "after", "large" etc.
    .replace(UNIT_WORDS_RE, ' ')     // strip "cup", "bowl", "ml", "g" etc.
    .replace(/\bof\b/gi, ' ')        // strip "of" connectors ("1 cup of dahi" → "dahi")
    .replace(FILLER_RE, ' ')
    .replace(/[^a-zA-Z0-9\s\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Main export ───────────────────────────────────────────────────────────────
function parseDietText(text, userId) {
  const savedMeals = db.prepare('SELECT * FROM saved_meals WHERE user_id=? ORDER BY name').all(userId);

  const rawSegments = splitSegments(text);

  // Running meal type state — once breakfast is set, carries over until explicitly changed
  let currentMealType = 'breakfast';
  const segmentsWithType = [];

  for (const seg of rawSegments) {
    const detected = detectMealType(seg);
    if (detected) currentMealType = detected;
    segmentsWithType.push({ seg, mealType: currentMealType });
  }

  const entries    = [];
  const unmatched  = [];

  for (const { seg, mealType } of segmentsWithType) {
    const multiplier = detectMultiplier(seg);

    // ── Sub-split on "and" BEFORE filler-stripping (preserves "and" as separator) ──
    // "eggs and toast" → ['eggs', 'toast']
    // But keep together if "and" is inside a known compound: "chicken and rice" is ambiguous — split it
    const rawSubs = seg
      .split(/\s+and\s+/i)
      .map(s => s.trim())
      .filter(s => s.length > 1);

    // If splitting produced only 1 item (no "and"), use as-is
    // If all subs are very long (4+ words), the "and" is likely in a description, recombine
    const subNames = rawSubs.length > 1 && rawSubs.every(s => s.split(/\s+/).length <= 5)
      ? rawSubs
      : [seg]; // keep whole segment if items are too long to be individual foods

    if (subNames.length === 0) continue;

    for (const rawSub of subNames) {
      // Clean each sub to get the food name
      const sub = extractFoodName(rawSub);
      const subTok = tok(sub);
      if (!subTok.length) continue;

      // Fuzzy match against saved meals
      let bestMeal = null, bestScore = 0;
      for (const meal of savedMeals) {
        const s = overlap(subTok, meal.name);
        if (s > bestScore) { bestScore = s; bestMeal = meal; }
      }

      if (bestMeal && bestScore >= 0.3) {
        entries.push(buildEntry(bestMeal, mealType, multiplier));
      } else {
        // Strip any remaining filler before titling
        const cleanedSub = sub
          .replace(FILLER_RE, ' ')
          .replace(/\b(as|post|pre|workout|gym|that)\b/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const name = titleCase(cleanedSub.split(' ').filter(w => w.length > 0).slice(0, 5).join(' '));
        // Only add to unmatched — diet.js DB fallback will try the Indian food DB
        // and insert with the correct mealType. Do NOT add to entries here to avoid
        // duplicate 0-calorie rows.
        if (name && name.length >= 2) {
          unmatched.push({ name, mealType });
        }
      }
    }
  }

  return { entries, unmatched };
}

function buildEntry(meal, mealType, multiplier = 1) {
  const m = multiplier === 1 ? 1 : multiplier;
  return {
    meal_type:   mealType,
    name:        meal.name,
    saved_meal_id: meal.id,
    calories:    Math.round((meal.calories  || 0) * m),
    protein_g:   +((meal.protein_g || 0) * m).toFixed(1),
    carbs_g:     +((meal.carbs_g   || 0) * m).toFixed(1),
    fat_g:       +((meal.fat_g     || 0) * m).toFixed(1),
  };
}

function titleCase(str) {
  if (!str) return '';
  return str.split(' ').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '').join(' ');
}

module.exports = { parseDietText };
