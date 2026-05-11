import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Flame, CheckSquare, BookOpen, Zap, Clock, ArrowRight, Dumbbell, Moon } from 'lucide-react';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import { useAuth } from '../contexts/AuthContext';
import type { DashboardData, DashboardSnapshot, Task } from '../types';
import { format } from 'date-fns';

const PRIORITY_DOT: Record<string, string> = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#eab308',
  low:    '#22c55e',
};

const MOOD_EMOJI  = ['', '😞', '😕', '😐', '🙂', '😄'];
const MOOD_LABEL  = ['', 'Terrible', 'Bad', 'Okay', 'Good', 'Great'];
const MOOD_COLOR  = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/* ── Streak card ── */
function StreakCard({ value, best, label, color, icon: Icon }: {
  value: number; best: number; label: string; color: string; icon: any;
}) {
  return (
    <div className="card px-4 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Icon size={14} color={color} />
        <span className="text-[11px] font-medium" style={{ color: '#52525b' }}>best {best}</span>
      </div>
      <div>
        <p className="text-3xl font-bold tracking-tight" style={{ color }}>{value}</p>
        <p className="text-xs mt-0.5" style={{ color: '#71717a' }}>{label} streak</p>
      </div>
    </div>
  );
}

/* ── Task row ── */
function TaskRow({ task }: { task: Task }) {
  const dot = PRIORITY_DOT[task.priority] ?? '#71717a';
  const isOverdue = task.due_date && task.due_date < new Date().toISOString().slice(0, 10);
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: dot }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-body truncate">{task.title}</p>
        {task.due_date && (
          <p className="text-[11px] mt-0.5" style={{ color: isOverdue ? '#ef4444' : '#52525b' }}>
            {isOverdue ? '⚠ overdue' : `due ${task.due_date}`}
          </p>
        )}
      </div>
      <span className="text-[11px] shrink-0 font-medium capitalize" style={{ color: dot }}>
        {task.priority}
      </span>
    </div>
  );
}

