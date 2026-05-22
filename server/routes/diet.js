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

function scoreFood(food, queryTokens) {
  const haystack = tokenise(`${food.name} ${food.keywords.join(' ')}`);
  let score = 0;
  for (const qt of queryTokens) {
    for (const ht of haystack) {
      if (ht === qt) { score += 1.0; break; }
      if (ht.startsWith(qt) && qt.length >= 3) { score += 0.6; break; }
      if (qt.startsWith(ht) && ht.length >= 3) { score += 0.5; break; }
    }
  }
  return queryTokens.length > 0 ? score / queryTokens.length : 0;
}

const FEATURED_IDS = [1, 26, 46, 96, 162, 160, 7, 231]; // roti,rice,dal,dahi,chicken breast,egg,aloo paratha,chai

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
  const stillUnmatched = [];
  for (const name of unmatched) {
    const qTokens = tokenise(name);
    if (!qTokens.length) { stillUnmatched.push(name); continue; }
    const best = INDIAN_FOODS
      .map(f => ({ f, s: scoreFood(f, qTokens) }))
      .sort((a, b) => b.s - a.s)[0];

    if (best && best.s >= 0.4) {
      const dbFood = best.f;
      // detect multiplier from the original segment if present (default 1)
      const mulMatch = name.match(/^(\d+(?:\.\d+)?)\s/);
      const mul = mulMatch ? parseFloat(mulMatch[1]) : 1;
      const entry = {
        name: dbFood.name,
        meal_type: 'snack',
        calories: Math.round(dbFood.calories * mul),
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
      stillUnmatched.push(name);
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
