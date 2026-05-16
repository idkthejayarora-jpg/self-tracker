const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db/database');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

// ── Emergency: wipe ALL users + cascaded data ────────────────────────────────
// POST /api/auth/wipe-all { secret }
// Requires RESET_SECRET env var. Used only by the operator, never by the app.
router.post('/wipe-all', (req, res) => {
  const { secret } = req.body;
  const expected   = process.env.RESET_SECRET;
  if (!expected || secret !== expected) return res.status(403).json({ error: 'Forbidden' });
  const { changes } = db.prepare('DELETE FROM users').run();
  console.log(`[wipe-all] Deleted ${changes} user(s) and all cascaded data.`);
  res.json({ ok: true, users_deleted: changes });
});

// ── Emergency: reset a user's password ──────────────────────────────────────
// POST /api/auth/reset { secret, username, new_password }
// Requires RESET_SECRET env var.
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

// ── Register ─────────────────────────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)    return res.status(400).json({ error: 'Username and password required' });
  if (username.trim().length < 2) return res.status(400).json({ error: 'Username must be at least 2 characters' });
  if (password.length < 4)        return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const hash   = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
                   .run(username.trim(), hash);

  // Initialise streaks for all tracked activity types
  const initStreak = db.prepare(
    'INSERT OR IGNORE INTO streaks (user_id, activity_type, current_streak, longest_streak) VALUES (?, ?, 0, 0)'
  );
  ['tasks', 'journal', 'overall', 'workout', 'sleep'].forEach(t => initStreak.run(result.lastInsertRowid, t));

  const token = jwt.sign(
    { id: result.lastInsertRowid, username: username.trim() },
    JWT_SECRET,
    { expiresIn: '30d' }
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
    { expiresIn: '30d' }
  );
  res.json({ token, user: { id: user.id, username: user.username } });
});

// ── Token health-check ───────────────────────────────────────────────────────
// GET /api/auth/me — validates the stored JWT and returns the current user.
// Returns 401 if the token is invalid OR if the user no longer exists in the DB
// (e.g. after a DB wipe). The client should clear the token and show login.
router.get('/me', (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user    = db.prepare('SELECT id, username FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'session_gone' });
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'invalid_token' });
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

module.exports = router;
