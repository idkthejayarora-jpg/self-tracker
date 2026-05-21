require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/journal', require('./routes/journal'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/streaks', require('./routes/streaks'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/workout', require('./routes/workout'));
app.use('/api/life', require('./routes/life'));
app.use('/api/diet', require('./routes/diet'));
app.use('/api/detox',   require('./routes/detox'));
app.use('/api/habits',  require('./routes/habits'));
app.use('/api/body',    require('./routes/body'));
app.use('/api/sleep',   require('./routes/sleep'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/points', require('./routes/points'));
app.use('/api/checkin', require('./routes/checkin'));
app.use('/api/me',      require('./routes/me'));
app.use('/api/content', require('./routes/content'));

app.get('/api/health', (_, res) => {
  const dbDir  = process.env.DATA_PATH || require('path').join(__dirname, 'data');
  const dbPath = require('path').join(dbDir, 'tracker.db');
  const exists = require('fs').existsSync(dbPath);
  res.json({
    ok: true,
    db_path: dbPath,
    db_exists: exists,
    data_path_env: process.env.DATA_PATH || '(not set — using local fallback)',
    node_env: process.env.NODE_ENV || 'development',
  });
});

// Serve built frontend in production/standalone mode
const distPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// Global error handler — catches sync throws and next(err) from route handlers
app.use((err, req, res, _next) => {
  console.error('[ERROR]', req.method, req.path, err.message);
  // Include route path in the response so the client error banner shows exactly which endpoint failed
  res.status(500).json({ error: `${err.message || 'Internal server error'} [${req.method} ${req.path}]` });
});

// Catch unhandled promise rejections so they don't silently crash routes
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
