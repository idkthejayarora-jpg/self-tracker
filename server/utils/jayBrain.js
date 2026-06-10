'use strict';
// Jay's brain — a Claude-powered conversational engine that talks like a
// person and quietly fills every sector of the tracker from what you say.
// Falls back to the scripted interview when no ANTHROPIC_API_KEY is set,
// so the app keeps working before the key is configured.

const db = require('../db/database');
const { localDate, SQL_OFF, SQL_NOW, sqlDateOf } = require('./dateUtils');
const { updateStreak, maybeUpdateOverallStreak } = require('./streakUtils');
const { awardPoints, applySkillXP } = require('./pointsUtils');
const {
  computeMissStreak, redemptionFor, activeMomentum, grantMomentum, MISS_THRESHOLD,
} = require('./habitEnforcement');
const { greeting, buildConcerns, generateClosing } = require('./axisInterview');

const MODEL = process.env.JAY_MODEL || 'claude-opus-4-8';

function aiEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Lazy client — only constructed when a key exists
let _client = null;
function getClient() {
  if (!_client) {
    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic();
  }
  return _client;
}

// ── What Jay knows about you before you say a word ───────────────────────────
function buildSnapshot(userId) {
  const today = localDate();
  const user = db.prepare('SELECT username FROM users WHERE id=?').get(userId);
  const profile = db.prepare('SELECT character_name FROM me_profile WHERE user_id=?').get(userId);
  const name = profile?.character_name || user?.username || null;

  const habits = db.prepare('SELECT id, name FROM habits WHERE user_id=? ORDER BY sort_order').all(userId);
  const habitLogs = db.prepare('SELECT habit_id, done FROM habit_logs WHERE user_id=? AND date=?').all(userId, today);
  const doneSet = new Set(habitLogs.filter(l => l.done).map(l => l.habit_id));
  const habitList = habits.map(h => ({ name: h.name, doneToday: doneSet.has(h.id) }));

  const pendingTasks = db.prepare(`
    SELECT title, due_date, priority FROM tasks
    WHERE user_id=? AND status IN ('pending','in_progress')
    ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC LIMIT 8
  `).all(userId);
  const overdue = db.prepare(`
    SELECT COUNT(*) AS n FROM tasks
    WHERE user_id=? AND status NOT IN ('completed','cancelled')
    AND due_date IS NOT NULL AND due_date < date('now', ${SQL_OFF})
  `).get(userId)?.n || 0;

  const lastSleep = db.prepare(
    'SELECT date, duration_minutes, quality FROM sleep_logs WHERE user_id=? ORDER BY date DESC, created_at DESC LIMIT 1'
  ).get(userId);
  const sleptToday = db.prepare(
    'SELECT 1 FROM sleep_logs WHERE user_id=? AND date=? LIMIT 1'
  ).get(userId, today);

  const foodToday = db.prepare(
    'SELECT COUNT(*) AS n, COALESCE(SUM(calories),0) AS cal FROM food_logs WHERE user_id=? AND date=?'
  ).get(userId, today);

  const lastWorkout = db.prepare(
    'SELECT date, name FROM workout_sessions WHERE user_id=? ORDER BY date DESC LIMIT 1'
  ).get(userId);
  const trainedToday = lastWorkout?.date === today;

  const streak = db.prepare(
    "SELECT current_streak FROM streaks WHERE user_id=? AND activity_type='overall'"
  ).get(userId)?.current_streak || 0;

  const lastWeight = db.prepare(
    'SELECT weight_kg, date FROM body_stats WHERE user_id=? AND weight_kg IS NOT NULL ORDER BY date DESC LIMIT 1'
  ).get(userId);

  const detoxApps = db.prepare('SELECT name FROM detox_apps WHERE user_id=?').all(userId).map(a => a.name);
  const journaledToday = !!db.prepare(
    'SELECT 1 FROM journal_entries WHERE user_id=? AND date=?'
  ).get(userId, today);

  const concerns = buildConcerns(userId).map(c => c.question);

  return {
    name, today, habitList, pendingTasks, overdue, lastSleep, sleptToday: !!sleptToday,
    foodToday, lastWorkout, trainedToday, streak, lastWeight, detoxApps,
    journaledToday, concerns,
  };
}

