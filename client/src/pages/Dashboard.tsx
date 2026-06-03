import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Flame, CheckSquare, BookOpen, Zap, ArrowRight, Dumbbell, Moon,
  Plus, Target,
  Wallet, AlertTriangle, ArrowUp, Minus, ChevronDown as ChevDown,
  TrendingUp, Coffee, Activity, BarChart2, CheckCircle2,
  Award, ChevronRight, Swords,
} from 'lucide-react';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import { useAuth } from '../contexts/AuthContext';
import type { DashboardData, DashboardSnapshot, PointsSummary, Task } from '../types';
import { format } from 'date-fns';

/* ── Priority config ── */
const PRIORITY: Record<string, { color: string; icon: any; label: string }> = {
  urgent: { color: '#f43f5e', icon: AlertTriangle, label: 'URGENT' },
  high:   { color: '#f97316', icon: ArrowUp,       label: 'HIGH'   },
  medium: { color: '#eab308', icon: Minus,         label: 'MED'    },
  low:    { color: '#22c55e', icon: ChevDown,      label: 'LOW'    },
};

const MOOD_LABEL = ['', 'Terrible', 'Bad', 'Okay', 'Good', 'Great'];
const MOOD_COLOR = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];
const LEVEL_COLORS = ['','#6366f1','#3b82f6','#22c55e','#f97316','#ef4444','#a855f7'];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/* ── Section label ── */
function SysLabel({ icon: Icon, text, color }: { icon?: any; text: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      {Icon && <Icon size={11} style={{ color: color ?? 'var(--cyan)', opacity: 0.8 }} />}
      <span className="sys-label" style={{ color: color ? `${color}cc` : undefined }}>{text}</span>
    </div>
  );
}

