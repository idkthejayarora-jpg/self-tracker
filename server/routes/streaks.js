const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM streaks WHERE user_id = ?').all(req.user.id);
  // Return as an object keyed by activity_type for easier frontend consumption
  const result = {};
  rows.forEach(r => {
    result[r.activity_type] = {
      current: r.current_streak,
      longest: r.longest_streak,
      lastDate: r.last_activity_date
    };
  });
  res.json(result);
});

module.exports = router;
