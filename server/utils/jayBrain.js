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
const { parseDietText } = require('./dietParser');
const { parseWorkoutText } = require('./workoutParser');
const INDIAN_FOODS = require('./indianFoods');

const MODEL = process.env.JAY_MODEL || 'claude-opus-4-8';

function aiEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ElevenLabs human voice — active when a key is set. With the v3 model the
// brain also writes delivery tags ([sighs], [exhales]) into his replies.
function humanVoiceEnabled() {
  return !!process.env.ELEVENLABS_API_KEY;
}
function voiceTagsEnabled() {
  return humanVoiceEnabled() && /v3/.test(process.env.ELEVENLABS_MODEL || '');
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
- CAPTURE AGGRESSIVELY: if one answer touches five sectors, the sheet gains five sections that same turn. A passing mention ("grabbed a samosa on the way") is enough — capture on first mention, correct later if they revise. An empty sheet section after they talked about that topic is a failure.
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

${voiceTagsEnabled() ? `
DELIVERY TAGS:
Your reply is spoken by a voice engine that understands bracketed delivery tags. Use them SPARSELY — at most one per reply, only where a real person would actually do it: [sighs], [exhales], [laughs softly], [pauses]. Tags go only in the reply, never in the journal or anywhere in the sheet.
` : ''}
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
// Not a dumb question list: the plan is built from what's actually missing
// today, answers run through the real diet/workout parsers, and Jay
// acknowledges the specific thing you said before moving on.
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const r1 = (n) => Math.round(n * 10) / 10;
const joinAnd = (xs) => xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

function reactToScripted(answer) {
  const a = (answer || '').toLowerCase();
  if (/(tired|exhausted|drained|sleepy)/.test(a)) return pick(["Yeah… I can hear it in you.", "Sounds like you're running on fumes."]);
  if (/(stress|anxious|overwhelm|pressure)/.test(a)) return pick(["That's a lot to carry.", "Okay. Heavy one."]);
  if (/(great|good|amazing|productive|proud|won|crushed)/.test(a)) return pick(["Hey — that's good. Genuinely.", "Love that."]);
  if (/(failed|missed|skipped|lazy|didn't|couldn't)/.test(a)) return pick(["Happens. Nobody's keeping score here.", "Alright — no lecture from me."]);
  if (a.split(' ').length <= 3) return pick(["Mm.", "Okay.", "Right."]);
  return pick(["Got it.", "Okay, I'm with you.", "Makes sense."]);
}

// Which topic was Jay's last question about? Phrasing varies, keywords don't.
// Classified on the question tail (last two sentences) — the leading ack
// references the PREVIOUS topic ("That's 1 ticked. Still on your plate…")
// and was poisoning the match.
function topicOf(q) {
  const sentences = (q || '').split(/(?<=[.!?])\s+/);
  const s = sentences.slice(-2).join(' ').toLowerCase();
  if (/task|plate|pending|overdue|deadline|dodging|move today|any of those move|died today/.test(s)) return 'tasks';
  if (/habit|which of (those|these)|honesty round|your list|what got done/.test(s)) return 'habits';
  if (/sleep|slept|rested|crash/.test(s)) return 'sleep';
  if (/eat|food|meal|breakfast|lunch|dinner|calorie/.test(s)) return 'food';
  if (/train|gym|workout|exercise|moved? your body|rest day|\brun\b|calling (it|today) rest/.test(s)) return 'training';
  if (/head at|how are you (actually )?feeling|mood|heavier|underneath/.test(s)) return 'mood';
  return 'day';
}

// Scan a free-text chunk for EVERY distinct Indian-food hit (a chunk like
// "poha and 2 rotis with dal" should yield three foods, not one best match).
// A food counts when one of its name/keyword tokens appears as a whole word;
// a digit right before the token becomes the quantity.
function scanFoods(raw) {
  const text = String(raw).toLowerCase();
  const hits = [];
  const claimed = new Set(); // each text token feeds at most one dish
  for (const f of INDIAN_FOODS) {
    const tokens = [
      ...f.name.toLowerCase().split(/\s+/),
      ...(f.keywords || []).map(k => k.toLowerCase()),
    ]
      .map(t => t.replace(/[^a-z0-9]/g, ''))
      .filter(t => t.length >= 3);
    for (const t of tokens) {
      if (claimed.has(t)) continue;
      const m = text.match(new RegExp(`(?:(\\d+(?:\\.\\d+)?)\\s+)?\\b${t}s?\\b`));
      if (!m) continue;
      claimed.add(t);
      const mul = Math.min(m[1] ? parseFloat(m[1]) : 1, 6);
      hits.push({ food: f, mul });
      break;
    }
    if (hits.length >= 6) break;
  }
  // dedupe by food name (different tokens can hit the same dish)
  const seen = new Set();
  return hits.filter(h => {
    if (seen.has(h.food.name)) return false;
    seen.add(h.food.name);
    return true;
  });
}

function parseFoodNarrative(userId, text) {
  let entries = [], unmatched = [];
  try { ({ entries, unmatched } = parseDietText(text, userId)); } catch (_) { /* parser is best-effort */ }
  // Saved-meal matches come back with macros — keep those as-is
  const meals = entries.filter(e => e?.name && (e.calories || 0) > 0).map(e => ({
    meal_type: e.meal_type || 'snack', name: e.name,
    calories: e.calories || 0, protein_g: e.protein_g || 0, carbs_g: e.carbs_g || 0, fat_g: e.fat_g || 0,
  }));
  // Everything else: resolve against the Indian foods DB; unknowns are dropped
  // rather than logged as junk — basic mode stays conservative.
  const leftovers = [
    ...entries.filter(e => e?.name && !(e.calories > 0)).map(e => ({ name: e.name, mealType: e.meal_type })),
    ...(unmatched || []).map(u => typeof u === 'string' ? { name: u, mealType: 'snack' } : u),
  ];
  const already = new Set(meals.map(m => m.name.toLowerCase()));
  for (const item of leftovers) {
    if (!item?.name || item.name.length < 3) continue;
    for (const hit of scanFoods(item.name)) {
      if (already.has(hit.food.name.toLowerCase())) continue;
      already.add(hit.food.name.toLowerCase());
      meals.push({
        meal_type: item.mealType || 'snack', name: hit.food.name,
        calories: Math.round((hit.food.calories || 0) * hit.mul),
        protein_g: r1((hit.food.protein_g || 0) * hit.mul),
        carbs_g: r1((hit.food.carbs_g || 0) * hit.mul),
        fat_g: r1((hit.food.fat_g || 0) * hit.mul),
      });
    }
  }
  return meals.slice(0, 10);
}

// Split an answer into clauses and keep only the ones that smell like the
// target topic — feeding a whole mixed sentence into a narrative parser is
// how "push day bench press" ends up logged as breakfast.
function clausesAbout(answer, signalRe) {
  return answer
    .split(/(?<=[.!?;])\s+|\s+—\s+|,\s*(?=and\b|then\b|also\b)/i)
    .filter(c => signalRe.test(c))
    .join('. ');
}
const FOOD_SIGNAL = /\b(ate|eat|had|food|meal|breakfast|lunch|dinner|snack|roti|rice|dal|paratha|poha|eggs?|shake|chai|coffee|salad|chicken|paneer|biryani|dosa|idli|fruit|milk|curd|dahi)\b/i;
const TRAIN_SIGNAL = /\b(gym|workout|trained|training|push day|pull day|leg day|chest|back day|lifted|bench|squat|deadlift|curl|press|ran|running|jog|walk(ed)?|yoga|cardio|sets?|reps?)\b/i;

const NEG_RE = /^\s*(no\b|nah|nope|didn'?t|did not|nothing|none|skipped|rest day)/i;

// Pull structured facts out of one answer, in the context of what was asked.
// Mutates `sheet`, returns what this answer contributed (drives the ack).
function extractFromAnswer(userId, topic, answer, snap, sheet) {
  const a = answer.toLowerCase();
  const negative = NEG_RE.test(answer);
  const found = { topic, negative };

  // Sleep — explicit mention anywhere; bare number accepted when asked directly
  let m = a.match(/slept[^.!?]*?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)?/)
       || a.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)[^.!?]{0,30}sleep/);
  if (!m && topic === 'sleep' && !negative) {
    m = a.match(/^\D{0,12}(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)?\D{0,16}$/);
  }
  if (m) {
    const hrs = parseFloat(m[1]);
    if (hrs > 2 && hrs <= 16) {
      sheet.sleep = { ...(sheet.sleep || {}), duration_minutes: Math.round(hrs * 60) };
      found.sleepHours = hrs;
    }
  }
  if (topic === 'sleep' && sheet.sleep && !sheet.sleep.quality) {
    if (/(deep|amazing|great|solid|like a baby)/.test(a)) sheet.sleep.quality = 5;
    else if (/(fine|okay|decent|alright)/.test(a)) sheet.sleep.quality = 3;
    else if (/(broken|restless|rough|bad|kept waking)/.test(a)) sheet.sleep.quality = 2;
    else if (/(terrible|barely|awful)/.test(a)) sheet.sleep.quality = 1;
  }

  // Food — when asked, or when the day-overview clearly mentions eating.
  // Only the food-flavored clauses reach the parser.
  if (!negative && (topic === 'food' || (topic === 'day' && FOOD_SIGNAL.test(a)))) {
    const foodText = topic === 'food' ? answer : clausesAbout(answer, FOOD_SIGNAL);
    const meals = foodText ? parseFoodNarrative(userId, foodText) : [];
    if (meals.length) {
      sheet.meals = [...(sheet.meals || []), ...meals].slice(0, 12);
      found.meals = meals;
    }
  }

  // Training — when asked, or when the day-overview clearly mentions it.
  // Parser junk is filtered out: an "exercise" with no sets, reps or weight
  // is the parser hallucinating on a non-training clause.
  if ((topic === 'training' && !negative) || (topic === 'day' && TRAIN_SIGNAL.test(a))) {
    const trainText = topic === 'training' ? answer : clausesAbout(answer, TRAIN_SIGNAL);
    let p = { dayName: null, exercises: [], cardioMinutes: 0 };
    try { if (trainText) p = parseWorkoutText(trainText, userId); } catch (_) { /* best-effort */ }
    const realExercises = (p.exercises || []).filter(e =>
      (e.sets || 0) > 1 || parseInt(e.reps) > 0 || e.weight);
    if (realExercises.length || p.cardioMinutes || TRAIN_SIGNAL.test(a)) {
      sheet.workout = {
        name: p.dayName || (/(ran|running|jog)/.test(a) ? 'Run' : /walk/.test(a) ? 'Walk' : 'Workout'),
        notes: (trainText || answer).slice(0, 200),
        ...(p.cardioMinutes ? { cardio_minutes: p.cardioMinutes } : {}),
        exercises: realExercises.slice(0, 12).map(e => ({
          name: e.name, sets: e.sets || 1, reps: parseInt(e.reps) || 0,
          ...(e.weight ? { weight_kg: e.weight } : {}),
        })),
      };
      found.workout = sheet.workout;
    }
  }

  // Habits — question-gated for precision; matches their real habit names
  if (topic === 'habits' && !negative) {
    const done = [];
    const all = /\b(all of (them|those)|everything|every one)\b/.test(a);
    for (const h of snap.habitList) {
      if (h.doneToday) continue;
      const nm = h.name.toLowerCase();
      const firstWord = nm.split(/\s+/)[0];
      const mentioned = all || a.includes(nm) || nm.split(/\s+/).some(w => w.length > 3 && a.includes(w));
      if (!mentioned) continue;
      if (!all) {
        const at = a.indexOf(firstWord);
        const before = a.slice(Math.max(0, at - 24), at);
        if (/(didn'?t|not|skip|miss|except|but no)/.test(before)) continue;
      }
      done.push(h.name);
    }
    if (done.length) {
      sheet.habits_done = [...new Set([...(sheet.habits_done || []), ...done])];
      found.habits = done;
    }
  }

  // Tasks — match pending titles by significant-word overlap
  if (topic === 'tasks' && !negative) {
    const matched = [];
    for (const t of snap.pendingTasks) {
      const toks = t.title.toLowerCase().split(/\W+/).filter(w => w.length > 3);
      if (!toks.length) continue;
      const hits = toks.filter(w => a.includes(w)).length;
      if (hits >= Math.max(1, Math.ceil(toks.length / 2))) matched.push(t.title);
    }
    if (matched.length) {
      sheet.tasks_done = [...new Set([...(sheet.tasks_done || []), ...matched])];
      found.tasks = matched;
    }
  }

  // Global catches: weight + money, from any answer.
  // Body weight needs body-weight context — "bench at 60kg" is not a weigh-in.
  if (/\b(weigh|weight|scale|i'?m at)\b/.test(a) && !TRAIN_SIGNAL.test(a)) {
    const w = a.match(/(\d{2,3}(?:\.\d+)?)\s*(?:kg|kgs|kilos?)?\b/);
    if (w) {
      const kg = parseFloat(w[1]);
      if (kg >= 30 && kg <= 250) { sheet.body = { ...(sheet.body || {}), weight_kg: kg }; found.weight = kg; }
    }
  }
  const spent = a.match(/(?:spent|paid|blew|dropped)\s*(?:about|around|like)?\s*(?:rs\.?|₹|inr)?\s*(\d{2,6})\b/);
  if (spent) sheet.finance = [...(sheet.finance || []), { type: 'expense', amount: +spent[1], category: 'other', note: answer.slice(0, 80) }];
  const earned = a.match(/(?:earned|made|received|got paid)\s*(?:rs\.?|₹|inr)?\s*(\d{2,6})\b/);
  if (earned) sheet.finance = [...(sheet.finance || []), { type: 'income', amount: +earned[1], category: 'other', note: answer.slice(0, 80) }];

  return found;
}

// The question plan — built from what's actually missing today, with the
// data-driven concerns woven into their natural topic slot.
function buildPlan(snap, byId) {
  const plan = [];
  if (!snap.sleptToday) {
    plan.push({ topic: 'sleep', ask: byId.sleep?.question || pick([
      "First things first — how'd you sleep? Roughly how many hours?",
      "Start easy: last night's sleep. What did you get, hours-wise?",
    ]) });
  }
  plan.push({ topic: 'food', ask: snap.foodToday.n === 0 ? pick([
    "I've got nothing on food from you today. What did you eat — breakfast onwards, just say it how you'd say it?",
    "Food check. What actually went in today? Rough is fine, I'll work it out.",
  ]) : pick([
    `I've got ${snap.foodToday.n} thing${snap.foodToday.n > 1 ? 's' : ''} logged on food already — anything you ate that I don't know about?`,
    "Anything you ate today that didn't make it into the log?",
  ]) });
  if (!snap.trainedToday) {
    plan.push({ topic: 'training', ask: byId.workout?.question || pick([
      "Did you move today — gym, walk, anything that counts?",
      "Training. Did it happen, or are we calling today rest?",
    ]) });
  }
  const notDone = snap.habitList.filter(h => !h.doneToday).map(h => h.name);
  if (notDone.length) {
    plan.push({ topic: 'habits', ask: pick([
      `Your list — ${joinAnd(notDone)}. Which of those actually happened today?`,
      `Quick honesty round: ${joinAnd(notDone)}. What got done?`,
    ]) });
  }
  if (snap.pendingTasks.length) {
    const names = snap.pendingTasks.slice(0, 3).map(t => `"${t.title}"`);
    plan.push({ topic: 'tasks', ask: byId.overdue?.question || pick([
      `Still on your plate: ${joinAnd(names)}. Any of those move today?`,
      `You had ${joinAnd(names)} pending. Tell me one of them died today.`,
    ]) });
  }
  plan.push({ topic: 'mood', ask: byId.mood?.question || pick([
    "Last one. Where's your head at right now — honestly?",
    "And you — how are you actually feeling, now the day's behind you?",
  ]) });
  for (const id of ['habit', 'neglect', 'streak']) {
    if (byId[id]) plan.push({ topic: id, ask: byId[id].question });
  }
  return plan.slice(0, 7);
}

// Acknowledgments that prove he heard the specifics
function ackFor(found, answer) {
  if (found.topic === 'sleep' && found.sleepHours) {
    const h = found.sleepHours;
    if (h < 5.5) return pick([`${h} hours… that's thin. No wonder.`, `${h} hours is survival mode, not sleep.`]);
    if (h < 7) return pick([`${h} hours — workable, not ideal.`, `${h}, hm. You can run on that, barely.`]);
    return pick([`${h} hours? Look at you.`, `${h} solid hours — that's how it's done.`]);
  }
  if (found.topic === 'food' && found.meals?.length) {
    const cal = found.meals.reduce((s, m) => s + (m.calories || 0), 0);
    return cal > 0
      ? pick([`Got it — that's roughly ${cal} calories by my math.`, `Noted, all of it. About ${cal} calories.`])
      : pick(['Got it down.', 'Noted, all of it.']);
  }
  if (found.topic === 'training') {
    if (found.workout) return pick([`${found.workout.name} — in the books.`, 'Good. Body moved, day counts.']);
    if (found.negative) return pick(['Rest day then. Fair.', "Alright — recovery's part of it too."]);
  }
  if (found.topic === 'habits') {
    if (found.habits?.length) return pick([`That's ${found.habits.length} ticked. I'll take it.`, `${joinAnd(found.habits)} — done. Good.`]);
    if (found.negative) return pick(['Clean slate tomorrow, then.', "Okay. Tomorrow they don't escape."]);
  }
  if (found.topic === 'tasks' && found.tasks?.length) {
    return pick([`"${found.tasks[0]}" off the list — that one was haunting you.`, `${found.tasks.length} down. Felt good, didn't it?`]);
  }
  return reactToScripted(answer);
}

function converseScripted(userId, transcript) {
  const snap = buildSnapshot(userId);
  const concerns = buildConcerns(userId);
  const byId = {};
  concerns.forEach(c => { byId[c.id] = c; });

  // Pair each user answer with the Jay question it answered
  const turns = [];
  let lastJay = null;
  for (const t of transcript) {
    if (t.role !== 'user') { lastJay = t.text; continue; }
    if (/^\(/.test(t.text)) continue;
    turns.push({ q: lastJay, a: t.text });
  }

  // Extract everything said so far (sheet rebuilt fresh every call — no dupes)
  const sheet = {};
  let lastFound = { topic: 'day' };
  turns.forEach((turn, i) => {
    const topic = i === 0 ? 'day' : topicOf(turn.q);
    const found = extractFromAnswer(userId, topic, turn.a, snap, sheet);
    if (i === turns.length - 1) lastFound = found;
  });

  // Journal + mood from everything they said
  const answers = turns.map(t => t.a);
  if (answers.length) {
    const blob = answers.join(' ').toLowerCase();
    let mood = 3;
    if (/(terrible|awful|horrible|worst|depress)/.test(blob)) mood = 1;
    else if (/(rough|bad|tired|low|stress|exhaust)/.test(blob)) mood = 2;
    else if (/(great|amazing|fantastic|brilliant|best)/.test(blob)) mood = 5;
    else if (/(good|nice|productive|happy|solid)/.test(blob)) mood = 4;
    sheet.journal = {
      mood,
      text: answers.filter(t => t.length > 12).join('. ').replace(/\.\./g, '.'),
      tags: ['debrief'],
    };
  }

  // The first answer (day overview) decides which planned questions to skip —
  // it never changes mid-conversation, so the plan stays stable across calls.
  const scratch = {};
  if (turns.length) extractFromAnswer(userId, 'day', turns[0].a, snap, scratch);
  const skip = new Set();
  if (scratch.sleep) skip.add('sleep');
  if (scratch.meals?.length) skip.add('food');
  if (scratch.workout) skip.add('training');
  const plan = buildPlan(snap, byId).filter(p => !skip.has(p.topic));

  const lastAnswer = turns.length ? turns[turns.length - 1].a : '';
  const idx = turns.length - 1; // turns[0] answered the greeting; then plan[0], plan[1]…
  const userDone = /\b(that'?s it|i'?m done|gotta go|bye|good\s?night|nothing else)\b/i.test(lastAnswer);

  if (idx >= plan.length || userDone) {
    const closing = generateClosing(userId, turns.map(t => ({ a: t.a })));
    const bits = [];
    if (sheet.sleep) bits.push('your sleep');
    if (sheet.meals?.length) bits.push('the food');
    if (sheet.workout) bits.push('the workout');
    if (sheet.habits_done?.length) bits.push('habits');
    if (sheet.tasks_done?.length) bits.push('tasks');
    const savedLine = bits.length ? ` I've got ${joinAnd(bits)} down — filing it all now.` : '';
    return { reply: `${closing}${savedLine}`, done: true, sheet, ai: false };
  }

  const ack = idx >= 0 && lastAnswer ? ackFor(lastFound, lastAnswer) + ' ' : '';
  const bridge = pick(['So — ', 'Okay. ', 'Next thing — ', 'Tell me this — ', '', '']);
  return { reply: `${ack}${bridge}${plan[idx].ask}`, done: false, sheet, ai: false };
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

module.exports = {
  aiEnabled, humanVoiceEnabled, voiceTagsEnabled,
  converse, commitSheet, buildSnapshot, greeting,
};
