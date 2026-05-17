const express = require('express');
const router = express.Router();
const { parse } = require('../utils/localParser');
const { authMiddleware } = require('../middleware/auth');
const db = require('../db/database');
const { awardPoints } = require('../utils/pointsUtils');
const { updateStreak } = require('../utils/streakUtils');
const { localDate, localDatetime, SQL_NOW, sqlDateOf } = require('../utils/dateUtils');

router.use(authMiddleware);

router.post('/', async (req, res) => {
  const uid = req.user.id;
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });

  const today = localDate();

  // ── 1. Gather tasks & habits context ──────────────────────────────────────
  const tasks = db.prepare(
    "SELECT id, title, priority FROM tasks WHERE user_id = ? AND status IN ('pending','in_progress') ORDER BY created_at DESC LIMIT 40"
  ).all(uid);

  const habitsRaw = db.prepare('SELECT * FROM habits WHERE user_id = ? ORDER BY sort_order, created_at').all(uid);
  const habitLogs = db.prepare('SELECT * FROM habit_logs WHERE user_id = ? AND date = ?').all(uid, today);
  const logMap = {};
  habitLogs.forEach(l => { logMap[l.habit_id] = l; });
  const habits = habitsRaw.map(h => ({
    id: h.id,
    name: h.name,
    done: logMap[h.id] ? !!logMap[h.id].done : false,
  }));

  // ── 2. Load user skills for XP upgrades ───────────────────────────────────
  let userSkills = [];
  try {
    userSkills = db.prepare('SELECT * FROM me_skills WHERE user_id = ?').all(uid);
  } catch (_) { /* me_skills table may not exist yet — safe to skip */ }

  // ── 3. Run local rule-based parser ────────────────────────────────────────
  const parsed = parse(text.trim(), tasks, habits, userSkills);

  const actions_taken = [];

  // ── 4a. Complete tasks ──────────────────────────────────────────────────────
  const completedTaskIds = Array.isArray(parsed.completed_task_ids) ? parsed.completed_task_ids : [];
  for (const tid of completedTaskIds) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(tid, uid);
    if (!task || task.status === 'completed') continue;

    db.prepare(`
      UPDATE tasks SET status='completed', completed_at=? WHERE id = ? AND user_id = ?
    `).run(localDatetime(), tid, uid);

    const pts = { urgent: 50, high: 30, medium: 20, low: 10 }[task.priority] || 20;
    try { awardPoints(uid, 'task', 'complete', pts, tid, task.title); } catch (_) {}
    try { updateStreak(uid, 'tasks'); } catch (_) {}
    actions_taken.push(`✅ Task completed: "${task.title}"`);
  }

  // ── 4b. Mark habits done ───────────────────────────────────────────────────
  const completedHabitIds = Array.isArray(parsed.completed_habit_ids) ? parsed.completed_habit_ids : [];
  for (const hid of completedHabitIds) {
    const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(hid, uid);
    if (!habit) continue;

    db.prepare(`
      INSERT INTO habit_logs (user_id, habit_id, date, done)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(user_id, habit_id, date) DO UPDATE SET done = 1
    `).run(uid, hid, today);

    const alreadyAwarded = db.prepare(
      `SELECT 1 FROM points_log WHERE user_id=? AND source='habit' AND source_id=? AND ${sqlDateOf('created_at')}=${SQL_NOW}`
    ).get(uid, hid);
    if (!alreadyAwarded) {
      try { awardPoints(uid, 'habit', 'complete', 10, hid, habit.name); } catch (_) {}
    }
    actions_taken.push(`🔥 Habit done: "${habit.name}"`);
  }

  // ── 4c. Log sleep ──────────────────────────────────────────────────────────
  let sleep_logged = false;
  if (parsed.sleep && (parsed.sleep.bedtime || parsed.sleep.wake_time || parsed.sleep.quality)) {
    const s = parsed.sleep;
    let duration_minutes = null;
    if (s.bedtime && s.wake_time) {
      const [bh, bm] = s.bedtime.split(':').map(Number);
      const [wh, wm] = s.wake_time.split(':').map(Number);
      let mins = (wh * 60 + wm) - (bh * 60 + bm);
      if (mins < 0) mins += 24 * 60; // cross midnight
      duration_minutes = mins;
    }

    db.prepare(`
      INSERT INTO sleep_logs (user_id, date, bedtime, wake_time, duration_minutes, quality, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        bedtime=excluded.bedtime, wake_time=excluded.wake_time,
        duration_minutes=excluded.duration_minutes, quality=excluded.quality,
        notes=excluded.notes
    `).run(uid, today, s.bedtime || null, s.wake_time || null, duration_minutes, s.quality || null, s.notes || null);

    const alreadyAwardedSleep = db.prepare(
      `SELECT 1 FROM points_log WHERE user_id=? AND source='sleep' AND ${sqlDateOf('created_at')}=${SQL_NOW}`
    ).get(uid);
    if (!alreadyAwardedSleep) {
      try { awardPoints(uid, 'sleep', 'log', 15, null, 'Sleep logged'); } catch (_) {}
      try { updateStreak(uid, 'sleep'); } catch (_) {}
    }

    sleep_logged = true;
    const hrs = duration_minutes ? `${Math.floor(duration_minutes / 60)}h ${duration_minutes % 60}m` : null;
    actions_taken.push(`💤 Sleep logged${hrs ? ` (${hrs})` : ''}`);
  }

  // ── 4d. Save journal entry ─────────────────────────────────────────────────
  let journal_saved = false;
  const journalContent = (parsed.journal_entry || '').trim() || text.trim();
  if (journalContent) {
    const mood = (parsed.mood >= 1 && parsed.mood <= 5) ? parsed.mood : null;
    db.prepare(`
      INSERT INTO journal_entries (user_id, date, content, mood)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        content = excluded.content,
        mood = COALESCE(excluded.mood, mood),
        updated_at = CURRENT_TIMESTAMP
    `).run(uid, today, journalContent, mood);

    const alreadyAwardedJournal = db.prepare(
      `SELECT 1 FROM points_log WHERE user_id=? AND source='journal' AND ${sqlDateOf('created_at')}=${SQL_NOW}`
    ).get(uid);
    if (!alreadyAwardedJournal) {
      try { awardPoints(uid, 'journal', 'write', 20, null, 'Journal entry'); } catch (_) {}
      try { updateStreak(uid, 'journal'); } catch (_) {}
    }

    journal_saved = true;
    actions_taken.push(`📓 Journal saved${mood ? ` (mood: ${['','😞','😕','😐','🙂','😄'][mood]})` : ''}`);
  }

  // ── 4e. Skill XP upgrades ──────────────────────────────────────────────────
  let skills_upgraded = 0;
  for (const upgrade of (parsed.skillUpgrades || [])) {
    const skill = db.prepare('SELECT * FROM me_skills WHERE id = ? AND user_id = ?').get(upgrade.skill_id, uid);
    if (!skill) continue;
    let newXp    = (skill.xp    || 0) + upgrade.xp_delta;
    let newLevel = (skill.level || 1);
    while (newXp >= 100) { newLevel++; newXp -= 100; }
    db.prepare('UPDATE me_skills SET xp = ?, level = ? WHERE id = ? AND user_id = ?')
      .run(newXp, newLevel, skill.id, uid);
    const levelUp = newLevel > (skill.level || 1);
    actions_taken.push(`⚡ ${upgrade.skill_name} +${upgrade.xp_delta} XP${levelUp ? ` → LVL ${newLevel}!` : ''}`);
    skills_upgraded++;
  }

  // ── 5. Respond ─────────────────────────────────────────────────────────────
  res.json({
    mood: parsed.mood || null,
    sleep_logged,
    tasks_completed: completedTaskIds.length,
    habits_completed: completedHabitIds.length,
    journal_saved,
    skills_upgraded,
    actions_taken,
    friendly_response: parsed.friendly_response || 'All logged! Keep it up.',
  });
});

module.exports = router;
