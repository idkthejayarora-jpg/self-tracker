const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET env var is not set. Refusing to start.');
    process.exit(1);
  } else {
    // Development-only fallback — never used in production
    console.warn('[auth] JWT_SECRET not set — using insecure dev default. Set it for production.');
    module.exports.JWT_SECRET = 'dev-only-secret-do-not-use-in-production';
  }
}

const RESOLVED_SECRET = JWT_SECRET || 'dev-only-secret-do-not-use-in-production';

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, RESOLVED_SECRET);
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

module.exports = { authMiddleware, JWT_SECRET: RESOLVED_SECRET };