/* ── Snapshot mini-cards ── */
function fmtDuration(mins: number | null | undefined) {
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function SnapshotSection({ snap }: { snap: DashboardSnapshot }) {
  const cards: { to: string; title: string; line1: string; line2?: string }[] = [];

  // Habits
  cards.push({
    to: '/habits',
    title: 'Habits',
    line1: snap.habitsTotal > 0 ? `${snap.habitsDone}/${snap.habitsTotal} done` : 'None set',
    line2: snap.habitsTotal > 0
      ? `${Math.round((snap.habitsDone / snap.habitsTotal) * 100)}%`
      : undefined,
  });

  // Sleep
  const sleepDur = snap.lastSleep ? fmtDuration(snap.lastSleep.duration_minutes) : null;
  cards.push({
    to: '/sleep',
    title: 'Sleep',
    line1: sleepDur ?? 'No log',
    line2: snap.lastSleep?.quality != null
      ? `quality ${snap.lastSleep.quality}/5`
      : snap.lastSleep?.date ?? undefined,
  });

  // Workout
  cards.push({
    to: '/workout',
    title: 'Workout',
    line1: snap.lastWorkout ? (snap.lastWorkout.name ?? 'Session') : 'No session',
    line2: snap.lastWorkout?.date ?? undefined,
  });

  // Calories
  cards.push({
    to: '/diet',
    title: 'Calories',
    line1: snap.todayCalories != null ? `${snap.todayCalories} kcal` : 'Not logged',
    line2: snap.todayProtein != null ? `${snap.todayProtein}g protein` : undefined,
  });

  // Body
  cards.push({
    to: '/body',
    title: 'Body',
    line1: snap.latestBody?.weight_kg != null ? `${snap.latestBody.weight_kg} kg` : 'No data',
    line2: snap.latestBody?.body_fat_pct != null
      ? `${snap.latestBody.body_fat_pct}% body fat`
      : snap.latestBody?.date ?? undefined,
  });

  // Finance
  const net = (snap.financeIncome ?? 0) - (snap.financeExpenses ?? 0);
  cards.push({
    to: '/finance',
    title: 'Finance',
    line1: snap.financeIncome != null || snap.financeExpenses != null
      ? `▲ ${snap.financeIncome ?? 0} / ▼ ${snap.financeExpenses ?? 0}`
      : 'No entries',
    line2: snap.financeIncome != null || snap.financeExpenses != null
      ? `net ${net >= 0 ? '+' : ''}${Math.round(net * 100) / 100}`
      : undefined,
  });

  return (
    <div>
      <p className="text-xs font-semibold mb-2" style={{ color: '#52525b', letterSpacing: '0.05em' }}>TODAY AT A GLANCE</p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {cards.map(c => (
          <Link key={c.to} to={c.to} className="card px-3 py-3 flex flex-col gap-1 min-w-[110px] shrink-0 no-underline">
            <p className="text-[11px] font-semibold" style={{ color: '#52525b' }}>{c.title}</p>
            <p className="text-sm font-bold text-head leading-tight">{c.line1}</p>
            {c.line2 && <p className="text-[11px]" style={{ color: '#71717a' }}>{c.line2}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Section header ── */
function Section({ icon: Icon, iconColor, title, action, count }: {
  icon: any; iconColor: string; title: string;
  action?: { label: string; to: string };
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={13} color={iconColor} />
      <span className="text-sm font-semibold text-head flex-1">{title}</span>
      {count !== undefined && (
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'var(--s3)', color: count > 0 ? '#f87171' : '#52525b' }}>
          {count}
        </span>
      )}
      {action && (
        <Link to={action.to}
          className="flex items-center gap-1 text-[11px] font-medium"
          style={{ color: 'rgb(var(--accent-rgb-light))' }}>
          {action.label} <ArrowRight size={10} />
        </Link>
      )}
    </div>
  );
}

/* ── Dashboard ── */
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const { user } = useAuth();

  const load = useCallback(async () => {
    const res = await api.get<DashboardData>('/dashboard');
    setData(res.data);
  }, []);

  useEffect(() => { load(); }, [load]);
  useSync(load, 60000);

  if (!data) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: 'rgb(var(--accent-rgb))', borderTopColor: 'transparent' }} />
    </div>
  );

  const { streaks, stats, priorityQueue, pendingToday, journal } = data;
  const remaining = stats.totalTasks - stats.completedTasks;
  const pct = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;

  return (
    <div className="max-w-xl space-y-3 anim-page">

      {/* ── Greeting ── */}
      <div className="mb-5">
        <p className="text-xs font-medium mb-1" style={{ color: '#52525b', letterSpacing: '0.05em' }}>
          {format(new Date(), 'EEEE, d MMMM yyyy').toUpperCase()}
        </p>
        <h1 className="text-2xl font-bold text-head tracking-tight">
          Good {getGreeting()}{user?.username ? `, ${user.username}` : ''}
        </h1>
        <p className="text-sm mt-1" style={{ color: '#71717a' }}>
          {pct === 100 && stats.totalTasks > 0
            ? 'Every task done. Outstanding.'
            : remaining > 0
            ? `${remaining} task${remaining !== 1 ? 's' : ''} remaining today`
            : 'No tasks yet — add something to work on'}
        </p>
      </div>

      {/* ── Streaks ── */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        <StreakCard value={streaks.tasks?.current   ?? 0} best={streaks.tasks?.longest   ?? 0} label="tasks"   color="#6366f1" icon={CheckSquare} />
        <StreakCard value={streaks.journal?.current ?? 0} best={streaks.journal?.longest ?? 0} label="journal" color="#a855f7" icon={BookOpen}   />
        <StreakCard value={streaks.overall?.current ?? 0} best={streaks.overall?.longest ?? 0} label="overall" color="#f97316" icon={Flame}      />
        <StreakCard value={streaks.workout?.current ?? 0} best={streaks.workout?.longest ?? 0} label="workout" color="#f97316" icon={Dumbbell}   />
        <StreakCard value={streaks.sleep?.current   ?? 0} best={streaks.sleep?.longest   ?? 0} label="sleep"   color="#6366f1" icon={Moon}       />
      </div>

      {/* ── Today at a glance ── */}
      {data.snapshot && <SnapshotSection snap={data.snapshot} />}

      {/* ── Task progress ── */}
      {stats.totalTasks > 0 && (
        <div className="card px-4 py-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-sm font-semibold text-head">Today</span>
            <span className="text-sm font-bold text-head tabular-nums">
              {stats.completedTasks}
              <span style={{ color: '#52525b' }}>/{stats.totalTasks}</span>
            </span>
          </div>
          <div className="h-1 rounded-full w-full" style={{ background: 'var(--s3)' }}>
            <div className="h-1 rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: `rgb(var(--accent-rgb))` }} />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-[11px]" style={{ color: '#52525b' }}>{pct}% complete</span>
            <span className="text-[11px]" style={{ color: '#52525b' }}>{stats.totalJournal} journal entries</span>
          </div>
        </div>
      )}

      {/* ── Focus queue + Due today ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">

        <div className="card px-4 py-4">
          <Section icon={Zap} iconColor="#eab308" title="Focus Queue" action={{ label: 'All', to: '/tasks' }} />
          {priorityQueue.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: '#52525b' }}>All caught up</p>
          ) : (
            <div className="[&>*:last-child]:border-0">
              {priorityQueue.slice(0, 4).map(t => <TaskRow key={t.id} task={t} />)}
            </div>
          )}
        </div>

        <div className="card px-4 py-4">
          <Section icon={Clock} iconColor="#ef4444" title="Due Today" count={pendingToday.length} />
          {pendingToday.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: '#52525b' }}>Clear for today</p>
          ) : (
            <div className="[&>*:last-child]:border-0">
              {pendingToday.slice(0, 4).map(t => <TaskRow key={t.id} task={t} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── Journal ── */}
      <div className="card px-4 py-4">
        <Section icon={BookOpen} iconColor="#a855f7" title="Today's Journal"
          action={{ label: journal ? 'Edit' : 'Write', to: '/journal' }} />
        {journal ? (
          <div className="space-y-2">
            {journal.mood && (
              <div className="flex items-center gap-2">
                <span className="text-lg leading-none">{MOOD_EMOJI[journal.mood]}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: MOOD_COLOR[journal.mood], background: MOOD_COLOR[journal.mood] + '18' }}>
                  {MOOD_LABEL[journal.mood]}
                </span>
              </div>
            )}
            <p className="text-sm leading-relaxed line-clamp-3" style={{ color: '#a1a1aa' }}>
              {journal.content}
            </p>
          </div>
        ) : (
          <Link to="/journal"
            className="flex items-center justify-center gap-2 py-4 text-sm font-medium rounded-lg transition-colors"
            style={{ color: 'rgb(var(--accent-rgb-light))', background: 'rgb(var(--accent-rgb) / 0.06)' }}>
            Write today's entry <ArrowRight size={13} />
          </Link>
        )}
      </div>

      {/* ── 100% badge ── */}
      {pct === 100 && stats.totalTasks > 0 && (
        <div className="card px-4 py-4 text-center" style={{ borderColor: 'rgba(34,197,94,0.15)' }}>
          <p className="text-xl mb-1">🏆</p>
          <p className="text-sm font-bold" style={{ color: '#22c55e' }}>All done for today</p>
        </div>
      )}

    </div>
  );
}
