import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Flame, CheckSquare, BookOpen, Zap, ArrowRight, Clock } from 'lucide-react';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import { useAuth } from '../contexts/AuthContext';
import type { DashboardData, Task } from '../types';
import { format } from 'date-fns';

/* ── Priority config ── */
const P: Record<string, { dot: string; label: string; bar: string }> = {
  urgent: { dot: 'bg-red-500',    label: 'text-red-400',    bar: 'bg-red-500'    },
  high:   { dot: 'bg-orange-400', label: 'text-orange-400', bar: 'bg-orange-400' },
  medium: { dot: 'bg-yellow-400', label: 'text-yellow-400', bar: 'bg-yellow-400' },
  low:    { dot: 'bg-emerald-500',label: 'text-emerald-400',bar: 'bg-emerald-500'},
};

const MOOD_EMOJI = ['', '😞', '😕', '😐', '🙂', '😄'];
const MOOD_LABEL = ['', 'Terrible', 'Bad', 'Okay', 'Good', 'Great'];
const MOOD_COLOR = ['', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#10b981'];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'night owl';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'evening';
}

/* ── Streak arc ring ── */
function StreakRing({
  current, longest, label, color, icon: Icon,
}: { current: number; longest: number; label: string; color: string; icon: any }) {
  const max = Math.max(longest, current, 7);
  const pct = max > 0 ? current / max : 0;
  const size = 56; const r = 22; const stroke = 5;
  const circ = 2 * Math.PI * r;
  const offset = circ - pct * circ;

  return (
    <div className="card p-4 flex flex-col items-center gap-2 relative overflow-hidden">
      {/* Glow blob */}
      <div className="absolute inset-0 opacity-[0.06] rounded-2xl"
        style={{ background: `radial-gradient(circle at 50% 30%, ${color}, transparent 70%)` }} />

      <div className="relative">
        <svg width={size} height={size}>
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke="rgba(148,163,184,0.08)" strokeWidth={stroke} />
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke={color} strokeWidth={stroke}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.6s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-white">{current}</span>
        </div>
      </div>

      <div className="text-center">
        <div className="flex items-center gap-1 justify-center">
          <Icon size={11} style={{ color }} />
          <span className="text-xs font-semibold" style={{ color }}>{label}</span>
        </div>
        <p className="text-[10px] text-slate-500 mt-0.5">best {longest}</p>
      </div>
    </div>
  );
}

/* ── Focus task row ── */
function FocusRow({ task }: { task: Task }) {
  const cfg = P[task.priority] ?? P.medium;
  const isOverdue = task.due_date && task.due_date < new Date().toISOString().slice(0, 10);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0"
      style={{ borderColor: 'rgba(148,163,184,0.06)' }}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate leading-snug">{task.title}</p>
        {task.due_date && (
          <p className={`text-[11px] mt-0.5 ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
            {isOverdue ? '⚠ overdue' : `due ${task.due_date}`}
          </p>
        )}
      </div>
      <span className={`text-[11px] font-semibold shrink-0 ${cfg.label}`}>
        {task.priority}
      </span>
    </div>
  );
}

/* ── Progress bar ── */
function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-xs text-slate-400">Today's tasks</span>
        <span className="text-xs font-semibold text-white">{done}<span className="text-slate-500">/{total}</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, rgb(var(--accent-rgb-dark)), rgb(var(--accent-rgb-light)))` }}
        />
      </div>
      <p className="text-[11px] text-slate-500">{pct}% complete</p>
    </div>
  );
}

