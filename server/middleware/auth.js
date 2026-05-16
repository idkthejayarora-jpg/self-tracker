const jwt = require('jsonwebtoken');

// IMPORTANT: keep this fallback identical to the original so tokens
// created before a JWT_SECRET env var was set remain valid.
const JWT_SECRET = process.env.JWT_SECRET || 'self-tracker-secret-key';

if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET env var not set — using built-in fallback. Set it in Railway for production.');
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const db = require('../db/database');
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'session_gone' });
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