// ── The extraction sheet Claude maintains every turn ──────────────────────────
// Structured-output schema: every object closed (additionalProperties: false),
// no numeric min/max (unsupported), enums where values are fixed.
const SHEET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    journal: {
      type: 'object', additionalProperties: false,
      properties: {
        mood: { type: 'integer', enum: [1, 2, 3, 4, 5] },
        text: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['mood', 'text'],
    },
    sleep: {
      type: 'object', additionalProperties: false,
      properties: {
        duration_minutes: { type: 'integer' },
        quality: { type: 'integer', enum: [1, 2, 3, 4, 5] },
        bedtime: { type: 'string' },
        wake_time: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['duration_minutes'],
    },
    meals: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
          name: { type: 'string' },
          calories: { type: 'integer' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
        },
        required: ['meal_type', 'name', 'calories'],
      },
    },
    workout: {
      type: 'object', additionalProperties: false,
      properties: {
        name: { type: 'string' },
        notes: { type: 'string' },
        cardio_minutes: { type: 'integer' },
        exercises: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              name: { type: 'string' },
              sets: { type: 'integer' },
              reps: { type: 'integer' },
              weight_kg: { type: 'number' },
            },
            required: ['name', 'sets', 'reps'],
          },
        },
      },
      required: ['name'],
    },
    habits_done: { type: 'array', items: { type: 'string' } },
    tasks_done: { type: 'array', items: { type: 'string' } },
    tasks_add: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string' },
          due_date: { type: 'string', format: 'date' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        },
        required: ['title'],
      },
    },
    body: {
      type: 'object', additionalProperties: false,
      properties: {
        weight_kg: { type: 'number' },
        body_fat_pct: { type: 'number' },
      },
      required: [],
    },
    finance: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['income', 'expense'] },
          amount: { type: 'number' },
          category: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['type', 'amount'],
      },
    },
    detox: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          app: { type: 'string' },
          status: { type: 'string', enum: ['clean', 'slipped'] },
          minutes_used: { type: 'integer' },
        },
        required: ['app', 'status'],
      },
    },
    content_ideas: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string' },
          content_type: { type: 'string', enum: ['reel', 'post', 'carousel', 'story'] },
        },
        required: ['title'],
      },
    },
    reminders: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string' },
          remind_at: { type: 'string' },
        },
        required: ['title', 'remind_at'],
      },
    },
  },
  required: [],
};

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    done: { type: 'boolean' },
    sheet: SHEET_SCHEMA,
  },
  required: ['reply', 'done', 'sheet'],
};

