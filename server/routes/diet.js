const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { awardPoints } = require('../utils/pointsUtils');

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
  const date = req.query.date || new Date().toISOString().slice(0, 10);
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
  const logDate = date || new Date().toISOString().slice(0, 10);

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
  res.status(201).json(db.prepare('SELECT * FROM food_logs WHERE id = ?').get(result.lastInsertRowid));
});

router.delete('/log/:id', (req, res) => {
  db.prepare('DELETE FROM food_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
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
