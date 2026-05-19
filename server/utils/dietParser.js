'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// DIET QUICK-LOG PARSER
// Converts free-form text into structured food log entries.
// "oats and protein shake for breakfast, chicken rice for lunch"
// → [{ meal_type, name, saved_meal_id, calories, protein_g, carbs_g, fat_g }]
// ─────────────────────────────────────────────────────────────────────────────

const db = require('../db/database');
const { overlap } = require('./localParser');

function tokenise(str) {
  return str.toLowerCase().split(/\W+/).filter(t => t.length > 1);
}

// ── Meal type detection ───────────────────────────────────────────────────
const MEAL_SIGNALS = {
  breakfast: /\b(breakfast|morning|woke?\s+up|first\s+meal|early|brunch)\b/i,
  lunch:     /\b(lunch|noon|midday|afternoon|mid.?day|midday)\b/i,
  dinner:    /\b(dinner|evening|night|supper|last\s+meal|tonight)\b/i,
  snack:     /\b(snack|between|treat|bite|small|quick|grab|pre.?workout|post.?workout|pre\s+gym|post\s+gym)\b/i,
};

/**
 * Detect meal type from a text segment.
 * Returns 'breakfast' | 'lunch' | 'dinner' | 'snack'
 */
function detectMealType(segment, defaultType = 'snack') {
  for (const [type, rx] of Object.entries(MEAL_SIGNALS)) {
    if (rx.test(segment)) return type;
  }
  return defaultType;
}

// ── Quantity multiplier detection ─────────────────────────────────────────
const QTY_RE = /\b(\d+(?:\.\d+)?)\s*(?:scoops?|servings?|portions?|pieces?|slices?|cups?|bowls?|plates?|cans?|bars?)\b/i;
const HALF_RE = /\bhalf\b/i;
const DOUBLE_RE = /\b(double|2x|two)\b/i;

function detectMultiplier(segment) {
  if (DOUBLE_RE.test(segment)) return 2;
  if (HALF_RE.test(segment)) return 0.5;
  const m = QTY_RE.exec(segment);
  if (m) return parseFloat(m[1]);
  return 1;
}

/**
 * parseDietText(text, userId)
 * Returns:
 * {
 *   entries: [{
 *     meal_type: string,
 *     name: string,
 *     saved_meal_id: number|null,
 *     calories: number,
 *     protein_g: number,
 *     carbs_g: number,
 *     fat_g: number,
 *   }],
 *   unmatched: string[]  // food names with no saved meal match
 * }
 */
function parseDietText(text, userId) {
  const savedMeals = db.prepare(
    'SELECT * FROM saved_meals WHERE user_id = ? ORDER BY name'
  ).all(userId);

  // ── 1. Segment the text ───────────────────────────────────────────────────
  // Split on:  commas, semicolons, newlines, "and then", "also had", "also", "then"
  const rawSegments = text
    .split(/[,;\n]+|\band\s+then\b|\bthen\s+had\b|\balso\s+had\b/i)
    .map(s => s.trim())
    .filter(s => s.length > 2);

  // ── 2. Assign meal type to each segment ──────────────────────────────────
  // Track a running meal type: once breakfast is mentioned, segments after keep breakfast
  // until a new meal type keyword appears.
  let currentMealType = 'breakfast';
  const segmentsWithType = [];

  for (const seg of rawSegments) {
    const detected = detectMealType(seg, '');
    if (detected) currentMealType = detected;
    segmentsWithType.push({ seg, mealType: currentMealType });
  }

  // ── 3. Match each segment to saved meals ─────────────────────────────────
  const entries = [];
  const unmatched = [];

  for (const { seg, mealType } of segmentsWithType) {
    // Clean the segment: strip meal-type keywords and filler words
    const cleanedSeg = seg
      .replace(MEAL_SIGNALS.breakfast, '')
      .replace(MEAL_SIGNALS.lunch, '')
      .replace(MEAL_SIGNALS.dinner, '')
      .replace(MEAL_SIGNALS.snack, '')
      .replace(/\bfor\b|\band\b|\bwith\b|\ba\b|\ban\b|\bthe\b|\bsome\b|\bhad\b|\bhave\b|\bate\b|\beat\b|\bas\b|\bjust\b|\bmy\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanedSeg.length < 2) continue;

    const multiplier = detectMultiplier(seg);
    const segTokens = tokenise(cleanedSeg);

    // Score each saved meal
    let bestMeal = null;
    let bestScore = 0;

    for (const meal of savedMeals) {
      const s = overlap(segTokens, meal.name);
      if (s > bestScore) { bestScore = s; bestMeal = meal; }
    }

    // Sub-segment: might contain multiple items (e.g. "oats and protein shake")
    // Split further on " and " if we have a weak single match
    const subSegs = cleanedSeg.split(/\s+and\s+/i).map(s => s.trim()).filter(s => s.length > 1);

    if (subSegs.length > 1 && bestScore < 0.5) {
      // Process each sub-segment separately
      for (const sub of subSegs) {
        const subTokens = tokenise(sub);
        let subBest = null;
        let subScore = 0;
        for (const meal of savedMeals) {
          const s = overlap(subTokens, meal.name);
          if (s > subScore) { subScore = s; subBest = meal; }
        }

        const subMultiplier = detectMultiplier(sub);
        if (subBest && subScore >= 0.35) {
          entries.push(buildEntry(subBest, mealType, subMultiplier));
        } else {
          const name = capitalise(sub.split(' ').slice(0, 4).join(' '));
          if (name) {
            entries.push({ meal_type: mealType, name, saved_meal_id: null, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
            unmatched.push(name);
          }
        }
      }
    } else if (bestMeal && bestScore >= 0.35) {
      entries.push(buildEntry(bestMeal, mealType, multiplier));
    } else {
      const name = capitalise(cleanedSeg.split(' ').slice(0, 4).join(' '));
      if (name && name.length >= 2) {
        entries.push({ meal_type: mealType, name, saved_meal_id: null, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
        unmatched.push(name);
      }
    }
  }

  return { entries, unmatched };
}

function buildEntry(meal, mealType, multiplier = 1) {
  const m = multiplier === 1 ? 1 : multiplier;
  return {
    meal_type: mealType,
    name: meal.name,
    saved_meal_id: meal.id,
    calories: Math.round((meal.calories || 0) * m),
    protein_g: +((meal.protein_g || 0) * m).toFixed(1),
    carbs_g: +((meal.carbs_g || 0) * m).toFixed(1),
    fat_g: +((meal.fat_g || 0) * m).toFixed(1),
  };
}

function capitalise(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = { parseDietText };