function systemPrompt(snap) {
  const habitNames = snap.habitList.map(h => `"${h.name}"${h.doneToday ? ' (already ticked today)' : ''}`).join(', ') || 'none set up';
  const taskLines = snap.pendingTasks.map(t => `"${t.title}"${t.due_date ? ` (due ${t.due_date})` : ''}`).join(', ') || 'none';
  const detoxLine = snap.detoxApps.join(', ') || 'none tracked';

  return `You are Jay — not an assistant, a close friend who checks in on ${snap.name || 'your friend'} every day and keeps their life tracker filled in so they never have to touch a form.

HOW YOU TALK (this matters more than anything):
- Spoken English, the way a real friend talks on a call. Contractions always. Fragments are fine.
- 1–2 short sentences per turn. Never more. You're having a conversation, not writing.
- React to the SPECIFIC thing they just said before moving on — pick up the detail ("Five hours? No wonder."), don't give generic acknowledgments.
- One question at a time. Let the conversation flow from what they say instead of marching through a checklist.
- Mirror their energy: if they're flat, be gentle; if they're up, match it.
- Never say you're an AI, never mention "logging", "fields", "the system" or "data". You just remember things.
- No lists, no bullet points, no emoji, no asterisks. Plain spoken words only.
- It's okay to be lightly funny or call them out like a friend would ("You said that yesterday too.").

WHAT YOU'RE QUIETLY DOING:
While you talk, you maintain the "sheet" — everything they've told you about today, structured. Every turn, return the COMPLETE updated sheet (latest state, not a diff). If they correct themselves ("actually it was 6 hours"), the sheet reflects the correction.
- sleep: convert "slept about 7 hours" → duration_minutes 420. Bedtime/wake like "23:30"/"07:00" if mentioned.
- meals: anything they ate. Estimate realistic calories/macros yourself (Indian foods included — roti ~100 cal, dal katori ~150, etc.). Guess the meal_type from context/time.
- workout: name it ("Push day", "Run"), with exercises/sets/reps/weight if given, cardio_minutes if cardio.
- habits_done: ONLY exact names from their habit list that they say they did today.
- tasks_done: ONLY titles from their pending list they say they finished. tasks_add: new commitments they make ("I'll call the bank tomorrow" → task with due date).
- journal: ghost-write their diary entry in FIRST PERSON, in their voice, from everything they've shared — honest, plain, 3-6 sentences. Update it every turn as you learn more. Always include journal once they've shared anything real. mood: read it from them (1 rough – 5 great).
- body.weight_kg if they mention weight. finance entries if they mention spending/earning. detox if they mention scrolling/app time (only apps from their list). content_ideas if they mention an idea for a reel/post. reminders only if they ask to be reminded ("remind_at" as "YYYY-MM-DD HH:MM").
- Leave out anything they haven't talked about. Never invent.

WHAT YOU KNOW GOING IN (today is ${snap.today}):
- Their habits: ${habitNames}.
- Pending tasks: ${taskLines}. Overdue count: ${snap.overdue}.
- Sleep: ${snap.sleptToday ? 'already logged today' : (snap.lastSleep ? `last logged ${snap.lastSleep.date} (${Math.round((snap.lastSleep.duration_minutes || 0) / 60 * 10) / 10}h)` : 'never logged')}.
- Food today: ${snap.foodToday.n} items (${snap.foodToday.cal} cal so far). Training: ${snap.trainedToday ? 'trained today' : (snap.lastWorkout ? `last on ${snap.lastWorkout.date}` : 'no sessions yet')}.
- Overall streak: ${snap.streak} days. ${snap.lastWeight ? `Weight last logged ${snap.lastWeight.weight_kg}kg on ${snap.lastWeight.date}.` : ''}
- Detox apps they track: ${detoxLine}.
${snap.concerns.length ? `- Things a good friend would bring up naturally at the right moment (rephrase in your own words, max one per turn):\n${snap.concerns.map(c => `  • ${c}`).join('\n')}` : ''}

ARC OF THE CONVERSATION:
Cover the day naturally — how they're doing, sleep, food, training/movement, what got done, what's on their mind. Don't interrogate; let one answer lead to the next topic. If they go off-script (vent about something, share a win), follow them — that's the good stuff, it goes in the journal.
After you've covered most of the day (usually 5–8 exchanges), wrap up like a friend signing off: one genuine observation about their day, maybe one small nudge for tomorrow. On that closing turn set done=true. If they say they're done ("that's it", "gotta go"), close immediately — warm, quick, done=true.

Return JSON: { reply, done, sheet }. The reply is ONLY your spoken words.`;
}

// ── Claude-powered turn ───────────────────────────────────────────────────────
async function converseAI(userId, transcript) {
  const snap = buildSnapshot(userId);
  const client = getClient();

  // Map transcript → API messages. First message must be role:user, so if the
  // conversation opens with Jay's greeting, prepend a synthetic user turn.
  const messages = transcript.map(t => ({
    role: t.role === 'user' ? 'user' : 'assistant',
    content: t.text,
  }));
  if (!messages.length || messages[0].role !== 'user') {
    messages.unshift({ role: 'user', content: '(I just opened the app.)' });
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: systemPrompt(snap),
    messages,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
  });

  const textBlock = response.content.find(b => b.type === 'text');
  const parsed = JSON.parse(textBlock.text);
  return {
    reply: parsed.reply,
    done: !!parsed.done,
    sheet: parsed.sheet || {},
    ai: true,
  };
}

// ── Scripted fallback (no API key) ────────────────────────────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function reactToScripted(answer) {
  const a = (answer || '').toLowerCase();
  if (/(tired|exhausted|drained|sleepy)/.test(a)) return pick(["Yeah… I can hear it in you.", "Sounds like you're running on fumes."]);
  if (/(stress|anxious|overwhelm|pressure)/.test(a)) return pick(["That's a lot to carry.", "Okay. Heavy one."]);
  if (/(great|good|amazing|productive|proud|won|crushed)/.test(a)) return pick(["Hey — that's good. Genuinely.", "Love that."]);
  if (/(failed|missed|skipped|lazy|didn't|couldn't)/.test(a)) return pick(["Happens. Nobody's keeping score here.", "Alright — no lecture from me."]);
  if (a.split(' ').length <= 3) return pick(["Mm.", "Okay.", "Right."]);
  return pick(["Got it.", "Okay, I'm with you.", "Makes sense."]);
}

