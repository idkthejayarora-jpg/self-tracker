const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'self-tracker-secret-key';

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Verify the user still exists in the DB.
    // This catches stale tokens after a DB reset (which would otherwise
    // cause FK constraint errors on every INSERT).
    const db = require('../db/database');
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(payload.id);
    if (!user) {
      return res.status(401).json({ error: 'Session expired. Please log out and log back in.' });
    }
    req.user = payload;
    next();
  } catch (e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
