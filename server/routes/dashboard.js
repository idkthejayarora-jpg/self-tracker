const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { computePriorityScore } = require('../utils/priorityScore');

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

  res.json({
    today,
    pendingToday,
    priorityQueue,
    journal,
    streaks,
    stats: { totalTasks, completedTasks, totalJournal }
  });
});

module.exports = router;