const SCRIPTED_QUESTIONS = [
  ["How did you sleep last night — roughly how many hours?", "First things first — how was your sleep?"],
  ["What did the day actually look like? Walk me through it.", "So how did today go, really?"],
  ["What did you eat today? Just tell me roughly.", "Food today — what went in?"],
  ["Did you move your body at all — gym, walk, anything?", "Any training today?"],
  ["And how are you feeling right now, honestly?", "Where's your head at tonight, one to five?"],
];

function extractScripted(transcript) {
  const userTexts = transcript.filter(t => t.role === 'user').map(t => t.text);
  const blob = userTexts.join(' ').toLowerCase();
  const sheet = {};

  const sleepMatch = blob.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)/);
  if (sleepMatch) {
    const hrs = parseFloat(sleepMatch[1]);
    if (hrs > 0 && hrs <= 16) sheet.sleep = { duration_minutes: Math.round(hrs * 60) };
  }

  let mood = 3;
  if (/(terrible|awful|horrible|worst|depress)/.test(blob)) mood = 1;
  else if (/(rough|bad|tired|low|stress|exhaust)/.test(blob)) mood = 2;
  else if (/(great|amazing|fantastic|brilliant|best)/.test(blob)) mood = 5;
  else if (/(good|nice|productive|happy|solid)/.test(blob)) mood = 4;

  if (userTexts.length) {
    sheet.journal = {
      mood,
      text: userTexts.filter(t => t.length > 12).join(' '),
      tags: ['debrief'],
    };
  }
  return sheet;
}

