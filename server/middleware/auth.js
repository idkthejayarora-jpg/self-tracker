const jwt = require('jsonwebtoken');

// JWT_SECRET: required env var in production, falls back to a safe dev-only default.
// If unset in production, log a loud warning but DON'T crash — a crash would make
// the server unreachable and block all logins/registrations entirely.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-please-set-JWT_SECRET';

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  [auth] JWT_SECRET env var is not set!');
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️  [auth] Running in PRODUCTION without JWT_SECRET is insecure.');
    console.warn('⚠️  [auth] Set JWT_SECRET in your Railway environment variables.');
  }
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

    // Verify the user actually exists in the DB.
    // If the DB was wiped the token is cryptographically valid but the session
    // is gone — return session_gone so the client clears the token and shows login.
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(payload.id);
    if (!user) {
      return res.status(401).json({ error: 'session_gone' });
    }

    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
