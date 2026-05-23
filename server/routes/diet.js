const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { awardPoints, applySkillXP } = require('../utils/pointsUtils');
const { localDate } = require('../utils/dateUtils');
const { parseDietText } = require('../utils/dietParser');
const INDIAN_FOODS = require('../utils/indianFoods');

// ── Food search scoring ──────────────────────────────────────────────────────
function tokenise(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

// Levenshtein edit distance — O(m*n) but m,n are short food tokens so fine
function editDist(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return dp[m];
}

function tokenSim(qt, ht) {
  if (ht === qt) return 1.0;
  if (ht.startsWith(qt) && qt.length >= 3) return 0.65;
  if (qt.startsWith(ht) && ht.length >= 3) return 0.55;
  // Fuzzy: 1-edit typo on tokens ≥ 4 chars ("partha"→"paratha", "dahi"→"dahi")
  if (qt.length >= 4 && ht.length >= 4) {
    const d = editDist(qt, ht);
    if (d === 1) return 0.80;
    if (d === 2 && qt.length >= 6) return 0.50;
  }
  return 0;
}

function scoreFood(food, queryTokens) {
  if (!queryTokens.length) return 0;
  const haystack = tokenise(`${food.name} ${food.keywords.join(' ')}`);
  let score = 0;
  for (const qt of queryTokens) {
    let best = 0;
    for (const ht of haystack) {
      const s = tokenSim(qt, ht);
      if (s > best) best = s;
      if (best === 1.0) break; // can't do better
    }
    score += best;
  }
  return score / queryTokens.length;
}

const FEATURED_IDS = [1, 26, 434, 361, 353, 351, 7, 397]; // roti,rice,dal tadka,dahi,chicken breast,boiled egg,aloo paratha,masala chai

router.use(authMiddleware);

// ── Saved meals library ──────────────────────────────────────────────────────

router.get('/meals', (req, res) => {
  const meals = db.prepare(`
    SELECT * FROM saved_meals WHERE user_id = ? ORDER BY name ASC
  `).all(req.user.id);
  res.json(meals);
});

router.post('/meals', (req, res) => {
  const { name, calories = 0, protein_g = 0, carbs_g = 0, fat_g = 0, notes = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare(`
    INSERT INTO saved_meals (user_id, name, calories, protein_g, carbs_g, fat_g, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, name.trim(), calories, protein_g, carbs_g, fat_g, notes);
  const meal = db.prepare('SELECT * FROM saved_meals WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(meal);
});

router.patch('/meals/:id', (req, res) => {
  const meal = db.prepare('SELECT * FROM saved_meals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!meal) return res.status(404).json({ error: 'Not found' });
  const { name = meal.name, calories = meal.calories, protein_g = meal.protein_g,
          carbs_g = meal.carbs_g, fat_g = meal.fat_g, notes = meal.notes } = req.body;
  db.prepare(`
    UPDATE saved_meals SET name=?, calories=?, protein_g=?, carbs_g=?, fat_g=?, notes=?
    WHERE id = ?
  `).run(name, calories, protein_g, carbs_g, fat_g, notes, req.params.id);
  res.json(db.prepare('SELECT * FROM saved_meals WHERE id = ?').get(req.params.id));
});

router.delete('/meals/:id', (req, res) => {
  db.prepare('DELETE FROM saved_meals WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ── Daily food log ───────────────────────────────────────────────────────────

router.get('/log', (req, res) => {
  const date = req.query.date || localDate();
  const entries = db.prepare(`
    SELECT f.*, s.name AS saved_meal_name
    FROM food_logs f
    LEFT JOIN saved_meals s ON f.saved_meal_id = s.id
    WHERE f.user_id = ? AND f.date = ?
    ORDER BY f.meal_type, f.created_at ASC
  `).all(req.user.id, date);
  res.json(entries);
});

router.post('/log', (req, res) => {
  const { date, meal_type = 'snack', name, calories = 0, protein_g = 0,
          carbs_g = 0, fat_g = 0, saved_meal_id = null } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const logDate = date || localDate();

  // Validate saved_meal_id belongs to this user — nullify if invalid to avoid FK error
  let validMealId = null;
  if (saved_meal_id) {
    const meal = db.prepare('SELECT id FROM saved_meals WHERE id = ? AND user_id = ?').get(saved_meal_id, req.user.id);
    validMealId = meal ? saved_meal_id : null;
  }

  const result = db.prepare(`
    INSERT INTO food_logs (user_id, date, meal_type, name, calories, protein_g, carbs_g, fat_g, saved_meal_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, logDate, meal_type, name.trim(), calories, protein_g, carbs_g, fat_g, validMealId);
  awardPoints(req.user.id, 'diet', 'log_food', 5, result.lastInsertRowid, name.trim());
  applySkillXP(req.user.id, 'diet', ['nutrition','health','diet', name.trim()]);
  res.status(201).json(db.prepare('SELECT * FROM food_logs WHERE id = ?').get(result.lastInsertRowid));
});

router.delete('/log/:id', (req, res) => {
  db.prepare('DELETE FROM food_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ── Quick-log (NLP) ─────────────────────────────────────────────────────────

router.post('/quick-log', (req, res) => {
  const { text, date } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });

  const logDate = date || localDate();
  const { entries, unmatched } = parseDietText(text.trim(), req.user.id);

  const logged = [];
  const insertedIds = [];

  for (const entry of entries) {
    if (!entry.name?.trim()) continue;

    // Validate saved_meal_id belongs to user
    let validMealId = null;
    if (entry.saved_meal_id) {
      const meal = db.prepare('SELECT id FROM saved_meals WHERE id = ? AND user_id = ?').get(entry.saved_meal_id, req.user.id);
      validMealId = meal ? entry.saved_meal_id : null;
    }

    const result = db.prepare(`
      INSERT INTO food_logs (user_id, date, meal_type, name, calories, protein_g, carbs_g, fat_g, saved_meal_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, logDate,
      entry.meal_type, entry.name.trim(),
      entry.calories || 0, entry.protein_g || 0, entry.carbs_g || 0, entry.fat_g || 0,
      validMealId
    );
    awardPoints(req.user.id, 'diet', 'log_food', 5, result.lastInsertRowid, entry.name);
    insertedIds.push(result.lastInsertRowid);
    logged.push({ ...entry, id: result.lastInsertRowid });
  }

  // DB fallback for unmatched items
  // Each unmatched item is now { name: string, mealType: string } from the parser
  const stillUnmatched = [];
  for (const unmatchedItem of unmatched) {
    // Support both old string form (legacy) and new object form
    const rawName    = typeof unmatchedItem === 'string' ? unmatchedItem : unmatchedItem.name;
    const itemMeal   = typeof unmatchedItem === 'string' ? 'snack'       : unmatchedItem.mealType;

    // Strip leading numbers/units so they don't dilute the food-name token score
    // "1 Cup Of Dahi" → "Dahi",  "2 Chapatis" → "Chapatis",  "Medium Sized Apple" → "Apple"
    const cleanName = rawName
      .replace(/^(\d+(?:\.\d+)?)\s*/, '')
      .replace(/\b(cups?|bowls?|katoris?|glasses?|pieces?|scoops?|tbsp|tsp|servings?|portions?|ml|grams?|gm|kg|litres?|liters?|medium|large|small|big|tiny|sized?|after|before|of)\b/gi, ' ')
      .replace(/\s+/g, ' ').trim();

    const qTokens = tokenise(cleanName || rawName);
    if (!qTokens.length) { stillUnmatched.push(rawName); continue; }

    const best = INDIAN_FOODS
      .map(f => ({ f, s: scoreFood(f, qTokens) }))
      .sort((a, b) => b.s - a.s)[0];

    if (best && best.s >= 0.35) {
      const dbFood = best.f;
      const mulMatch = rawName.match(/^(\d+(?:\.\d+)?)\s/);
      const mul = mulMatch ? parseFloat(mulMatch[1]) : 1;
      const entry = {
        name:      dbFood.name,
        meal_type: itemMeal,           // ← use detected meal type, not hardcoded 'snack'
        calories:  Math.round(dbFood.calories  * mul),
        protein_g: Math.round(dbFood.protein_g * mul * 10) / 10,
        carbs_g:   Math.round(dbFood.carbs_g   * mul * 10) / 10,
        fat_g:     Math.round(dbFood.fat_g     * mul * 10) / 10,
        source: 'db',
      };
      const result = db.prepare(`
        INSERT INTO food_logs (user_id, date, meal_type, name, calories, protein_g, carbs_g, fat_g)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.user.id, logDate, entry.meal_type, entry.name,
             entry.calories, entry.protein_g, entry.carbs_g, entry.fat_g);
      awardPoints(req.user.id, 'diet', 'log_food', 5, result.lastInsertRowid, entry.name);
      insertedIds.push(result.lastInsertRowid);
      logged.push({ ...entry, id: result.lastInsertRowid });
    } else {
      stillUnmatched.push(rawName);
    }
  }

  if (logged.length) {
    applySkillXP(req.user.id, 'diet', ['nutrition','health','diet', ...logged.map(l => l.name)]);
  }

  // Build preview string
  const preview = logged.length
    ? logged.slice(0, 5).map(e => `${e.name} (${e.meal_type}${e.calories ? ', ' + e.calories + ' cal' : ''})`).join(' · ')
    : 'Nothing logged';

  res.status(201).json({
    logged,
    unmatched: stillUnmatched,
    insertedIds,
    preview,
    date: logDate,
  });
});

// ── Undo quick-log ───────────────────────────────────────────────────────────
router.post('/quick-log/undo', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids required' });
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM food_logs WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, req.user.id);
  res.json({ ok: true, deleted: ids.length });
});

// ── Indian food DB search ────────────────────────────────────────────────────

router.get('/food-search', (req, res) => {
  const q = (req.query.q || '').trim();
  const limit = Math.min(Number(req.query.limit) || 8, 20);

  if (!q) {
    const featured = FEATURED_IDS.map(id => INDIAN_FOODS.find(f => f.id === id)).filter(Boolean);
    return res.json(featured);
  }

  const qTokens = tokenise(q);
  const scored = INDIAN_FOODS
    .map(f => ({ ...f, _score: scoreFood(f, qTokens) }))
    .filter(f => f._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...f }) => f);

  res.json(scored);
});

// ── Weekly macro summary (for analytics) ────────────────────────────────────

router.get('/summary', (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const rows = db.prepare(`
    SELECT date,
      SUM(calories) AS calories,
      SUM(protein_g) AS protein_g,
      SUM(carbs_g) AS carbs_g,
      SUM(fat_g) AS fat_g
    FROM food_logs
    WHERE user_id = ? AND date >= date('now', ? || ' days')
    GROUP BY date
    ORDER BY date ASC
  `).all(req.user.id, `-${days}`);
  res.json(rows);
});

module.exports = router;
