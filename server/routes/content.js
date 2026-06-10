'use strict';
const express = require('express');
const router  = express.Router();
const { authMiddleware } = require('../middleware/auth');
const db = require('../db/database');
const { localDate } = require('../utils/dateUtils');
const { awardPoints, alreadyAwardedEver, applySkillXP } = require('../utils/pointsUtils');
const { updateStreak } = require('../utils/streakUtils');

router.use(authMiddleware);

// Points by content status transition
const STATUS_POINTS = { scripted: 5, filmed: 10, posted: 25 };

// ── Niches ────────────────────────────────────────────────────────────────────

router.get('/niches', (req, res) => {
  const niches = db.prepare(
    'SELECT n.*, (SELECT COUNT(*) FROM content_ideas WHERE niche_id=n.id) AS idea_count FROM content_niches n WHERE n.user_id=? ORDER BY n.sort_order, n.created_at'
  ).all(req.user.id);
  res.json(niches);
});

router.post('/niches', (req, res) => {
  const { name, color = '#d97757', icon = '', sort_order = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const r = db.prepare(
    'INSERT INTO content_niches (user_id, name, color, icon, sort_order) VALUES (?,?,?,?,?)'
  ).run(req.user.id, name.trim(), color, icon, sort_order);

  // +5 pts per new niche (once)
  awardPoints(req.user.id, 'content', 'niche_create', 5, r.lastInsertRowid, name.trim());

  res.status(201).json(db.prepare('SELECT * FROM content_niches WHERE id=?').get(r.lastInsertRowid));
});

router.put('/niches/:id', (req, res) => {
  const niche = db.prepare('SELECT * FROM content_niches WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!niche) return res.status(404).json({ error: 'Not found' });
  const { name = niche.name, color = niche.color, icon = niche.icon, sort_order = niche.sort_order } = req.body;
  db.prepare('UPDATE content_niches SET name=?, color=?, icon=?, sort_order=? WHERE id=?')
    .run(name.trim(), color, icon, sort_order, req.params.id);
  res.json(db.prepare('SELECT * FROM content_niches WHERE id=?').get(req.params.id));
});

router.delete('/niches/:id', (req, res) => {
  const niche = db.prepare('SELECT * FROM content_niches WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!niche) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM content_niches WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Ideas ─────────────────────────────────────────────────────────────────────

router.get('/ideas', (req, res) => {
  const { status, niche_id } = req.query;
  let sql = `
    SELECT i.*, n.name AS niche_name, n.color AS niche_color, n.icon AS niche_icon
    FROM content_ideas i
    LEFT JOIN content_niches n ON n.id = i.niche_id
    WHERE i.user_id = ?
  `;
  const params = [req.user.id];
  if (status)   { sql += ' AND i.status = ?';   params.push(status); }
  if (niche_id) { sql += ' AND i.niche_id = ?'; params.push(niche_id); }
  sql += ' ORDER BY i.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/ideas', (req, res) => {
  const {
    title, notes = null, niche_id = null,
    content_type = 'reel', status = 'idea',
    scheduled_date = null, posted_at = null,
  } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const r = db.prepare(`
    INSERT INTO content_ideas (user_id, niche_id, title, notes, content_type, status, scheduled_date, posted_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(req.user.id, niche_id || null, title.trim(), notes, content_type, status, scheduled_date, posted_at);

  const idea = db.prepare(`
    SELECT i.*, n.name AS niche_name, n.color AS niche_color, n.icon AS niche_icon
    FROM content_ideas i LEFT JOIN content_niches n ON n.id = i.niche_id
    WHERE i.id = ?
  `).get(r.lastInsertRowid);
  res.status(201).json(idea);
});

router.put('/ideas/:id', (req, res) => {
  const idea = db.prepare('SELECT * FROM content_ideas WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!idea) return res.status(404).json({ error: 'Not found' });
  const {
    title = idea.title,
    notes = idea.notes,
    niche_id = idea.niche_id,
    content_type = idea.content_type,
    status = idea.status,
    scheduled_date = idea.scheduled_date,
    posted_at = idea.posted_at,
  } = req.body;

  // If advancing to posted and no posted_at provided, default to today
  const resolvedPostedAt = status === 'posted' && !posted_at ? (idea.posted_at || localDate()) : posted_at;

  db.prepare(`
    UPDATE content_ideas
    SET title=?, notes=?, niche_id=?, content_type=?, status=?, scheduled_date=?, posted_at=?, updated_at=datetime('now')
    WHERE id=?
  `).run(title.trim(), notes, niche_id || null, content_type, status, scheduled_date, resolvedPostedAt, req.params.id);

  // ── Wire into points / streaks / skills on status transitions ────────────
  if (status && status !== idea.status && STATUS_POINTS[status]) {
    const uid    = req.user.id;
    const ideaId = parseInt(req.params.id);
    const niche  = idea.niche_id
      ? db.prepare('SELECT name FROM content_niches WHERE id=?').get(idea.niche_id)
      : null;

    // One-shot per (idea, status) action — prevents double awards on multiple PUTs
    if (!alreadyAwardedEver(uid, 'content', ideaId, status)) {
      awardPoints(uid, 'content', status, STATUS_POINTS[status], ideaId, title.trim());

      // Skill XP per stage
      if (status === 'scripted') applySkillXP(uid, 'content', ['writing','content','script']);
      if (status === 'filmed')   applySkillXP(uid, 'content', ['video','content','production']);
      if (status === 'posted') {
        applySkillXP(uid, 'content', ['content','social','reel', content_type, niche?.name]);
        updateStreak(uid, 'content');
      }
    }
  }

  // ── Auto-reminder when scheduled_date is set or changed ──────────────────
  if (scheduled_date && scheduled_date !== idea.scheduled_date) {
    try {
      db.prepare(`
        INSERT INTO reminders (user_id, title, description, remind_at, repeat)
        VALUES (?, ?, ?, datetime(? || ' 09:00:00'), 'none')
      `).run(req.user.id, `Post today: ${title.trim()}`, `Scheduled content (${content_type})`, scheduled_date);
    } catch (e) { /* table missing in old DBs — non-critical */ }
  }

  const updated = db.prepare(`
    SELECT i.*, n.name AS niche_name, n.color AS niche_color, n.icon AS niche_icon
    FROM content_ideas i LEFT JOIN content_niches n ON n.id = i.niche_id
    WHERE i.id = ?
  `).get(req.params.id);
  res.json(updated);
});

router.delete('/ideas/:id', (req, res) => {
  const idea = db.prepare('SELECT * FROM content_ideas WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!idea) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM content_ideas WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get('/stats', (req, res) => {
  const today = localDate();

  // Last post date
  const lastPostRow = db.prepare(
    `SELECT posted_at FROM content_ideas WHERE user_id=? AND status='posted' AND posted_at IS NOT NULL ORDER BY posted_at DESC LIMIT 1`
  ).get(req.user.id);
  const lastPostDate = lastPostRow?.posted_at || null;

  let daysSinceLastPost = null;
  if (lastPostDate) {
    const diff = Math.floor((new Date(today) - new Date(lastPostDate)) / 86400000);
    daysSinceLastPost = diff;
  }

  // Pipeline counts by status
  const statusCounts = db.prepare(
    `SELECT status, COUNT(*) as count FROM content_ideas WHERE user_id=? GROUP BY status`
  ).all(req.user.id);
  const byStatus = {};
  for (const r of statusCounts) byStatus[r.status] = r.count;

  // In-pipeline = not posted, not archived
  const inPipeline = (byStatus['idea'] || 0) + (byStatus['scripted'] || 0) + (byStatus['filmed'] || 0);

  // Weekly posts: last 8 weeks (Mon–Sun buckets)
  const weeksAgo8 = new Date(today);
  weeksAgo8.setDate(weeksAgo8.getDate() - 56);
  const weeklyRows = db.prepare(`
    SELECT posted_at, niche_id FROM content_ideas
    WHERE user_id=? AND status='posted' AND posted_at >= ? ORDER BY posted_at ASC
  `).all(req.user.id, weeksAgo8.toISOString().slice(0, 10));

  // Build 8 week buckets
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const end = new Date(today);
    end.setDate(end.getDate() - (i * 7));
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    weeks.push({
      label: `W${8 - i}`,
      start: start.toISOString().slice(0, 10),
      end:   end.toISOString().slice(0, 10),
      posts: [],
    });
  }
  for (const row of weeklyRows) {
    for (const w of weeks) {
      if (row.posted_at >= w.start && row.posted_at <= w.end) {
        w.posts.push({ niche_id: row.niche_id });
      }
    }
  }

  // Posting streak (consecutive weeks with ≥1 post, going backwards from current week)
  let postingStreak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].posts.length > 0) postingStreak++;
    else break;
  }

  // Niches for colour mapping
  const niches = db.prepare('SELECT id, name, color FROM content_niches WHERE user_id=?').all(req.user.id);

  res.json({
    lastPostDate,
    daysSinceLastPost,
    inPipeline,
    byStatus,
    postingStreak,
    weeklyData: weeks.map(w => ({ label: w.label, count: w.posts.length, start: w.start })),
    niches,
  });
});

module.exports = router;
