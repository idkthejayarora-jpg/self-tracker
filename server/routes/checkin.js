const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { authMiddleware } = require('../middleware/auth');
const db = require('../db/database');
const { awardPoints } = require('../utils/pointsUtils');
const { updateStreak } = require('../utils/streakUtils');

router.use(authMiddleware);

// Lazy-init so a missing key gives a clear error at call-time, not at startup
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to your Railway environment variables.');
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

router.post('/', async (req, res) => {
  const uid = req.user.id;
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });

  const today = new Date().toISOString().slice(0, 10);

  // ── 1. Gather context for Claude ───────────────────────────────────────────
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

  // ── 2. Build Claude prompt ─────────────────────────────────────────────────
  const tasksList = tasks.length
    ? tasks.map(t => `[${t.id}] "${t.title}" (${t.priority})`).join('\n')
    : '(no pending tasks)';

  const habitsList = habits.length
    ? habits.map(h => `[${h.id}] "${h.name}" — already done today: ${h.done}`).join('\n')
    : '(no habits set up)';

  const systemPrompt = `You are a friendly personal assistant parsing a user's daily check-in message.
Return ONLY valid JSON — absolutely no markdown fences, no prose outside the JSON object.

CONTEXT
-------
Today's date: ${today}

Pending tasks (id + title + priority):
${tasksList}

Habits for today (id + name + already-done status):
${habitsList}

INSTRUCTIONS
------------
Analyse the user's message and extract:
- mood: integer 1–5 based on emotional tone (1=terrible/anxious/depressed, 2=bad/stressed, 3=okay/neutral, 4=good/happy, 5=great/amazing/proud). null if no emotional content.
- journal_entry: a clean version of the full message suitable to save as a journal entry (keep personal details, remove filler, preserve venting/emotional content). Empty string if nothing useful.
- completed_task_ids: array of task IDs the user clearly mentions completing or having done. Use fuzzy/partial matching on task titles (case-insensitive). Empty array if none.
- completed_habit_ids: array of habit IDs the user mentions doing today. Use fuzzy/partial matching on habit names. Empty array if none.
- sleep: object with bedtime (HH:MM 24h), wake_time (HH:MM 24h), quality (1–5), notes. Set any unknown fields to null. Set the whole sleep field to null if sleep is not mentioned at all.
- friendly_response: a warm, human 2–3 sentence summary of what was recorded. Be encouraging. Mention specific things you detected (e.g. "Logged your 7-hour sleep", "Marked 'Morning run' as done"). Keep it short and friendly.`;

  // ── 3. Call Claude ─────────────────────────────────────────────────────────
  let parsed;
  try {
    const anthropic = getClient();
    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: text.trim() }],
    });

    const raw = message.content[0].text.trim();
    // Strip any accidental markdown fences
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    parsed = JSON.parse(clean);
  } catch (err) {
    console.error('[checkin] Claude/parse error:', err.message);
    const msg = err.message?.includes('ANTHROPIC_API_KEY')
      ? 'ANTHROPIC_API_KEY is not configured. Add it in Railway → Variables.'
      : err.message?.includes('401') || err.message?.includes('authentication')
      ? 'Invalid ANTHROPIC_API_KEY. Check the key in Railway → Variables.'
      : `AI parsing failed: ${err.message}`;
    return res.status(502).json({ error: msg });
  }

  const actions_taken = [];

  // ── 4a. Complete tasks ──────────────────────────────────────────────────────
  const completedTaskIds = Array.isArray(parsed.completed_task_ids) ? parsed.completed_task_ids : [];
  for (const tid of completedTaskIds) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(tid, uid);
    if (!task || task.status === 'completed') continue;

    db.prepare(`
      UPDATE tasks SET status='completed', completed_at=? WHERE id = ? AND user_id = ?
    `).run(new Date().toISOString(), tid, uid);

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
      "SELECT 1 FROM points_log WHERE user_id=? AND source='habit' AND source_id=? AND DATE(created_at)=?"
    ).get(uid, hid, today);
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
      "SELECT 1 FROM points_log WHERE user_id=? AND source='sleep' AND DATE(created_at)=?"
    ).get(uid, today);
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
      "SELECT 1 FROM points_log WHERE user_id=? AND source='journal' AND DATE(created_at)=?"
    ).get(uid, today);
    if (!alreadyAwardedJournal) {
      try { awardPoints(uid, 'journal', 'write', 20, null, 'Journal entry'); } catch (_) {}
      try { updateStreak(uid, 'journal'); } catch (_) {}
    }

    journal_saved = true;
    actions_taken.push(`📓 Journal saved${mood ? ` (mood: ${['','😞','😕','😐','🙂','😄'][mood]})` : ''}`);
  }

  // ── 5. Respond ─────────────────────────────────────────────────────────────
  res.json({
    mood: parsed.mood || null,
    sleep_logged,
    tasks_completed: completedTaskIds.length,
    habits_completed: completedHabitIds.length,
    journal_saved,
    actions_taken,
    friendly_response: parsed.friendly_response || 'All logged! Keep it up.',
  });
});

module.exports = router;
