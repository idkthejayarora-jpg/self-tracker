const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db/database');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

// ── Register ─────────────────────────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)     return res.status(400).json({ error: 'Username and password required' });
  if (username.trim().length < 2) return res.status(400).json({ error: 'Username must be at least 2 characters' });
  if (password.length < 4)        return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const hash   = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
                   .run(username.trim(), hash);

  const initStreak = db.prepare(
    'INSERT OR IGNORE INTO streaks (user_id, activity_type, current_streak, longest_streak) VALUES (?, ?, 0, 0)'
  );
  ['tasks', 'journal', 'overall', 'workout', 'sleep'].forEach(t => initStreak.run(result.lastInsertRowid, t));

  const token = jwt.sign(
    { id: result.lastInsertRowid, username: username.trim() },
    JWT_SECRET,
    { expiresIn: '90d' }
  );
  res.json({ token, user: { id: result.lastInsertRowid, username: username.trim() } });
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '90d' }
  );
  res.json({ token, user: { id: user.id, username: user.username } });
});

// ── Token health-check ───────────────────────────────────────────────────────
// GET /api/auth/me — validates the stored JWT and returns user info.
// Returns 401 only if the token itself is invalid/expired (not if user is missing).
// Matching Kaamkaro: a valid JWT keeps you logged in regardless of DB state.
router.get('/me', (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    // Try to get user from DB — but don't 401 if missing, just return payload data
    let user;
    try {
      user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(payload.id);
    } catch (_) {}
    res.json({ user: user ?? { id: payload.id, username: payload.username } });
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token';
    res.status(401).json({ error: msg });
  }
});

// ── Change password ───────────────────────────────────────────────────────────
router.post('/change-password', authMiddleware, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both fields required' });
  if (new_password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
});

// ── Emergency: reset a user's password ──────────────────────────────────────
// POST /api/auth/reset { secret, username, new_password }
// Requires RESET_SECRET env var set in Railway.
router.post('/reset', (req, res) => {
  const { secret, username, new_password } = req.body;
  const expected = process.env.RESET_SECRET;
  if (!expected || secret !== expected) return res.status(403).json({ error: 'Forbidden' });
  if (!username || !new_password) return res.status(400).json({ error: 'username and new_password required' });
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  res.json({ ok: true, message: `Password reset for ${username}` });
});

module.exports = router;