/* ── Mission card (task as quest) ── */
function MissionCard({ task, onComplete }: { task: Task; onComplete: (id: number) => void }) {
  const p = PRIORITY[task.priority] ?? PRIORITY.low;
  const PIcon = p.icon;
  const isOverdue = task.due_date && task.due_date < new Date().toISOString().slice(0, 10);
  const [completing, setCompleting] = useState(false);

  async function complete() {
    setCompleting(true);
    try {
      await api.patch(`/tasks/${task.id}`, { status: 'completed' });
      onComplete(task.id);
    } catch (_) { setCompleting(false); }
  }

  return (
    <div className="mission-card group">
      {/* Priority indicator */}
      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
        <div className="w-1 h-8 rounded-full shrink-0" style={{ background: p.color, boxShadow: `0 0 5px ${p.color}60` }} />
        <PIcon size={11} style={{ color: p.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-head truncate leading-tight">{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded-full"
            style={{ background: `${p.color}18`, color: p.color }}>{p.label}</span>
          {task.due_date && (
            <span className="text-[10px] flex items-center gap-1"
              style={{ color: isOverdue ? '#f87171' : 'var(--t-faint)' }}>
              {isOverdue && <AlertTriangle size={8} />}
              {task.due_date}
            </span>
          )}
        </div>
      </div>
      {/* Complete button */}
      <button
        onClick={complete}
        disabled={completing}
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center tap opacity-0 group-hover:opacity-100 transition-all"
        style={{ background: '#22c55e15', border: '1px solid #22c55e30', color: '#22c55e' }}
        title="Complete mission">
        {completing
          ? <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
          : <CheckCircle2 size={14} />}
      </button>
    </div>
  );
}

/* ── Stat duration helper ── */
function fmtDuration(mins: number | null | undefined) {
  if (mins == null) return null;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/* ── Snapshot cards ── */
function SnapshotSection({ snap }: { snap: DashboardSnapshot }) {
  const cards = [
    {
      to: '/habits', icon: Target, color: '#f97316',
      label: 'Habits',
      primary: snap.habitsTotal > 0 ? `${snap.habitsDone}/${snap.habitsTotal}` : '—',
      sub: snap.habitsTotal > 0 ? `${Math.round((snap.habitsDone / snap.habitsTotal) * 100)}% done` : 'None set',
    },
    {
      to: '/sleep', icon: Moon, color: '#818cf8',
      label: 'Sleep',
      primary: fmtDuration(snap.lastSleep?.duration_minutes) ?? '—',
      sub: snap.lastSleep?.quality ? `Quality ${snap.lastSleep.quality}/5` : snap.lastSleep?.date ?? 'Not logged',
    },
    {
      to: '/workout', icon: Dumbbell, color: '#ef4444',
      label: 'Workout',
      primary: snap.lastWorkout ? 'Done' : '—',
      sub: snap.lastWorkout ? (snap.lastWorkout.name ?? snap.lastWorkout.date) : 'No session',
    },
    {
      to: '/diet', icon: Coffee, color: '#22c55e',
      label: 'Calories',
      primary: snap.todayCalories != null ? `${snap.todayCalories}` : '—',
      sub: snap.todayCalories != null ? `${snap.todayProtein ?? 0}g protein` : 'Not logged',
    },
    {
      to: '/body', icon: Activity, color: '#06b6d4',
      label: 'Body',
      primary: snap.latestBody?.weight_kg != null ? `${snap.latestBody.weight_kg}kg` : '—',
      sub: snap.latestBody?.body_fat_pct != null ? `${snap.latestBody.body_fat_pct}% fat` : snap.latestBody?.date ?? 'No data',
    },
    {
      to: '/finance', icon: Wallet, color: '#f59e0b',
      label: 'Finance',
      primary: snap.financeIncome != null || snap.financeExpenses != null
        ? `${(snap.financeIncome ?? 0) - (snap.financeExpenses ?? 0) >= 0 ? '+' : ''}${Math.round(((snap.financeIncome ?? 0) - (snap.financeExpenses ?? 0)) * 10) / 10}`
        : '—',
      sub: snap.financeIncome != null ? `↑${snap.financeIncome} ↓${snap.financeExpenses ?? 0}` : 'No entries',
    },
  ];

  return (
    <div>
      <SysLabel icon={BarChart2} text="System Status" />
      <div className="flex gap-3 overflow-x-auto pb-1 hide-scroll">
        {cards.map(c => (
          <Link key={c.to} to={c.to}
            className="streak-node card-hover glow-card flex flex-col gap-1 no-underline"
            style={{ minWidth: 96, textDecoration: 'none', '--gc': `${c.color}55` } as React.CSSProperties}>
            <c.icon size={13} style={{ color: c.color }} />
            <p className="text-sm font-black text-head tabular-nums font-mono leading-tight mt-1">{c.primary}</p>
            <p className="text-[10px] font-semibold" style={{ color: 'var(--t-faint)' }}>{c.label}</p>
            <p className="text-[9px]" style={{ color: 'var(--t-faint)', opacity: 0.7 }}>{c.sub}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Rank/XP panel ── */
function RankPanel({ pts }: { pts: PointsSummary }) {
  const color = LEVEL_COLORS[pts.level] ?? '#6366f1';
  const [lifeScore, setLifeScore] = useState<number | null>(null);

  useEffect(() => {
    api.get<{ score: number; sectors: number }>('/life/life-score')
      .then(r => setLifeScore(r.data.score))
      .catch(() => {});
    // Refresh every 30s so it tracks sector completions
    const id = setInterval(() => {
      api.get<{ score: number; sectors: number }>('/life/life-score')
        .then(r => setLifeScore(r.data.score))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const lifeColor = lifeScore === null ? '#6366f1'
    : lifeScore >= 70 ? '#22c55e'
    : lifeScore >= 40 ? '#f59e0b'
    : '#a855f7';

  return (
    <div className="cmd-card border-glow-anim px-5 py-4 relative overflow-hidden">
      {/* Shimmer sheen */}
      <div className="shimmer-slide" />
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${color}18`, border: `1px solid ${color}35` }}>
            <Award size={18} style={{ color }} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full tracking-widest"
                style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
                LVL {pts.level}
              </span>
              <span className="text-sm font-bold" style={{ color }}>{pts.levelLabel}</span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--t-faint)' }}>
              {pts.today > 0 ? (
                <span className="flex items-center gap-1">
                  <Zap size={10} style={{ color: '#f59e0b' }} />
                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>+{pts.today} XP</span>
                  <span>earned today</span>
                </span>
              ) : 'Complete tasks, habits & logs to earn XP'}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-black text-head tabular-nums font-mono">{pts.total.toLocaleString()}</p>
          <p className="text-[10px]" style={{ color: 'var(--t-faint)' }}>total XP</p>
        </div>
      </div>
      {/* XP progress bar */}
      <div className="xp-track mb-1.5">
        <div className="xp-fill bar-fill" style={{ width: `${pts.progressPct}%`, background: color, boxShadow: `0 0 8px ${color}60` }} />
      </div>
      <div className="flex justify-between mb-3">
        <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>{pts.progressPct}% to next level</span>
        <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>
          {pts.nextLevel != null ? `${pts.nextLevel.toLocaleString()} XP needed` : '⚡ Max level'}
        </span>
      </div>
      {/* Life score bar */}
      {lifeScore !== null && (
        <div className="pt-3" style={{ borderTop: '1px solid var(--b)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--t-faint)' }}>
              ✦ Life Score
            </span>
            <span className="text-sm font-black tabular-nums font-mono" style={{ color: lifeColor }}>
              {lifeScore}<span className="text-[10px] opacity-50">/100</span>
            </span>
          </div>
          <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--s3)' }}>
            <div style={{
              height: '100%',
              width: `${lifeScore}%`,
              background: lifeColor,
              boxShadow: `0 0 6px ${lifeColor}80`,
              borderRadius: 99,
              transition: 'width 0.8s ease',
            }} />
          </div>
          <p className="text-[9px] mt-1" style={{ color: 'var(--t-faint)' }}>
            avg of your life sectors — complete tasks to raise it
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Quick actions ── */
const ACTIONS = [
  { to: '/tasks',   icon: Plus,     label: 'New Mission',   color: '#6366f1' },
  { to: '/workout', icon: Dumbbell, label: 'Log Training',  color: '#ef4444' },
  { to: '/sleep',   icon: Moon,     label: 'Log Sleep',     color: '#818cf8' },
  { to: '/journal', icon: BookOpen, label: 'Write Entry',   color: '#a855f7' },
  { to: '/habits',  icon: Target,   label: 'Check Habits',  color: '#f97316' },
  { to: '/finance', icon: Wallet,   label: 'Log Finance',   color: '#f59e0b' },
];

/* ══════════════════════════════════════════════════════════════
   MAIN DASHBOARD
══════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const { user } = useAuth();

  const load = useCallback(async () => {
    const res = await api.get<DashboardData>('/dashboard');
    setData(res.data);
  }, []);

  useEffect(() => { load(); }, [load]);
  useSync(load, 30000);

  // Local state for optimistic task completion
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());

  function handleComplete(id: number) {
    setCompletedIds(s => new Set([...s, id]));
  }

  if (!data) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--cyan)', borderTopColor: 'transparent' }} />
        <p className="sys-label">Loading command center…</p>
      </div>
    </div>
  );

  const { streaks, stats, priorityQueue, pendingToday, journal } = data;
  const remaining = stats.totalTasks - stats.completedTasks;
  const pct = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;

  // Filter out optimistically completed tasks
  const activeMissions = [...priorityQueue, ...pendingToday]
    .filter((t, idx, self) => self.findIndex(x => x.id === t.id) === idx) // dedupe
    .filter(t => !completedIds.has(t.id))
    .sort((a, b) => {
      const order = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority as keyof typeof order] ?? 4) - (order[b.priority as keyof typeof order] ?? 4);
    })
    .slice(0, 6);

  const streakData = [
    { label: 'Overall', value: streaks.overall?.current ?? 0, best: streaks.overall?.longest ?? 0, color: '#f97316', icon: Flame },
    { label: 'Tasks',   value: streaks.tasks?.current   ?? 0, best: streaks.tasks?.longest   ?? 0, color: '#6366f1', icon: CheckSquare },
    { label: 'Journal', value: streaks.journal?.current ?? 0, best: streaks.journal?.longest ?? 0, color: '#a855f7', icon: BookOpen },
    { label: 'Workout', value: streaks.workout?.current ?? 0, best: streaks.workout?.longest ?? 0, color: '#ef4444', icon: Dumbbell },
    { label: 'Sleep',   value: streaks.sleep?.current   ?? 0, best: streaks.sleep?.longest   ?? 0, color: '#818cf8', icon: Moon },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-8 anim-page pb-10"
      style={{ '--accent-rgb': '57 255 20' } as React.CSSProperties}>

      {/* ── WAR ROOM HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl mb-5"
        style={{ background: 'var(--hero-bg)', border: '1px solid #39ff1425', minHeight: 120 }}>
        {/* Tactical grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, #39ff1408 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }} />
        {/* Radar arc */}
        <div className="absolute top-3 right-3 pointer-events-none" style={{ width: 70, height: 70 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '1px solid #39ff1430',
            boxShadow: '0 0 8px #39ff1420',
          }} />
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 35, height: 1.5,
            background: 'linear-gradient(90deg, #39ff14, transparent)',
            transformOrigin: 'left center',
            animation: 'radar-rotate 3s linear infinite',
            boxShadow: '0 0 6px #39ff14',
          }} />
          <div style={{ position: 'absolute', inset: 10, borderRadius: '50%', border: '1px solid #39ff1418' }} />
          <div style={{ position: 'absolute', inset: 20, borderRadius: '50%', border: '1px solid #39ff1410' }} />
        </div>
        {/* HUD corners */}
        <div className="absolute top-0 left-0 pointer-events-none"
          style={{ width: 14, height: 14, borderTop: '1.5px solid #39ff14', borderLeft: '1.5px solid #39ff14', opacity: 0.7 }} />
        <div className="absolute top-0 right-0 pointer-events-none"
          style={{ width: 14, height: 14, borderTop: '1.5px solid #39ff14', borderRight: '1.5px solid #39ff14', opacity: 0.7 }} />
        <div className="absolute bottom-0 left-0 pointer-events-none"
          style={{ width: 14, height: 14, borderBottom: '1.5px solid #39ff14', borderLeft: '1.5px solid #39ff14', opacity: 0.7 }} />
        <div className="absolute bottom-0 right-0 pointer-events-none"
          style={{ width: 14, height: 14, borderBottom: '1.5px solid #39ff14', borderRight: '1.5px solid #39ff14', opacity: 0.7 }} />
        {/* Content */}
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.35em]" style={{ color: '#39ff14', opacity: 0.6, textShadow: '0 0 8px #39ff14' }}>SYS://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">COMMAND_CENTER</span>
            <span className="cursor-blink font-mono" style={{ color: '#39ff14', fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white leading-none"
            style={{ textShadow: '0 0 30px #39ff1440' }}>
            COMMAND CENTER
          </h1>
          <p className="font-mono text-[11px] mt-1" style={{ color: '#39ff14', opacity: 0.5 }}>
            {'// MISSION CONTROL — GOOD '}
            {new Date().getHours() < 12 ? 'MORNING' : new Date().getHours() < 17 ? 'AFTERNOON' : 'EVENING'}
            {', OPERATOR'}
          </p>
          {/* Neon bottom edge */}
          <div className="absolute bottom-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, #39ff1450, transparent)' }} />
        </div>
      </div>

      {/* Cyberpunk body overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(57,255,20,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      <div className="space-y-8" style={{ position: 'relative', zIndex: 1 }}>

      {/* ═══════════════════════════════════════ HEADER */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <p className="sys-label mb-1.5 flex items-center gap-1.5">
              <Swords size={10} style={{ color: 'var(--cyan)', opacity: 0.8 }} />
              {format(new Date(), 'EEEE · d MMMM yyyy').toUpperCase()}
            </p>
            <h1 className="text-2xl font-black text-head tracking-tight">
              Good {getGreeting()}{user?.username ? `, ${user.username}` : ''}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--t-faint)' }}>
              {pct === 100 && stats.totalTasks > 0
                ? <span className="flex items-center gap-1.5"><Award size={12} style={{ color: '#22c55e' }} /><span style={{ color: '#22c55e' }}>All missions cleared</span></span>
                : remaining > 0
                ? `${remaining} active mission${remaining !== 1 ? 's' : ''} pending`
                : 'No missions yet — add something to conquer'}
            </p>
          </div>
          {data.points && data.points.today > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0 badge-pop"
              style={{ background: '#f59e0b18', border: '1px solid #f59e0b35' }}>
              <Zap size={11} style={{ color: '#f59e0b' }} />
              <span className="text-xs font-black" style={{ color: '#f59e0b' }}>+{data.points.today} XP</span>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════ RANK / XP */}
      {data.points && <RankPanel pts={data.points} />}

      {/* ═══════════════════════════════════════ MISSIONS + QUICK ACTIONS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

        {/* Mission board */}
        <div className="cmd-card overflow-hidden">
          <div className="px-5 pt-5 pb-2 flex items-center justify-between">
            <SysLabel icon={Target} text={`Active Missions (${activeMissions.length})`} />
            <Link to="/tasks"
              className="flex items-center gap-1 text-[11px] font-bold tap"
              style={{ color: 'rgb(var(--accent-rgb-light))', textDecoration: 'none' }}>
              All <ChevronRight size={11} />
            </Link>
          </div>
          {activeMissions.length === 0 ? (
            <div className="px-4 pb-4 flex flex-col items-center gap-2 py-6">
              <CheckCircle2 size={28} style={{ color: '#22c55e', opacity: 0.5 }} />
              <p className="text-sm font-semibold" style={{ color: '#22c55e' }}>All clear, operative</p>
              <Link to="/tasks"
                className="flex items-center gap-1 text-[11px] font-bold tap px-3 py-1.5 rounded-lg"
                style={{ background: 'rgb(var(--accent-rgb) / 0.1)', color: 'rgb(var(--accent-rgb-light))', textDecoration: 'none', border: '1px solid rgb(var(--accent-rgb) / 0.2)' }}>
                <Plus size={11} /> Add mission
              </Link>
            </div>
          ) : (
            <div className="pb-2">
              {activeMissions.map(t => <MissionCard key={t.id} task={t} onComplete={handleComplete} />)}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div>
          <SysLabel icon={Zap} text="Quick Actions" color="#f59e0b" />
          <div className="grid grid-cols-3 gap-3">
            {ACTIONS.map(a => (
              <Link key={a.to} to={a.to} className="action-tile icon-bounce-hover"
                style={{ '--gc': `${a.color}55` } as React.CSSProperties}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bounce-icon"
                  style={{ background: `${a.color}18`, border: `1px solid ${a.color}30` }}>
                  <a.icon size={15} style={{ color: a.color }} />
                </div>
                <span className="text-[10px] font-semibold text-center leading-tight" style={{ color: 'var(--t-muted)' }}>
                  {a.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════ STREAK INTEL */}
      <div>
        <SysLabel icon={TrendingUp} text="// Streak Intel" color="#f97316" />
        <div className="flex gap-3 overflow-x-auto pb-1 hide-scroll">
          {streakData.map((s, i) => (
            <div key={s.label} className="streak-node card-hover glow-card"
              style={{ animationDelay: `${i * 50}ms`, '--gc': `${s.color}55` } as React.CSSProperties}>
              <s.icon size={13} style={{ color: s.color, marginBottom: 4 }} />
              <p className="text-2xl font-black font-mono tabular-nums" style={{ color: s.color, textShadow: `0 0 10px ${s.color}60` }}>
                {s.value}
              </p>
              <p className="text-[9px] font-bold tracking-wider uppercase mt-0.5" style={{ color: 'var(--t-faint)' }}>{s.label}</p>
              <p className="text-[9px]" style={{ color: 'var(--t-faint)', opacity: 0.6 }}>best {s.best}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════ SYSTEM STATUS */}
      {data.snapshot && <SnapshotSection snap={data.snapshot} />}

      {/* ═══════════════════════════════════════ JOURNAL */}
      <div className="cmd-card overflow-hidden">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <SysLabel icon={BookOpen} text="Today's Journal" color="#a855f7" />
          <Link to="/journal"
            className="flex items-center gap-1 text-[11px] font-bold tap"
            style={{ color: 'rgb(var(--accent-rgb-light))', textDecoration: 'none' }}>
            {journal ? 'Edit' : 'Write'} <ChevronRight size={11} />
          </Link>
        </div>
        {journal ? (
          <div className="px-4 pb-4 space-y-2">
            {journal.mood && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                  style={{ background: MOOD_COLOR[journal.mood] + '20', border: `1px solid ${MOOD_COLOR[journal.mood]}30` }}>
                  <span className="text-[11px] font-black" style={{ color: MOOD_COLOR[journal.mood] }}>{journal.mood}</span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: MOOD_COLOR[journal.mood], background: MOOD_COLOR[journal.mood] + '15' }}>
                  {MOOD_LABEL[journal.mood]}
                </span>
              </div>
            )}
            <p className="text-sm leading-relaxed line-clamp-3" style={{ color: 'var(--t-muted)' }}>{journal.content}</p>
          </div>
        ) : (
          <Link to="/journal"
            className="mx-4 mb-4 flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-semibold tap"
            style={{ color: 'rgb(var(--accent-rgb-light))', background: 'rgb(var(--accent-rgb) / 0.05)', border: '1px solid rgb(var(--accent-rgb) / 0.12)', textDecoration: 'none' }}>
            <BookOpen size={14} /> Write today's entry
            <ArrowRight size={13} />
          </Link>
        )}
      </div>

      {/* ═══════════════════════════════════════ COMPLETION BANNER */}
      {pct === 100 && stats.totalTasks > 0 && (
        <div className="cmd-card px-5 py-4 text-center"
          style={{ borderColor: '#22c55e25', background: 'linear-gradient(135deg, var(--s1) 0%, #052010 100%)' }}>
          <div className="flex items-center justify-center gap-2 mb-1">
            <Award size={20} style={{ color: '#22c55e' }} />
            <p className="text-sm font-black" style={{ color: '#22c55e' }}>All missions cleared for today</p>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--t-faint)' }}>Outstanding work, operative.</p>
        </div>
      )}

      </div>{/* end relative zIndex wrapper */}

    </div>
  );
}
