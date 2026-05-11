const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

function getWeekRange(weeksAgo) {
  const end = new Date();
  end.setDate(end.getDate() - weeksAgo * 7);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: weeksAgo === 0 ? 'This week' : `${weeksAgo}w ago`
  };
}

// GET /api/analytics/weekly?weeks=8
router.get('/weekly', (req, res) => {
  const weeks = Math.min(Number(req.query.weeks) || 8, 16);
  const uid = req.user.id;
  const data = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const { start, end, label } = getWeekRange(i);

    // Tasks
    const taskStats = db.prepare(`
      SELECT
        COUNT(*) as created,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM tasks WHERE user_id = ? AND DATE(created_at) BETWEEN ? AND ?
    `).get(uid, start, end);

    const taskScore = taskStats.created > 0
      ? Math.min(Math.round((taskStats.completed / taskStats.created) * 100), 100)
      : null;

    // Journal
    const journalCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM journal_entries WHERE user_id = ? AND date BETWEEN ? AND ?
    `).get(uid, start, end).cnt;

    const journalScore = Math.min(Math.round((journalCount / 7) * 100), 100);

    // Avg mood
    const moodRow = db.prepare(`
      SELECT AVG(mood) as avg_mood FROM journal_entries
      WHERE user_id = ? AND date BETWEEN ? AND ? AND mood IS NOT NULL
    `).get(uid, start, end);

    // Habits score
    let habitsScore = null;
    try {
      const totalHabits = (db.prepare('SELECT COUNT(*) as c FROM habits WHERE user_id = ?').get(uid) || {}).c || 0;
      if (totalHabits > 0) {
        const doneCount = (db.prepare(`
          SELECT COUNT(*) as c FROM habit_logs
          WHERE user_id = ? AND done = 1 AND date BETWEEN ? AND ?
        `).get(uid, start, end) || {}).c || 0;
        const possible = totalHabits * 7;
        habitsScore = Math.min(Math.round((doneCount / possible) * 100), 100);
      }
    } catch (_) {}

    // Sleep avg hrs
    let sleepAvgHrs = null;
    try {
      const sleepRow = db.prepare(`
        SELECT AVG(duration_minutes) as avg_min FROM sleep_logs
        WHERE user_id = ? AND date BETWEEN ? AND ? AND duration_minutes IS NOT NULL
      `).get(uid, start, end);
      if (sleepRow && sleepRow.avg_min != null) {
        sleepAvgHrs = Math.round((sleepRow.avg_min / 60) * 10) / 10;
      }
    } catch (_) {}

    // Workout sessions
    let workoutSessions = 0;
    try {
      workoutSessions = (db.prepare(`
        SELECT COUNT(*) as c FROM workout_sessions WHERE user_id = ? AND date BETWEEN ? AND ?
      `).get(uid, start, end) || {}).c || 0;
    } catch (_) {}

    data.push({
      week: label,
      start,
      end,
      task_score: taskScore,
      journal_score: journalScore,
      avg_mood: moodRow.avg_mood ? Math.round(moodRow.avg_mood * 10) / 10 : null,
      tasks_created: taskStats.created,
      tasks_completed: taskStats.completed,
      journal_entries: journalCount,
      habits_score: habitsScore,
      sleep_avg_hrs: sleepAvgHrs,
      workout_sessions: workoutSessions
    });
  }

  res.json(data);
});

// GET /api/analytics/mood?days=30
router.get('/mood', (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 90);
  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  const sinceStr = since.toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT date, mood FROM journal_entries
    WHERE user_id = ? AND date >= ? AND mood IS NOT NULL
    ORDER BY date ASC
  `).all(req.user.id, sinceStr);

  res.json(rows);
});

// GET /api/analytics/tasks?weeks=8
router.get('/tasks', (req, res) => {
  const weeks = Math.min(Number(req.query.weeks) || 8, 16);
  const uid = req.user.id;
  const data = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const { start, end, label } = getWeekRange(i);
    const row = db.prepare(`
      SELECT
        COUNT(*) as created,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM tasks WHERE user_id = ? AND DATE(created_at) BETWEEN ? AND ?
    `).get(uid, start, end);
    data.push({ week: label, created: row.created, completed: row.completed });
  }

  res.json(data);
});

// GET /api/analytics/journal?days=90  — heatmap data
router.get('/journal', (req, res) => {
  const days = Math.min(Number(req.query.days) || 90, 365);
  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  const sinceStr = since.toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT date, mood FROM journal_entries
    WHERE user_id = ? AND date >= ?
    ORDER BY date ASC
  `).all(req.user.id, sinceStr);

  res.json(rows);
});

module.exports = router;
