const db = require('../db/database');

function awardPoints(userId, source, action, points, sourceId = null, note = null) {
  try {
    db.prepare(`
      INSERT INTO points_log (user_id, source, source_id, action, points, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, source, sourceId, action, points, note);
  } catch (e) {
    console.error('[points] awardPoints failed:', e.message);
  }
}

function getTotalPoints(userId) {
  try {
    const row = db.prepare('SELECT SUM(points) as total FROM points_log WHERE user_id = ?').get(userId);
    return row?.total ?? 0;
  } catch { return 0; }
}

const LEVELS = [
  { level: 1, min: 0,     max: 499,   label: 'Beginner' },
  { level: 2, min: 500,   max: 1499,  label: 'Builder'  },
  { level: 3, min: 1500,  max: 3499,  label: 'Achiever' },
  { level: 4, min: 3500,  max: 6999,  label: 'Champion' },
  { level: 5, min: 7000,  max: 11999, label: 'Warrior'  },
  { level: 6, min: 12000, max: null,  label: 'Legend'   },
];

function getLevelInfo(total) {
  const current = LEVELS.findLast(l => total >= l.min) || LEVELS[0];
  const next = LEVELS.find(l => l.level === current.level + 1) || null;
  const progressPct = next
    ? Math.min(100, Math.round(((total - current.min) / (next.min - current.min)) * 100))
    : 100;
  return {
    level: current.level,
    levelLabel: current.label,
    nextLevel: next ? next.min - total : null,
    progressPct,
  };
}

module.exports = { awardPoints, getTotalPoints, getLevelInfo };