function converseScripted(userId, transcript) {
  const userTurns = transcript.filter(t => t.role === 'user' && !/^\(/.test(t.text));
  const lastAnswer = userTurns.length ? userTurns[userTurns.length - 1].text : '';
  const concerns = buildConcerns(userId).map(c => c.question);
  const questions = [...SCRIPTED_QUESTIONS.map(q => pick(q)), ...concerns];
  const idx = userTurns.length; // next question index

  const sheet = extractScripted(transcript);

  if (idx >= questions.length || /\b(that's it|im done|i'm done|gotta go|bye|goodnight)\b/i.test(lastAnswer)) {
    const closing = generateClosing(userId, userTurns.map(t => ({ a: t.text })));
    return { reply: closing, done: true, sheet, ai: false };
  }

  const ack = idx > 0 ? reactToScripted(lastAnswer) + ' ' : '';
  const bridge = idx > 0 ? pick(['So — ', 'Okay, ', 'Next thing — ', '']) : '';
  return { reply: `${ack}${bridge}${questions[idx]}`, done: false, sheet, ai: false };
}

async function converse(userId, transcript) {
  if (aiEnabled()) {
    try {
      return await converseAI(userId, transcript);
    } catch (e) {
      console.error('[jay] Claude call failed, falling back to scripted:', e.message);
      return converseScripted(userId, transcript);
    }
  }
  return converseScripted(userId, transcript);
}

// ── Commit: write the sheet into every sector, mirroring each route exactly ──
function commitSheet(userId, sheet) {
  const today = localDate();
  const filled = [];
  if (!sheet || typeof sheet !== 'object') return filled;

  // Journal — upsert one entry per day (journal.js PUT /:date)
  if (sheet.journal?.text) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO journal_entries (user_id, date, content, mood, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        content = excluded.content, mood = excluded.mood,
        tags = excluded.tags, updated_at = excluded.updated_at
    `).run(userId, today, sheet.journal.text, sheet.journal.mood || null,
           JSON.stringify(sheet.journal.tags || ['jay']), now, now);
    updateStreak(userId, 'journal');
    maybeUpdateOverallStreak(userId);
    const got = db.prepare(
      `SELECT 1 FROM points_log WHERE user_id=? AND source='journal' AND ${sqlDateOf('created_at')}=${SQL_NOW}`
    ).get(userId);
    if (!got) {
      awardPoints(userId, 'journal', 'write', 20, null, today);
      applySkillXP(userId, 'journal', ['mental', 'reflection', 'mindfulness', 'writing']);
    }
    filled.push('Journal written');
  }

  // Sleep — insert (sleep.js POST), skip exact duplicate for the day
  if (sheet.sleep?.duration_minutes) {
    const dup = db.prepare(
      'SELECT 1 FROM sleep_logs WHERE user_id=? AND date=? AND duration_minutes=? LIMIT 1'
    ).get(userId, today, sheet.sleep.duration_minutes);
    if (!dup) {
      db.prepare(`
        INSERT INTO sleep_logs (user_id, date, bedtime, wake_time, duration_minutes, quality, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, today, sheet.sleep.bedtime ?? null, sheet.sleep.wake_time ?? null,
             sheet.sleep.duration_minutes, sheet.sleep.quality ?? null, sheet.sleep.notes ?? null);
      updateStreak(userId, 'sleep');
      const got = db.prepare(
        `SELECT 1 FROM points_log WHERE user_id=? AND source='sleep' AND ${sqlDateOf('created_at')}=${SQL_NOW}`
      ).get(userId);
      if (!got) {
        awardPoints(userId, 'sleep', 'log', 15, null, today);
        applySkillXP(userId, 'sleep', ['recovery', 'health', 'vitality', 'sleep']);
      }
      const h = Math.round(sheet.sleep.duration_minutes / 60 * 10) / 10;
      filled.push(`Sleep logged — ${h}h`);
    }
  }

  // Meals — insert each (diet.js POST /log)
  if (Array.isArray(sheet.meals) && sheet.meals.length) {
    let n = 0;
    for (const m of sheet.meals.slice(0, 12)) {
      if (!m?.name) continue;
      const dup = db.prepare(
        'SELECT 1 FROM food_logs WHERE user_id=? AND date=? AND LOWER(name)=LOWER(?) AND meal_type=? LIMIT 1'
      ).get(userId, today, m.name.trim(), m.meal_type || 'snack');
      if (dup) continue;
      const r = db.prepare(`
        INSERT INTO food_logs (user_id, date, meal_type, name, calories, protein_g, carbs_g, fat_g)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, today, m.meal_type || 'snack', m.name.trim(),
             m.calories || 0, m.protein_g || 0, m.carbs_g || 0, m.fat_g || 0);
      awardPoints(userId, 'diet', 'log_food', 5, r.lastInsertRowid, m.name.trim());
      n++;
    }
    if (n) {
      applySkillXP(userId, 'diet', ['nutrition', 'health', 'diet']);
      filled.push(`${n} meal${n > 1 ? 's' : ''} logged`);
    }
  }

  // Workout — session + sets (workout.js quick-log), skip if same-named session exists today
  if (sheet.workout?.name) {
    const dup = db.prepare(
      'SELECT 1 FROM workout_sessions WHERE user_id=? AND date=? AND name=? LIMIT 1'
    ).get(userId, today, sheet.workout.name);
    if (!dup) {
      const sr = db.prepare(
        'INSERT INTO workout_sessions (user_id, date, name, notes) VALUES (?, ?, ?, ?)'
      ).run(userId, today, sheet.workout.name, sheet.workout.notes ?? null);
      const sessionId = sr.lastInsertRowid;
      updateStreak(userId, 'workout');
      awardPoints(userId, 'workout', 'session', 30, sessionId, sheet.workout.name);
      applySkillXP(userId, 'workout',
        ['workout', 'strength', 'fitness', sheet.workout.name, ...(sheet.workout.exercises || []).map(e => e.name)]);

      let sortOrder = 0;
      for (const ex of (sheet.workout.exercises || []).slice(0, 15)) {
        if (!ex?.name) continue;
        let exRow = db.prepare(
          'SELECT id FROM exercises WHERE user_id=? AND LOWER(name)=LOWER(?)'
        ).get(userId, ex.name);
        if (!exRow) {
          const nr = db.prepare('INSERT INTO exercises (user_id, name) VALUES (?, ?)').run(userId, ex.name);
          exRow = { id: nr.lastInsertRowid };
        }
        const setCount = Math.min(ex.sets || 1, 10);
        for (let i = 0; i < setCount; i++) {
          db.prepare(
            'INSERT INTO workout_sets (session_id, exercise_id, reps, weight, sort_order) VALUES (?, ?, ?, ?, ?)'
          ).run(sessionId, exRow.id, ex.reps || null, ex.weight_kg || null, sortOrder++);
        }
      }
      filled.push(`Workout logged — ${sheet.workout.name}`);
    }
  }

  // Habits — match by name, upsert + points + redemption (habits.js PUT /log)
  if (Array.isArray(sheet.habits_done) && sheet.habits_done.length) {
    const habits = db.prepare('SELECT * FROM habits WHERE user_id=?').all(userId);
    let n = 0;
    for (const wanted of sheet.habits_done) {
      const habit = habits.find(h =>
        h.name.toLowerCase() === wanted.toLowerCase() ||
        h.name.toLowerCase().includes(wanted.toLowerCase()) ||
        wanted.toLowerCase().includes(h.name.toLowerCase()));
      if (!habit) continue;

      const already = db.prepare(
        'SELECT done FROM habit_logs WHERE user_id=? AND habit_id=? AND date=?'
      ).get(userId, habit.id, today);
      if (already?.done) continue;

      const missBefore = computeMissStreak(userId, habit);
      const momentum = activeMomentum(userId);
      const basePts = momentum ? Math.round(10 * momentum.multiplier) : 10;

      db.prepare(`
        INSERT INTO habit_logs (user_id, habit_id, date, done, note)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(user_id, habit_id, date) DO UPDATE SET done = 1, note = excluded.note
      `).run(userId, habit.id, today, 'via Jay');

      const got = db.prepare(
        `SELECT 1 FROM points_log WHERE user_id=? AND source='habit' AND source_id=? AND ${sqlDateOf('created_at')}=${SQL_NOW}`
      ).get(userId, habit.id);
      if (!got) {
        awardPoints(userId, 'habit', 'complete', basePts, habit.id, habit.name);
        applySkillXP(userId, 'habit', ['discipline', habit.category, habit.name]);
      }

      if (missBefore >= MISS_THRESHOLD) {
        const alreadyRedeemed = db.prepare(
          `SELECT 1 FROM habit_penalties WHERE user_id=? AND habit_id=? AND date=? AND kind='redemption' LIMIT 1`
        ).get(userId, habit.id, today);
        if (!alreadyRedeemed) {
          const bonus = redemptionFor(missBefore);
          try {
            db.prepare(`
              INSERT INTO habit_penalties (user_id, habit_id, date, kind, miss_streak, points)
              VALUES (?, ?, ?, 'redemption', ?, ?)
            `).run(userId, habit.id, today, missBefore, bonus);
            awardPoints(userId, 'habit_penalty', 'redemption', bonus, habit.id, habit.name);
            grantMomentum(userId);
          } catch (e) {
            if (!/UNIQUE/i.test(e.message)) console.error('[jay] redemption:', e.message);
          }
        }
      }
      n++;
    }
    if (n) filled.push(`${n} habit${n > 1 ? 's' : ''} ticked`);
  }

  // Tasks completed — fuzzy match pending titles (tasks.js PATCH completion path)
  if (Array.isArray(sheet.tasks_done) && sheet.tasks_done.length) {
    const pending = db.prepare(
      "SELECT * FROM tasks WHERE user_id=? AND status IN ('pending','in_progress')"
    ).all(userId);
    let n = 0;
    for (const wanted of sheet.tasks_done) {
      const task = pending.find(t =>
        t.title.toLowerCase() === wanted.toLowerCase() ||
        t.title.toLowerCase().includes(wanted.toLowerCase()) ||
        wanted.toLowerCase().includes(t.title.toLowerCase()));
      if (!task || task._done) continue;
      task._done = true;

      db.prepare(
        "UPDATE tasks SET status='completed', completed_at=? WHERE id=?"
      ).run(new Date().toISOString(), task.id);
      updateStreak(userId, 'tasks');
      maybeUpdateOverallStreak(userId);
      const pointsForPriority = { urgent: 50, high: 30, medium: 20, low: 10 };
      awardPoints(userId, 'task', 'complete', pointsForPriority[task.priority] || 20, task.id, task.title);
      applySkillXP(userId, 'task', [task.title, 'focus', 'discipline']);
      n++;
    }
    if (n) filled.push(`${n} task${n > 1 ? 's' : ''} completed`);
  }

  // New tasks (tasks.js POST)
  if (Array.isArray(sheet.tasks_add) && sheet.tasks_add.length) {
    let n = 0;
    for (const t of sheet.tasks_add.slice(0, 8)) {
      if (!t?.title) continue;
      const dup = db.prepare(
        "SELECT 1 FROM tasks WHERE user_id=? AND LOWER(title)=LOWER(?) AND status IN ('pending','in_progress') LIMIT 1"
      ).get(userId, t.title.trim());
      if (dup) continue;
      db.prepare(`
        INSERT INTO tasks (user_id, title, due_date, priority, tags)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, t.title.trim(), t.due_date || null, t.priority || 'medium', JSON.stringify(['jay']));
      n++;
    }
    if (n) filled.push(`${n} task${n > 1 ? 's' : ''} added`);
  }

  // Body stats — upsert (body.js POST)
  if (sheet.body?.weight_kg || sheet.body?.body_fat_pct) {
    db.prepare(`
      INSERT INTO body_stats (user_id, date, weight_kg, body_fat_pct)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        weight_kg = COALESCE(excluded.weight_kg, weight_kg),
        body_fat_pct = COALESCE(excluded.body_fat_pct, body_fat_pct)
    `).run(userId, today, sheet.body.weight_kg ?? null, sheet.body.body_fat_pct ?? null);
    const got = db.prepare(
      `SELECT 1 FROM points_log WHERE user_id=? AND source='body' AND ${sqlDateOf('created_at')}=${SQL_NOW}`
    ).get(userId);
    if (!got) {
      awardPoints(userId, 'body', 'log_stats', 10, null, today);
      applySkillXP(userId, 'body', ['health', 'body', 'fitness', 'tracking']);
    }
    filled.push(sheet.body.weight_kg ? `Weight logged — ${sheet.body.weight_kg}kg` : 'Body stats logged');
  }

  // Finance entries (finance.js POST /entries)
  if (Array.isArray(sheet.finance) && sheet.finance.length) {
    let n = 0;
    for (const f of sheet.finance.slice(0, 8)) {
      if (!f?.type || !f?.amount) continue;
      db.prepare(
        'INSERT INTO finance_entries (user_id, date, type, category, amount, note) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(userId, today, f.type, f.category || 'other', f.amount, f.note || 'via Jay');
      n++;
    }
    if (n) filled.push(`${n} money entr${n > 1 ? 'ies' : 'y'} logged`);
  }

  // Detox — match app by name, upsert (detox.js PUT /log)
  if (Array.isArray(sheet.detox) && sheet.detox.length) {
    const apps = db.prepare('SELECT * FROM detox_apps WHERE user_id=?').all(userId);
    let n = 0;
    for (const d of sheet.detox) {
      const app = apps.find(a =>
        a.name.toLowerCase() === (d.app || '').toLowerCase() ||
        a.name.toLowerCase().includes((d.app || '').toLowerCase()));
      if (!app) continue;
      db.prepare(`
        INSERT INTO detox_logs (user_id, app_id, date, status, minutes_used, note)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(user_id,app_id,date) DO UPDATE SET status=excluded.status, minutes_used=excluded.minutes_used, note=excluded.note
      `).run(userId, app.id, today, d.status || 'logged', d.minutes_used || 0, 'via Jay');
      n++;
    }
    if (n) filled.push(`Screen time noted (${n} app${n > 1 ? 's' : ''})`);
  }

  // Content ideas (content.js POST /ideas)
  if (Array.isArray(sheet.content_ideas) && sheet.content_ideas.length) {
    let n = 0;
    for (const c of sheet.content_ideas.slice(0, 5)) {
      if (!c?.title) continue;
      const dup = db.prepare(
        'SELECT 1 FROM content_ideas WHERE user_id=? AND LOWER(title)=LOWER(?) LIMIT 1'
      ).get(userId, c.title.trim());
      if (dup) continue;
      db.prepare(
        "INSERT INTO content_ideas (user_id, title, content_type, status, notes) VALUES (?, ?, ?, 'idea', 'via Jay')"
      ).run(userId, c.title.trim(), c.content_type || 'reel');
      n++;
    }
    if (n) filled.push(`${n} content idea${n > 1 ? 's' : ''} saved`);
  }

  // Reminders (reminders table)
  if (Array.isArray(sheet.reminders) && sheet.reminders.length) {
    let n = 0;
    for (const r of sheet.reminders.slice(0, 5)) {
      if (!r?.title || !r?.remind_at) continue;
      const when = new Date(r.remind_at.replace(' ', 'T'));
      if (isNaN(when.getTime())) continue;
      db.prepare(
        'INSERT INTO reminders (user_id, title, remind_at) VALUES (?, ?, ?)'
      ).run(userId, r.title.trim(), when.toISOString());
      n++;
    }
    if (n) filled.push(`${n} reminder${n > 1 ? 's' : ''} set`);
  }

  return filled;
}

module.exports = { aiEnabled, converse, commitSheet, buildSnapshot, greeting };
