const db = require('../db/database');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Update a streak for a given activity type.
 * Increments if last_activity_date was today (idempotent) or yesterday (consecutive).
 * Resets to 1 if gap > 1 day.
 */
function updateStreak(userId, activityType) {
  try {
    const todayStr = today();
    const yesterdayStr = yesterday();

    const existing = db
      .prepare('SELECT * FROM streaks WHERE user_id = ? AND activity_type = ?')
      .get(userId, activityType);

    if (!existing) {
      db.prepare(`
        INSERT INTO streaks (user_id, activity_type, current_streak, longest_streak, last_activity_date)
        VALUES (?, ?, 1, 1, ?)
      `).run(userId, activityType, todayStr);
      return;
    }

    if (existing.last_activity_date === todayStr) return; // already counted today

    let newStreak;
    if (existing.last_activity_date === yesterdayStr) {
      newStreak = existing.current_streak + 1;
    } else {
      newStreak = 1; // gap — reset
    }

    const longest = Math.max(newStreak, existing.longest_streak);
    db.prepare(`
      UPDATE streaks SET current_streak = ?, longest_streak = ?, last_activity_date = ?
      WHERE user_id = ? AND activity_type = ?
    `).run(newStreak, longest, todayStr, userId, activityType);
  } catch (e) {
    // Streak updates are non-critical — never crash the calling route
    console.error('[streak] updateStreak failed:', activityType, e.message);
  }
}

/**
 * After any activity, check if both tasks AND journal were done today → update overall streak.
 */
function maybeUpdateOverallStreak(userId) {
  const todayStr = today();

  const taskDoneToday = db
    .prepare(`SELECT 1 FROM tasks WHERE user_id = ? AND DATE(completed_at) = ? AND status = 'completed' LIMIT 1`)
    .get(userId, todayStr);

  const journalToday = db
    .prepare(`SELECT 1 FROM journal_entries WHERE user_id = ? AND date = ? LIMIT 1`)
    .get(userId, todayStr);

  if (taskDoneToday && journalToday) {
    updateStreak(userId, 'overall');
  }
}

function getStreaks(userId) {
  return db.prepare('SELECT * FROM streaks WHERE user_id = ?').all(userId);
}

module.exports = { updateStreak, maybeUpdateOverallStreak, getStreaks };
