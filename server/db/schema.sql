CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  due_time TEXT,
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','cancelled')),
  completed_at DATETIME,
  is_recurring INTEGER DEFAULT 0,
  recur_interval TEXT CHECK(recur_interval IN ('daily','weekly','monthly')),
  follow_up_date DATE,
  deferred_count INTEGER DEFAULT 0,
  tags TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  content TEXT NOT NULL,
  mood INTEGER CHECK(mood BETWEEN 1 AND 5),
  tags TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  remind_at DATETIME NOT NULL,
  repeat TEXT DEFAULT 'none' CHECK(repeat IN ('none','daily','weekly')),
  related_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','dismissed','snoozed')),
  snoozed_until DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS streaks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK(activity_type IN ('tasks','journal','overall')),
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_activity_date DATE,
  UNIQUE(user_id, activity_type)
);

-- Workout tracking
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'other' CHECK(category IN ('push','pull','legs','cardio','core','other')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  name TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workout_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  reps INTEGER,
  weight REAL,
  duration_seconds INTEGER,
  sort_order INTEGER DEFAULT 0
);

-- Life progress
CREATE TABLE IF NOT EXISTS life_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🎯',
  color TEXT DEFAULT '#d97757',
  vision TEXT,
  progress INTEGER DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS life_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area_id INTEGER NOT NULL REFERENCES life_areas(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  completed_at DATETIME,
  target_date DATE,
  sort_order INTEGER DEFAULT 0
);

-- Diet: saved meal templates
CREATE TABLE IF NOT EXISTS saved_meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  calories INTEGER DEFAULT 0,
  protein_g REAL DEFAULT 0,
  carbs_g REAL DEFAULT 0,
  fat_g REAL DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Diet: daily food log entries
CREATE TABLE IF NOT EXISTS food_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT (date('now')),
  meal_type TEXT DEFAULT 'snack' CHECK(meal_type IN ('breakfast','lunch','dinner','snack')),
  name TEXT NOT NULL,
  calories INTEGER DEFAULT 0,
  protein_g REAL DEFAULT 0,
  carbs_g REAL DEFAULT 0,
  fat_g REAL DEFAULT 0,
  saved_meal_id INTEGER REFERENCES saved_meals(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Social media detox
CREATE TABLE IF NOT EXISTS detox_apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📱',
  color TEXT DEFAULT '#d97757',
  daily_limit_minutes INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detox_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id INTEGER NOT NULL REFERENCES detox_apps(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT (date('now')),
  status TEXT DEFAULT 'clean' CHECK(status IN ('clean','slipped','logged')),
  minutes_used INTEGER DEFAULT 0,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, app_id, date)
);

-- Habits
CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '✅',
  category TEXT DEFAULT 'discipline' CHECK(category IN ('discipline','physical','mental','health','other')),
  color TEXT DEFAULT '#d97757',
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT (date('now')),
  done INTEGER DEFAULT 0,
  note TEXT,
  UNIQUE(user_id, habit_id, date)
);

-- Habit enforcement: penalties (3+ day miss) and redemption bonuses
CREATE TABLE IF NOT EXISTS habit_penalties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('penalty','redemption')),
  miss_streak INTEGER NOT NULL,
  points INTEGER NOT NULL,          -- negative for penalty, positive for redemption
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, habit_id, date, kind)
);

-- Temporary user buffs (e.g. Momentum ×2 after a comeback)
CREATE TABLE IF NOT EXISTS user_buffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,               -- 'momentum'
  multiplier REAL DEFAULT 2.0,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Body Stats
CREATE TABLE IF NOT EXISTS body_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT (date('now')),
  weight_kg REAL,
  body_fat_pct REAL,
  chest_cm REAL,
  waist_cm REAL,
  hips_cm REAL,
  neck_cm REAL,
  bicep_cm REAL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, date)
);

-- Sleep
CREATE TABLE IF NOT EXISTS sleep_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT (date('now')),
  bedtime TEXT,
  wake_time TEXT,
  duration_minutes INTEGER,
  quality INTEGER CHECK(quality BETWEEN 1 AND 5),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, date)
);

-- Finance
CREATE TABLE IF NOT EXISTS finance_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT (date('now')),
  type TEXT NOT NULL CHECK(type IN ('income','expense')),
  category TEXT DEFAULT 'other',
  amount REAL NOT NULL,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  saved_amount REAL DEFAULT 0,
  deadline DATE,
  color TEXT DEFAULT '#d9a066',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS points_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_id INTEGER,
  action TEXT NOT NULL,
  points INTEGER NOT NULL,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Focus / hyperfocus sessions (ADHD deep-work timer) ────────────────────────
CREATE TABLE IF NOT EXISTS focus_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT,
  task_id INTEGER,
  planned_minutes INTEGER DEFAULT 25,
  actual_seconds INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Me / Character ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS me_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  character_name TEXT DEFAULT '',
  title TEXT DEFAULT '',
  class TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  adventure TEXT DEFAULT '',
  avatar_emoji TEXT DEFAULT '⚔️',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS me_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  icon TEXT DEFAULT '⚡',
  category TEXT DEFAULT 'general',
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS me_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  claim_type TEXT DEFAULT 'quest' CHECK(claim_type IN ('quest','achievement','legacy')),
  status TEXT DEFAULT 'active' CHECK(status IN ('active','claimed','failed')),
  deadline DATE,
  reward_text TEXT DEFAULT '',
  icon TEXT DEFAULT '🎯',
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS me_mentors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  era TEXT DEFAULT '',
  domain TEXT DEFAULT '',
  trait TEXT DEFAULT '',
  progress INTEGER DEFAULT 0,
  icon TEXT DEFAULT '👤',
  notes TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Workout plan days ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workout_plan_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '💪',
  color TEXT DEFAULT '#d97757',
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Workout plan exercises (per day) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workout_plan_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL REFERENCES workout_plan_days(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sets INTEGER DEFAULT 3,
  reps TEXT DEFAULT '8-12',
  weight TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);

-- ── Life area tagging on tasks ────────────────────────────────────────────────
-- Add life_area_id to tasks if it doesn't exist (SQLite migration workaround)
-- Handled in server startup via db.prepare / try-catch

-- ── Inspirational Quotes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT    NOT NULL,
  author     TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Content Creator ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_niches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT DEFAULT '#d97757',
  icon       TEXT DEFAULT '🎯',
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_ideas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  niche_id       INTEGER REFERENCES content_niches(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  notes          TEXT,
  content_type   TEXT DEFAULT 'reel' CHECK(content_type IN ('reel','post','carousel','story')),
  status         TEXT DEFAULT 'idea' CHECK(status IN ('idea','scripted','filmed','posted','archived')),
  scheduled_date DATE,
  posted_at      DATE,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
