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
app.use('/api/detox', require('./routes/detox'));

app.get('/api/health', (_, res) => res.json({ ok: true }));

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
