const router = require('express').Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { aiEnabled, converse, commitSheet, greeting } = require('../utils/jayBrain');

router.use(authMiddleware);

// GET /state — opening greeting + whether the AI brain is live
router.get('/state', (req, res) => {
  const profile = db.prepare('SELECT character_name FROM me_profile WHERE user_id=?').get(req.user.id);
  const name = profile?.character_name || req.user.username || null;
  res.json({
    ai: aiEnabled(),
    greeting: greeting(name),
    name,
  });
});

// POST /converse — one conversational turn.
// body: { transcript: [{ role: 'jay'|'user', text }] }
router.post('/converse', async (req, res) => {
  try {
    const transcript = (req.body.transcript || [])
      .filter(t => t && typeof t.text === 'string' && t.text.trim())
      .map(t => ({ role: t.role === 'user' ? 'user' : 'assistant', text: t.text.trim() }));
    const result = await converse(req.user.id, transcript);
    res.json(result);
  } catch (e) {
    console.error('[jay/converse]', e.message);
    res.status(500).json({ error: 'Jay lost his train of thought — try again.' });
  }
});

// POST /commit — write the gathered sheet into every sector.
// body: { sheet: {...} }
router.post('/commit', (req, res) => {
  try {
    const filled = commitSheet(req.user.id, req.body.sheet || {});
    res.json({ filled });
  } catch (e) {
    console.error('[jay/commit]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
