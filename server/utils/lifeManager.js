'use strict';

const db = require('../db/database');
const { SQL_OFF } = require('../utils/dateUtils');

// ─────────────────────────────────────────────────────────────────────────────
// TASK TEMPLATE LIBRARY
// { title, dueDays: [min, max], priority, domains[] }
// ─────────────────────────────────────────────────────────────────────────────

const TASK_TEMPLATES = [
  // ── FITNESS ──
  { title: 'Complete a 30-min workout session',      dueDays: [1, 2],  priority: 'high',   domains: ['fitness','gym','workout','exercise','training','health','physique','strength','muscle','cardio','fit','body'] },
  { title: 'Run 3km at a comfortable pace',          dueDays: [1, 2],  priority: 'medium', domains: ['running','run','cardio','fitness','5k','10k','marathon','jog'] },
  { title: 'Track your calories for the day',        dueDays: [1, 1],  priority: 'medium', domains: ['diet','calori','nutrition','weight','lose','fat','protein','bulk','cut'] },
  { title: 'Do 3 sets of 20 push-ups',               dueDays: [1, 2],  priority: 'medium', domains: ['fitness','workout','calisthenics','bodyweight','strength','muscle','push'] },
  { title: 'Log your body weight this morning',      dueDays: [1, 1],  priority: 'low',    domains: ['weight','lose','fat','physique','body','lean','bulk','cut'] },
  { title: 'Plan this week\'s workout sessions',     dueDays: [1, 2],  priority: 'high',   domains: ['gym','workout','fitness','training','strength','exercise','program'] },
  { title: 'Complete a 20-min HIIT session',         dueDays: [1, 3],  priority: 'high',   domains: ['cardio','hiit','fat','lose','fitness','training','burn'] },
  { title: 'Do a 15-min morning stretch',            dueDays: [1, 1],  priority: 'low',    domains: ['flexibility','yoga','stretch','morning','routine','health','mobility'] },
  { title: 'Book a gym session for this week',       dueDays: [1, 3],  priority: 'high',   domains: ['gym','workout','fitness','training','session'] },
  { title: 'Research a new training program',        dueDays: [2, 5],  priority: 'medium', domains: ['gym','fitness','training','program','muscle','strength','plan'] },

  // ── LANGUAGE LEARNING ──
  { title: 'Study [language] for 20 minutes',             dueDays: [1, 2], priority: 'high',   domains: ['german','french','spanish','japanese','mandarin','chinese','arabic','italian','korean','portuguese','hindi','language','learn','fluent','speak'] },
  { title: 'Complete one [language] lesson on Duolingo',  dueDays: [1, 1], priority: 'medium', domains: ['german','french','spanish','japanese','mandarin','chinese','arabic','italian','korean','portuguese','hindi','language','learn'] },
  { title: 'Watch a 10-min [language] YouTube video',     dueDays: [1, 3], priority: 'medium', domains: ['german','french','spanish','japanese','mandarin','chinese','arabic','italian','korean','portuguese','hindi','language','learn'] },
  { title: 'Write 10 new vocabulary flashcards',          dueDays: [1, 2], priority: 'medium', domains: ['german','french','spanish','japanese','mandarin','chinese','arabic','italian','korean','portuguese','hindi','language','vocab','learn'] },
  { title: 'Practice speaking [language] for 10 minutes', dueDays: [2, 4], priority: 'high',   domains: ['german','french','spanish','japanese','mandarin','chinese','arabic','italian','korean','portuguese','hindi','language','speak','fluent'] },
  { title: 'Find a [language] language exchange partner',  dueDays: [3, 7], priority: 'medium', domains: ['german','french','spanish','japanese','mandarin','chinese','arabic','italian','korean','portuguese','hindi','language','speak','fluent','native'] },

  // ── STARTUP / BUSINESS ──
  { title: 'Write a 1-page business plan outline',         dueDays: [3, 7],  priority: 'high',   domains: ['startup','business','company','entrepreneur','saas','product','launch','brand','agency','venture'] },
  { title: 'Identify your first 3 target customers',       dueDays: [3, 7],  priority: 'high',   domains: ['startup','business','saas','product','launch','client','revenue','sell'] },
  { title: 'Define the core problem your product solves',  dueDays: [2, 5],  priority: 'high',   domains: ['startup','business','saas','product','app','tool','build'] },
  { title: 'Sketch out a landing page wireframe',          dueDays: [3, 7],  priority: 'medium', domains: ['startup','business','saas','product','launch','website','landing','brand'] },
  { title: 'Research 3 direct competitors',                dueDays: [3, 7],  priority: 'high',   domains: ['startup','business','saas','product','market','competitive','compete'] },
  { title: 'Register a domain name for the project',       dueDays: [2, 5],  priority: 'medium', domains: ['startup','business','saas','product','launch','website','brand','domain'] },
  { title: 'Write and send your first cold outreach email', dueDays: [3, 7], priority: 'high',   domains: ['freelance','business','client','agency','startup','revenue','outreach','sales'] },
  { title: 'Set up a basic project repository',            dueDays: [1, 3],  priority: 'medium', domains: ['startup','build','product','app','code','saas','side','project'] },

  // ── FINANCE / INVESTING ──
  { title: 'Research one index ETF to invest in',     dueDays: [3, 7],  priority: 'high',   domains: ['invest','etf','stock','portfolio','finance','wealth','money','market'] },
  { title: 'Review your monthly budget',              dueDays: [3, 7],  priority: 'high',   domains: ['budget','finance','money','saving','expense','debt','wealth','spend'] },
  { title: 'Set up an auto-savings rule',             dueDays: [3, 7],  priority: 'medium', domains: ['saving','savings','finance','money','wealth','budget','auto'] },
  { title: 'Open a brokerage or investment account',  dueDays: [5, 14], priority: 'high',   domains: ['invest','stock','etf','portfolio','finance','wealth','brokerage'] },
  { title: 'Track all expenses this week',            dueDays: [1, 3],  priority: 'medium', domains: ['budget','finance','money','expense','saving','debt','track','spend'] },
  { title: 'Calculate your current net worth',        dueDays: [3, 7],  priority: 'medium', domains: ['invest','finance','wealth','money','saving','portfolio','assets'] },
  { title: 'Cut one unnecessary subscription',        dueDays: [3, 7],  priority: 'medium', domains: ['budget','saving','finance','money','expense','debt','cut','subscript'] },
  { title: 'Read one chapter of a personal finance book', dueDays: [1, 3], priority: 'low', domains: ['invest','finance','wealth','money','saving','stock','etf','book','read'] },

  // ── DRAWING / ART ──
  { title: 'Complete a 30-min sketch session',           dueDays: [1, 2], priority: 'high',   domains: ['draw','sketch','art','illustration','creative','drawing','pencil','figure'] },
  { title: 'Study one drawing tutorial on YouTube',      dueDays: [1, 3], priority: 'medium', domains: ['draw','sketch','art','illustration','drawing','paint','tutorial','learn'] },
  { title: 'Draw from photo reference for 20 minutes',   dueDays: [1, 2], priority: 'medium', domains: ['draw','sketch','art','illustration','figure','portrait','drawing','reference'] },
  { title: 'Fill one sketchbook page with gesture drawings', dueDays: [1, 2], priority: 'medium', domains: ['draw','sketch','art','gesture','figure','illustration','practice'] },
  { title: 'Pick a drawing challenge for this month',    dueDays: [2, 5], priority: 'low',    domains: ['draw','sketch','art','illustration','creative','drawing','challenge'] },

  // ── MUSIC / PRODUCTION ──
  { title: 'Produce a 1-minute loop in your DAW',        dueDays: [2, 5], priority: 'high',   domains: ['music','produce','production','beat','ableton','fl','daw','track','loop'] },
  { title: 'Watch one music production tutorial',        dueDays: [1, 3], priority: 'medium', domains: ['music','produce','production','beat','ableton','fl','mixing','mastering','daw'] },
  { title: 'Practice your instrument for 30 minutes',   dueDays: [1, 2], priority: 'high',   domains: ['guitar','piano','drums','bass','music','instrument','play','practice'] },
  { title: 'Learn one new chord progression',            dueDays: [2, 4], priority: 'medium', domains: ['guitar','piano','music','theory','instrument','chord','learn'] },
  { title: 'Record a rough demo of an idea',             dueDays: [3, 7], priority: 'medium', domains: ['music','produce','record','demo','track','guitar','piano','sing','vocal'] },

  // ── TRAVEL ──
  { title: 'Research visa requirements for your destination', dueDays: [7, 21], priority: 'high',   domains: ['travel','trip','abroad','overseas','visit','vacation','holiday','visa','country'] },
  { title: 'Create a trip budget spreadsheet',               dueDays: [7, 14], priority: 'high',   domains: ['travel','trip','abroad','budget','plan','vacation','holiday','cost'] },
  { title: 'Set up a dedicated travel savings fund',         dueDays: [3, 7],  priority: 'medium', domains: ['travel','trip','abroad','saving','budget','vacation','holiday','fund'] },
  { title: 'Book accommodation for the first night',         dueDays: [7, 30], priority: 'medium', domains: ['travel','trip','abroad','book','hotel','hostel','airbnb','stay'] },
  { title: 'Research the best time to visit your destination', dueDays: [3, 10], priority: 'low',  domains: ['travel','trip','abroad','visit','explore','destination','season','when'] },
  { title: 'Join a travel community or forum for your destination', dueDays: [3, 7], priority: 'low', domains: ['travel','trip','abroad','explore','visit','destination','community','reddit'] },

  // ── HABITS / DISCIPLINE ──
  { title: 'Plan tomorrow the night before',              dueDays: [1, 1], priority: 'high',   domains: ['habit','discipline','routine','planning','productive','organize','productivity','plan'] },
  { title: 'Complete your full morning routine',          dueDays: [1, 1], priority: 'high',   domains: ['habit','discipline','routine','morning','wake','daily','productive','morning'] },
  { title: 'Journal for 10 minutes tonight',             dueDays: [1, 1], priority: 'medium', domains: ['habit','discipline','journal','reflection','mindset','routine','write','evening'] },
  { title: 'Do a 5-min evening review of the day',       dueDays: [1, 1], priority: 'medium', domains: ['habit','discipline','routine','reflection','evening','review','productive','daily'] },
  { title: 'Block your next 3 deep-work sessions',       dueDays: [1, 3], priority: 'high',   domains: ['habit','discipline','focus','productivity','deep','routine','work','block','time'] },
  { title: 'Set up a habit tracker',                     dueDays: [1, 2], priority: 'medium', domains: ['habit','discipline','routine','track','consistency','daily','system'] },
  { title: 'Identify and remove one time-wasting habit', dueDays: [2, 5], priority: 'medium', domains: ['habit','discipline','quit','stop','break','routine','mindset','time','waste'] },

  // ── LEARNING / CODING ──
  { title: 'Complete one module of your online course',   dueDays: [1, 3], priority: 'high',   domains: ['learn','course','study','skill','python','code','programming','development','web','online'] },
  { title: 'Build a small project to practise what you\'ve learned', dueDays: [3, 7], priority: 'high', domains: ['learn','code','python','programming','development','web','react','javascript','project'] },
  { title: 'Read one technical article or blog post',    dueDays: [1, 2], priority: 'low',    domains: ['learn','study','skill','code','programming','development','tech','article','blog'] },
  { title: 'Solve 3 coding problems on LeetCode / HackerRank', dueDays: [1, 3], priority: 'medium', domains: ['code','python','javascript','programming','algorithm','learn','development','solve'] },

  // ── PERSONAL GROWTH / MINDSET ──
  { title: 'Read 20 pages of a personal development book', dueDays: [1, 2], priority: 'medium', domains: ['grow','mindset','self','improve','development','read','stoic','philosophy','mental','personal'] },
  { title: 'Do a 10-min guided meditation',               dueDays: [1, 1], priority: 'medium', domains: ['meditat','mindful','mindset','grow','calm','zen','wellbeing','mental','self','inner'] },
  { title: 'Write 3 things you\'re grateful for today',   dueDays: [1, 1], priority: 'low',    domains: ['mindset','grow','journal','self','mental','wellbeing','gratitude','reflect','positive'] },
  { title: 'Identify one limiting belief and challenge it', dueDays: [2, 5], priority: 'medium', domains: ['mindset','grow','self','identity','confident','mental','therapy','aware','belief','limit'] },
  { title: 'Spend 30 min in uninterrupted deep focus',    dueDays: [1, 2], priority: 'high',   domains: ['focus','discipline','productive','mindset','grow','work','deep','concentration'] },

  // ── RELATIONSHIPS / SOCIAL ──
  { title: 'Reach out to one person you\'ve been meaning to contact', dueDays: [1, 3], priority: 'medium', domains: ['relationship','friend','social','connect','network','family','community','people','reach'] },
  { title: 'Schedule a catch-up with a close friend',     dueDays: [3, 7],  priority: 'medium', domains: ['relationship','friend','social','connect','community','bond','meet','catch'] },
  { title: 'Write a genuine message to someone you appreciate', dueDays: [1, 2], priority: 'low', domains: ['relationship','friend','social','connect','family','bond','romantic','message','thank'] },
];

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE RESOLVER — fills [language] placeholder
// ─────────────────────────────────────────────────────────────────────────────

