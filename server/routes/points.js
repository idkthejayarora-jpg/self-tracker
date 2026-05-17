const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { getLevelInfo } = require('../utils/pointsUtils');
const { SQL_NOW, sqlDateOf, SQL_OFF } = require('../utils/dateUtils');

router.use(authMiddleware);

router.get('/', (req, res) => {
  const uid = req.user.id;
  try {
    const totalRow = db.prepare('SELECT SUM(points) as total FROM points_log WHERE user_id = ?').get(uid);
    const todayRow = db.prepare(`SELECT SUM(points) as total FROM points_log WHERE user_id = ? AND ${sqlDateOf('created_at')} = ${SQL_NOW}`).get(uid);
    const weekRow  = db.prepare(`SELECT SUM(points) as total FROM points_log WHERE user_id = ? AND created_at >= date('now', ${SQL_OFF}, '-7 days')`).get(uid);
    const monthRow = db.prepare(`SELECT SUM(points) as total FROM points_log WHERE user_id = ? AND created_at >= date('now', ${SQL_OFF}, 'start of month')`).get(uid);

    const total     = totalRow?.total ?? 0;
    const today     = todayRow?.total ?? 0;
    const thisWeek  = weekRow?.total  ?? 0;
    const thisMonth = monthRow?.total ?? 0;

    const levelInfo = getLevelInfo(total);

    res.json({ total, today, thisWeek, thisMonth, ...levelInfo });
  } catch (e) {
    console.error('[points GET /]', e.message);
    res.json({ total: 0, today: 0, thisWeek: 0, thisMonth: 0, level: 1, levelLabel: 'Beginner', nextLevel: 500, progressPct: 0 });
  }
});

router.get('/log', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  try {
    const rows = db.prepare(
      'SELECT * FROM points_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(req.user.id, limit);
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
});

module.exports = router;