/* ── Main ── */
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
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: 'rgb(var(--accent-rgb))', borderTopColor: 'transparent' }} />
    </div>
  );

  const { streaks, stats, priorityQueue, pendingToday, journal } = data;
  const greeting = getGreeting();
  const today = format(new Date(), 'EEEE, d MMMM yyyy');
  const remaining = stats.totalTasks - stats.completedTasks;
  const completionRate = stats.totalTasks > 0
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;

  return (
    <div className="space-y-4 max-w-2xl">

      {/* ── Hero greeting ── */}
      <div className="relative overflow-hidden card px-5 py-5">
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-10 blur-3xl"
          style={{ background: `rgb(var(--accent-rgb))` }} />
        <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-1">
          {today}
        </p>
        <h1 className="text-2xl font-bold text-white">
          Good {greeting}{user?.username ? `, ${user.username}` : ''} 👋
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          {remaining === 0 && stats.totalTasks > 0
            ? 'All tasks done — great work today.'
            : remaining > 0
            ? `${remaining} task${remaining !== 1 ? 's' : ''} left today.`
            : 'Nothing on the list — add a task to get started.'}
        </p>
      </div>

      {/* ── Streak rings ── */}
      <div className="grid grid-cols-3 gap-3">
        <StreakRing label="Tasks"   current={streaks.tasks?.current   ?? 0} longest={streaks.tasks?.longest   ?? 0} color="#6366f1" icon={CheckSquare} />
        <StreakRing label="Journal" current={streaks.journal?.current ?? 0} longest={streaks.journal?.longest ?? 0} color="#a855f7" icon={BookOpen} />
        <StreakRing label="Overall" current={streaks.overall?.current ?? 0} longest={streaks.overall?.longest ?? 0} color="#f97316" icon={Flame} />
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { val: stats.completedTasks, label: 'Done',     icon: CheckSquare, color: '#22c55e' },
          { val: remaining,             label: 'Remaining',icon: Clock,       color: '#f59e0b' },
          { val: stats.totalJournal,   label: 'Journal',  icon: BookOpen,    color: '#a855f7' },
        ].map(({ val, label, icon: Icon, color }) => (
          <div key={label} className="card px-3 py-3.5 flex flex-col items-center gap-1.5">
            <Icon size={14} style={{ color }} />
            <span className="text-xl font-bold text-white tabular-nums">{val}</span>
            <span className="text-[11px] text-slate-500 font-medium">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Task progress ── */}
      {stats.totalTasks > 0 && (
        <div className="card px-5 py-4">
          <ProgressBar done={stats.completedTasks} total={stats.totalTasks} />
        </div>
      )}

      {/* ── Focus queue + Due today ── */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* Focus Queue */}
        <div className="card px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md flex items-center justify-center"
                style={{ background: 'rgba(234,179,8,0.15)' }}>
                <Zap size={11} className="text-yellow-400" />
              </div>
              <span className="text-sm font-semibold text-white">Focus Queue</span>
            </div>
            <Link to="/tasks" className="flex items-center gap-1 text-[11px] font-medium"
              style={{ color: 'rgb(var(--accent-rgb-light))' }}>
              All <ArrowRight size={11} />
            </Link>
          </div>
          {priorityQueue.length === 0 ? (
            <div className="py-5 text-center">
              <p className="text-2xl mb-1">✅</p>
              <p className="text-xs text-slate-500">All caught up!</p>
            </div>
          ) : (
            priorityQueue.slice(0, 4).map(t => <FocusRow key={t.id} task={t} />)
          )}
        </div>

        {/* Due Today */}
        <div className="card px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.15)' }}>
                <Clock size={11} className="text-red-400" />
              </div>
              <span className="text-sm font-semibold text-white">Due Today</span>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(148,163,184,0.08)', color: pendingToday.length > 0 ? '#f87171' : '#64748b' }}>
              {pendingToday.length}
            </span>
          </div>
          {pendingToday.length === 0 ? (
            <div className="py-5 text-center">
              <p className="text-2xl mb-1">🗓️</p>
              <p className="text-xs text-slate-500">Nothing due today</p>
            </div>
          ) : (
            pendingToday.slice(0, 4).map(t => <FocusRow key={t.id} task={t} />)
          )}
        </div>
      </div>

      {/* ── Today's Journal ── */}
      <div className="card px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md flex items-center justify-center"
              style={{ background: 'rgba(168,85,247,0.15)' }}>
              <BookOpen size={11} className="text-purple-400" />
            </div>
            <span className="text-sm font-semibold text-white">Journal</span>
          </div>
          <Link to="/journal" className="flex items-center gap-1 text-[11px] font-medium"
            style={{ color: 'rgb(var(--accent-rgb-light))' }}>
            {journal ? 'Edit' : 'Write'} <ArrowRight size={11} />
          </Link>
        </div>

        {journal ? (
          <div className="space-y-2">
            {journal.mood && (
              <div className="flex items-center gap-2">
                <span className="text-xl">{MOOD_EMOJI[journal.mood]}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: MOOD_COLOR[journal.mood], background: MOOD_COLOR[journal.mood] + '22' }}>
                  {MOOD_LABEL[journal.mood]}
                </span>
              </div>
            )}
            <p className="text-sm text-slate-300 line-clamp-3 leading-relaxed">{journal.content}</p>
          </div>
        ) : (
          <div className="py-4 text-center space-y-3">
            <p className="text-3xl">📝</p>
            <p className="text-xs text-slate-500">No entry yet today</p>
            <Link to="/journal"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-opacity hover:opacity-80"
              style={{ background: 'rgb(var(--accent-rgb) / 0.15)', color: 'rgb(var(--accent-rgb-light))' }}>
              Write today's entry <ArrowRight size={11} />
            </Link>
          </div>
        )}
      </div>

      {/* ── Completion badge ── */}
      {completionRate === 100 && stats.totalTasks > 0 && (
        <div className="card px-5 py-4 text-center"
          style={{ borderColor: 'rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.05)' }}>
          <p className="text-2xl mb-1">🏆</p>
          <p className="text-sm font-bold text-emerald-400">100% complete today</p>
          <p className="text-xs text-slate-500 mt-0.5">All {stats.totalTasks} tasks done — outstanding work.</p>
        </div>
      )}
    </div>
  );
}
