export interface User {
  id: number;
  username: string;
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type RecurInterval = 'daily' | 'weekly' | 'monthly';

export interface Task {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completed_at: string | null;
  is_recurring: number;
  recur_interval: RecurInterval | null;
  follow_up_date: string | null;
  deferred_count: number;
  tags: string; // JSON string
  created_at: string;
  priority_score?: number;
}

export interface JournalEntry {
  id: number;
  user_id: number;
  date: string;
  content: string;
  mood: number | null;
  tags: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  remind_at: string;
  repeat: 'none' | 'daily' | 'weekly';
  related_task_id: number | null;
  task_title?: string | null;
  status: 'pending' | 'dismissed' | 'snoozed';
  snoozed_until: string | null;
  created_at: string;
}

export interface StreakInfo {
  current: number;
  longest: number;
  lastDate?: string | null;
}

export interface Streaks {
  tasks?: StreakInfo;
  journal?: StreakInfo;
  overall?: StreakInfo;
  workout?: StreakInfo;
  sleep?: StreakInfo;
}

export interface DashboardSnapshot {
  habitsDone: number;
  habitsTotal: number;
  lastSleep: { date: string; duration_minutes: number | null; quality: number | null } | null;
  lastWorkout: { date: string; name: string | null } | null;
  todayCalories: number | null;
  todayProtein: number | null;
  latestBody: { weight_kg: number | null; body_fat_pct: number | null; date: string } | null;
  financeIncome: number | null;
  financeExpenses: number | null;
}

export interface PointsSummary {
  total: number;
  today: number;
  level: number;
  levelLabel: string;
  nextLevel: number | null;
  progressPct: number;
}

export interface DashboardData {
  today: string;
  pendingToday: Task[];
  priorityQueue: Task[];
  journal: JournalEntry | null;
  streaks: Streaks;
  stats: {
    totalTasks: number;
    completedTasks: number;
    totalJournal: number;
  };
  snapshot?: DashboardSnapshot;
  points?: PointsSummary;
}

export interface WeeklyAnalytics {
  week: string;
  start: string;
  end: string;
  task_score: number | null;
  journal_score: number;
  avg_mood: number | null;
  tasks_created: number;
  tasks_completed: number;
  journal_entries: number;
  habits_score: number | null;
  sleep_avg_hrs: number | null;
  workout_sessions: number;
}

export interface MoodDataPoint {
  date: string;
  mood: number;
}

export interface Habit {
  id: number;
  user_id: number;
  name: string;
  icon: string;
  category: string;
  color: string;
  sort_order: number;
  created_at: string;
  done?: boolean;
  streak?: number;
  log_id?: number | null;
  week?: { date: string; done: boolean }[];
}

export interface BodyStat {
  id: number;
  date: string;
  weight_kg?: number | null;
  body_fat_pct?: number | null;
  chest_cm?: number | null;
  waist_cm?: number | null;
  hips_cm?: number | null;
  neck_cm?: number | null;
  bicep_cm?: number | null;
  notes?: string | null;
}

export interface SleepLog {
  id: number;
  date: string;
  bedtime?: string | null;
  wake_time?: string | null;
  duration_minutes?: number | null;
  quality?: number | null;
  notes?: string | null;
}

export interface FinanceEntry {
  id: number;
  date: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  note?: string | null;
}

export interface FinanceGoal {
  id: number;
  name: string;
  target_amount: number;
  saved_amount: number;
  deadline?: string | null;
  color: string;
}

export interface MeProfile {
  id?: number;
  character_name: string;
  title: string;
  class: string;
  bio: string;
  adventure: string;
  avatar_emoji: string;
}

export interface MeSkill {
  id: number;
  name: string;
  description: string;
  level: number;
  xp: number;
  icon: string;
  category: string;
  sort_order: number;
}

export interface MeClaim {
  id: number;
  title: string;
  description: string;
  claim_type: 'quest' | 'achievement' | 'legacy';
  status: 'active' | 'claimed' | 'failed';
  deadline: string | null;
  reward_text: string;
  icon: string;
  created_at?: string;
}

export interface MeMentor {
  id: number;
  name: string;
  era: string;
  domain: string;
  trait: string;
  progress: number;
  icon: string;
  notes: string;
}

export interface MeStats {
  strength: number;
  vitality: number;
  discipline: number;
  focus: number;
  endurance: number;
  wealth: number;
  creativity: number;
}

export interface MeSummary {
  profile: MeProfile;
  rank: string;
  rankClass: string;
  rankColor: string;
  rankLabel: string;
  rankDesc: string;
  meritScore: number;
  meritBreakdown: {
    statScore: number;
    streakScore: number;
    skillScore: number;
    claimScore: number;
    ptsScore: number;
  };
  nextRank: { rank: string; rankClass?: string; min: number; color: string; label: string } | null;
  totalPoints: number;
  stats: MeStats;
  skills: MeSkill[];
  claims: MeClaim[];
  mentors: MeMentor[];
}

export interface PointsLogEntry {
  id: number;
  source: string;
  source_id: number | null;
  action: string;
  points: number;
  note: string | null;
  created_at: string;
}

export interface CheckinResult {
  mood: number | null;
  sleep_logged: boolean;
  tasks_completed: number;
  habits_completed: number;
  journal_saved: boolean;
  actions_taken: string[];
  friendly_response: string;
  skills_upgraded?: number;
}