const LANG_KEYWORDS = {
  german: 'German', deutsch: 'German',
  french: 'French',
  spanish: 'Spanish',
  japanese: 'Japanese',
  mandarin: 'Mandarin', chinese: 'Mandarin',
  arabic: 'Arabic',
  italian: 'Italian',
  korean: 'Korean',
  portuguese: 'Portuguese',
  hindi: 'Hindi',
};

function resolveLanguage(text) {
  const t = text.toLowerCase();
  for (const [kw, name] of Object.entries(LANG_KEYWORDS)) {
    if (t.includes(kw)) return name;
  }
  return 'your target language';
}

// ─────────────────────────────────────────────────────────────────────────────
// USER DATA ANALYZER
// ─────────────────────────────────────────────────────────────────────────────

function analyzeUserData(userId) {
  const areaRows = db.prepare(
    'SELECT id, name, icon, color FROM life_areas WHERE user_id = ?'
  ).all(userId);

  // Neglected areas — no completed tasks in last 14 days
  const neglectedAreas = areaRows.filter(area => {
    const r = db.prepare(`
      SELECT COUNT(*) as cnt FROM tasks
      WHERE user_id = ? AND life_area_id = ? AND status = 'completed'
      AND completed_at >= datetime('now', ${SQL_OFF}, '-14 days')
    `).get(userId, area.id);
    return (r?.cnt ?? 0) === 0;
  });

  // Overdue tasks
  const overdueRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM tasks
    WHERE user_id = ? AND status NOT IN ('completed','cancelled')
    AND due_date IS NOT NULL AND due_date < date('now', ${SQL_OFF})
  `).get(userId);
  const overdueCount = overdueRow?.cnt ?? 0;

  // Streaks
  const streaks = db.prepare(
    'SELECT activity_type, current_streak FROM streaks WHERE user_id = ?'
  ).all(userId);
  const streakMap = Object.fromEntries(streaks.map(s => [s.activity_type, s.current_streak]));
  const overallStreak = streakMap['overall'] ?? 0;
  const taskStreak    = streakMap['tasks']   ?? 0;

  // Recent mood average (last 7 journal entries with mood set)
  const moodRow = db.prepare(`
    SELECT AVG(mood) as avg_mood
    FROM (SELECT mood FROM journal_entries
          WHERE user_id = ? AND mood IS NOT NULL
          ORDER BY date DESC LIMIT 7)
  `).get(userId);
  const recentMoodAvg = moodRow?.avg_mood
    ? Math.round(moodRow.avg_mood * 10) / 10
    : null;

  // Tasks done this week
  const weekRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM tasks
    WHERE user_id = ? AND status = 'completed'
    AND completed_at >= datetime('now', ${SQL_OFF}, '-7 days')
  `).get(userId);
  const totalTasksDoneThisWeek = weekRow?.cnt ?? 0;

  // Sector fill percentages
  const sectorFills = areaRows.map(area => {
    const tagged = db.prepare(`
      SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done
      FROM tasks WHERE user_id=? AND life_area_id=?
    `).get(userId, area.id);

    const keywords = area.name.toLowerCase().split(/[\s&,\/]+/).filter(w => w.length >= 4);
    let kwStats = { total: 0, done: 0 };
    if (keywords.length) {
      const where = keywords.map(() => 'LOWER(title) LIKE ?').join(' OR ');
      kwStats = db.prepare(`
        SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done
        FROM tasks WHERE user_id=? AND (${where})
        AND life_area_id IS NULL
        AND datetime(created_at) >= datetime('now', ${SQL_OFF}, '-60 days')
      `).get(userId, ...keywords.map(k => `%${k}%`)) || { total: 0, done: 0 };
    }

    const total   = (tagged?.total || 0) + (kwStats.total || 0);
    const done    = (tagged?.done  || 0) + (kwStats.done  || 0);
    const fillPct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    return { id: area.id, name: area.name, icon: area.icon, color: area.color, fillPct };
  });

  // Pending task count
  const pendingRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM tasks
    WHERE user_id = ? AND status IN ('pending','in_progress')
  `).get(userId);
  const pendingCount = pendingRow?.cnt ?? 0;

  return {
    neglectedAreas,
    overdueCount,
    overallStreak,
    taskStreak,
    recentMoodAvg,
    totalTasksDoneThisWeek,
    sectorFills,
    pendingCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOMMENDATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

function getRecommendations(message, sectors, snapshot) {
  const blob = [
    message.toLowerCase(),
    ...(sectors || []).map(s => s.name.toLowerCase()),
  ].join(' ');

  // Score templates by domain keyword hits
  const scored = TASK_TEMPLATES.map(tmpl => ({
    tmpl,
    score: tmpl.domains.reduce((acc, d) => acc + (blob.includes(d) ? 1 : 0), 0),
  })).filter(x => x.score > 0);

  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by title prefix
  const seen = new Set();
  const unique = scored.filter(({ tmpl }) => {
    const key = tmpl.title.slice(0, 22).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const top = unique.slice(0, 4).map(({ tmpl }) => tmpl);
  const language = resolveLanguage(message);
  const today = new Date();

  return top.map(tmpl => {
    const [mn, mx] = tmpl.dueDays;
    const days = Math.floor(Math.random() * (mx - mn + 1)) + mn;
    const due = new Date(today);
    due.setDate(due.getDate() + days);
    const due_date = due.toISOString().slice(0, 10);

    // Resolve [language] placeholder
    const title = tmpl.title.replace(/\[language\]/g, language);

    // Find matching life_area_id
    let life_area_id = null;
    for (const sf of snapshot.sectorFills) {
      const sfLower = sf.name.toLowerCase();
      if (tmpl.domains.some(d => sfLower.includes(d) || d.includes(sfLower.split(' ')[0]))) {
        life_area_id = sf.id;
        break;
      }
    }

    // Build rationale
    const sf = snapshot.sectorFills.find(s => s.id === life_area_id);
    const rationale = sf
      ? `${sf.name} is at ${sf.fillPct}% — this pushes it forward.`
      : 'New goal detected — building your foundation.';

    return { title, due_date, priority: tmpl.priority, life_area_id, rationale };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REPLY GENERATOR
// Terse, direct, data-aware. 2–4 short sentences.
// ─────────────────────────────────────────────────────────────────────────────

function generateReply(message, snapshot, recs, newSectorNames) {
  const parts = [];
  const msg = message.toLowerCase();

  // ── Opening: acknowledge what they said ──
  const detectedGoals = newSectorNames && newSectorNames.length > 0;
  if (detectedGoals) {
    const names = newSectorNames.slice(0, 3).join(', ');
    parts.push(`Logged: ${names}.`);
  } else {
    parts.push('Got it.');
  }

  // ── Data observations (pick the most relevant 1–2) ──
  const obs = [];

  if (snapshot.overdueCount > 0) {
    obs.push(`${snapshot.overdueCount} overdue task${snapshot.overdueCount > 1 ? 's' : ''} need clearing before you pile on more.`);
  }

  if (snapshot.overallStreak >= 3) {
    obs.push(`You're on a ${snapshot.overallStreak}-day streak — don't drop it.`);
  } else if (snapshot.taskStreak >= 2) {
    obs.push(`${snapshot.taskStreak}-day task streak active — keep it going.`);
  }

  if (snapshot.neglectedAreas.length > 0 && !detectedGoals) {
    const area = snapshot.neglectedAreas[0];
    obs.push(`${area.icon} ${area.name} hasn't moved in 14 days.`);
  }

  if (snapshot.recentMoodAvg !== null && snapshot.recentMoodAvg < 2.5) {
    obs.push(`Mood's been low lately — let's keep the tasks manageable.`);
  } else if (snapshot.totalTasksDoneThisWeek >= 5) {
    obs.push(`Strong week — ${snapshot.totalTasksDoneThisWeek} tasks done already.`);
  }

  // Add up to 2 observations
  parts.push(...obs.slice(0, 2));

  // ── Closing: what's being queued ──
  if (recs.length > 0) {
    const recTitles = recs.slice(0, 2).map(r => `"${r.title}"`).join(' and ');
    parts.push(`Queued ${recs.length} task${recs.length > 1 ? 's' : ''} — starting with ${recTitles}.`);
  } else if (snapshot.pendingCount > 0) {
    parts.push(`You have ${snapshot.pendingCount} pending tasks — work through those first.`);
  }

  return parts.join(' ');
}

module.exports = { analyzeUserData, getRecommendations, generateReply };
