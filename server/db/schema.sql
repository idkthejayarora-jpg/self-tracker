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
  color TEXT DEFAULT '#6366f1',
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
