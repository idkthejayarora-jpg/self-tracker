const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'self-tracker-secret-key';

// Ensure user row exists for a valid JWT payload.
// If the DB was wiped but the token is still cryptographically valid,
// we silently recreate the user record instead of forcing re-registration.
function ensureUserExists(db, payload) {
  let user = db.prepare('SELECT id FROM users WHERE id = ?').get(payload.id);
  if (user) return true;

  // DB was wiped — restore the user record from the JWT (token is already verified)
  try {
    // Random unusable password hash — user logs in via token, not password
    const fakeHash = '$2b$10$' + crypto.randomBytes(22).toString('base64url').slice(0, 31);
    db.prepare('INSERT OR IGNORE INTO users (id, username, password_hash) VALUES (?, ?, ?)')
      .run(payload.id, payload.username, fakeHash);

    // Re-init streaks (INSERT OR IGNORE — safe to run multiple times)
    const initStreak = db.prepare(
      'INSERT OR IGNORE INTO streaks (user_id, activity_type, current_streak, longest_streak) VALUES (?, ?, 0, 0)'
    );
    ['tasks', 'journal', 'overall', 'workout', 'sleep'].forEach(t => initStreak.run(payload.id, t));

    user = db.prepare('SELECT id FROM users WHERE id = ?').get(payload.id);
    if (user) {
      console.log(`[auth] Auto-restored user "${payload.username}" (id=${payload.id}) from valid JWT`);
      return true;
    }
  } catch (e) {
    console.error('[auth] Auto-restore failed:', e.message);
  }
  return false;
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = require('../db/database');
    if (!ensureUserExists(db, payload)) {
      return res.status(401).json({ error: 'session_gone' });
    }
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { authMiddleware, JWT_SECRET, ensureUserExists };
