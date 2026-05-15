const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { JWT_SECRET, ensureUserExists } = require('../middleware/auth');

// Wipe ALL users (and all their data via CASCADE): POST /api/auth/wipe-all { secret }
// One-time use to give a clean slate. Requires RESET_SECRET.
router.post('/wipe-all', (req, res) => {
  const { secret } = req.body;
  const expected = process.env.RESET_SECRET;
  if (!expected || secret !== expected) return res.status(403).json({ error: 'Forbidden' });
  const { changes } = db.prepare('DELETE FROM users').run();
  console.log(`[wipe-all] Deleted ${changes} user(s) and all cascaded data.`);
  res.json({ ok: true, users_deleted: changes });
});

// Emergency reset: POST /api/auth/reset  { secret, username, new_password }
// Requires RESET_SECRET env var to be set on the server
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

router.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);

  // Initialise streaks
  const initStreak = db.prepare(`
    INSERT OR IGNORE INTO streaks (user_id, activity_type, current_streak, longest_streak)
    VALUES (?, ?, 0, 0)
  `);
  ['tasks', 'journal', 'overall'].forEach(t => initStreak.run(result.lastInsertRowid, t));

  const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: result.lastInsertRowid, username } });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username } });
});

// Token health-check — called on app startup to verify session is still valid.
// Also auto-restores the user row if the DB was wiped (token stays valid).
router.get('/me', (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    if (!ensureUserExists(db, payload)) {
      return res.status(401).json({ error: 'session_gone' });
    }
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(payload.id);
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
});

router.post('/change-password', (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const { authMiddleware: _, JWT_SECRET: secret } = require('../middleware/auth');
  const jwt = require('jsonwebtoken');
  let userId;
  try {
    const payload = jwt.verify(header.slice(7), secret);
    userId = payload.id;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both fields required' });
  if (new_password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  res.json({ ok: true });
});

module.exports = router;
