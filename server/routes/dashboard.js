const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { computePriorityScore } = require('../utils/priorityScore');
const { getTotalPoints, getLevelInfo } = require('../utils/pointsUtils');

router.use(authMiddleware);

router.get('/', (req, res) => {
  const uid = req.user.id;
  const today = new Date().toISOString().slice(0, 10);

  // Pending tasks due today or overdue
  const pendingToday = db.prepare(`
    SELECT * FROM tasks WHERE user_id = ? AND status IN ('pending','in_progress')
    AND due_date <= ? ORDER BY due_date ASC, priority DESC
  `).all(uid, today);

  // Top 5 priority queue
  const allPending = db.prepare(`SELECT * FROM tasks WHERE user_id = ? AND status IN ('pending','in_progress')`).all(uid);
  const priorityQueue = allPending
    .map(t => ({ ...t, priority_score: computePriorityScore(t) }))
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, 5);

  // Today's journal entry
  const journal = db.prepare('SELECT * FROM journal_entries WHERE user_id = ? AND date = ?').get(uid, today);

  // Streaks
  const streakRows = db.prepare('SELECT * FROM streaks WHERE user_id = ?').all(uid);
  const streaks = {};
  streakRows.forEach(r => { streaks[r.activity_type] = { current: r.current_streak, longest: r.longest_streak }; });

  // Stats
  const totalTasks = db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status != 'cancelled'`).get(uid).c;
  const completedTasks = db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'completed'`).get(uid).c;
  const totalJournal = db.prepare('SELECT COUNT(*) as c FROM journal_entries WHERE user_id = ?').get(uid).c;

  // ── Snapshot ────────────────────────────────────────────────
  // Habits
  let habitsDone = 0, habitsTotal = 0;
  try {
    habitsTotal = (db.prepare('SELECT COUNT(*) as c FROM habits WHERE user_id = ?').get(uid) || {}).c || 0;
    habitsDone  = (db.prepare(`SELECT COUNT(*) as c FROM habit_logs WHERE user_id = ? AND done = 1 AND date = ?`).get(uid, today) || {}).c || 0;
  } catch (_) {}

  // Sleep
  let lastSleep = null;
  try {
    lastSleep = db.prepare('SELECT date, duration_minutes, quality FROM sleep_logs WHERE user_id = ? ORDER BY date DESC LIMIT 1').get(uid) || null;
  } catch (_) {}

  // Workout
  let lastWorkout = null;
  try {
    lastWorkout = db.prepare('SELECT date, name FROM workout_sessions WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT 1').get(uid) || null;
  } catch (_) {}

  // Diet
  let todayCalories = null, todayProtein = null;
  try {
    const dietRow = db.prepare(`SELECT SUM(calories) as cal, SUM(protein_g) as prot FROM food_logs WHERE user_id = ? AND date = ?`).get(uid, today);
    if (dietRow && dietRow.cal != null) todayCalories = Math.round(dietRow.cal);
    if (dietRow && dietRow.prot != null) todayProtein = Math.round(dietRow.prot);
  } catch (_) {}

  // Body
  let latestBody = null;
  try {
    latestBody = db.prepare('SELECT weight_kg, body_fat_pct, date FROM body_stats WHERE user_id = ? ORDER BY date DESC LIMIT 1').get(uid) || null;
  } catch (_) {}

  // Finance (this month)
  let financeIncome = null, financeExpenses = null;
  try {
    const firstOfMonth = today.slice(0, 7) + '-01';
    const finRow = db.prepare(`
      SELECT
        SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses
      FROM finance_entries WHERE user_id = ? AND date >= ?
    `).get(uid, firstOfMonth);
    if (finRow) {
      financeIncome   = finRow.income   != null ? Math.round(finRow.income   * 100) / 100 : null;
      financeExpenses = finRow.expenses != null ? Math.round(finRow.expenses * 100) / 100 : null;
    }
  } catch (_) {}

  const snapshot = {
    habitsDone, habitsTotal,
    lastSleep, lastWorkout,
    todayCalories, todayProtein,
    latestBody,
    financeIncome, financeExpenses
  };

  // Points / score
  let points = { total: 0, today: 0, level: 1, levelLabel: 'Beginner', nextLevel: 500, progressPct: 0 };
  try {
    const totalPts  = getTotalPoints(uid);
    const todayPts  = (db.prepare("SELECT SUM(points) as s FROM points_log WHERE user_id = ? AND DATE(created_at) = date('now')").get(uid) || {}).s || 0;
    points = { total: totalPts, today: todayPts, ...getLevelInfo(totalPts) };
  } catch (_) {}

  res.json({
    today,
    pendingToday,
    priorityQueue,
    journal,
    streaks,
    stats: { totalTasks, completedTasks, totalJournal },
    snapshot,
    points
  });
});

module.exports = router;
