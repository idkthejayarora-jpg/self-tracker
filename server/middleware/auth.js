const jwt = require('jsonwebtoken');

// IMPORTANT: this fallback must stay identical across deploys so tokens
// created before JWT_SECRET was set in the environment remain valid.
const JWT_SECRET = process.env.JWT_SECRET || 'self-tracker-secret-key';

if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET not set — using built-in fallback. Set it in Railway env vars for production.');
}

// ── Auth middleware ──────────────────────────────────────────────────────────
// Validates the JWT signature ONLY — no database lookup on every request.
// A valid signature = valid session. Individual routes fetch user data as needed.
// This matches how Kaamkaro AI works: the JWT is the source of truth, so a
// Railway redeploy or brief DB unavailability does NOT cascade-logout the user.
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token';
    return res.status(401).json({ error: msg });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
