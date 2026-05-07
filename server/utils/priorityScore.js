/**
 * Compute a priority score (0–100) for a task.
 * Higher = needs more urgent attention in the follow-up queue.
 */
function computePriorityScore(task) {
  const now = new Date();
  let score = 0;

  // Base from priority level
  const priorityBase = { urgent: 25, high: 18, medium: 10, low: 4 };
  score += priorityBase[task.priority] || 10;

  // Days overdue (capped at +30)
  if (task.due_date) {
    const due = new Date(task.due_date);
    const daysOverdue = Math.floor((now - due) / 86400000);
    if (daysOverdue > 0) {
      score += Math.min(daysOverdue * 3, 30);
    }
  }

  // Deferred penalty (capped at +20)
  if (task.deferred_count > 0) {
    score += Math.min(task.deferred_count * 5, 20);
  }

  // Follow-up date has passed
  if (task.follow_up_date) {
    const fu = new Date(task.follow_up_date);
    if (now >= fu) score += 10;
  }

  return Math.min(Math.round(score), 100);
}

module.exports = { computePriorityScore };
