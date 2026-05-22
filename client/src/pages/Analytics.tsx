import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailyData {
  date: string; label: string;
  tasks_created: number; tasks_completed: number; task_pct: number | null;
  journal: number; mood: number | null;
  habits_done: number; habits_total: number; habit_pct: number | null;
  sleep_hrs: number | null; workouts: number; points: number;
}

interface MeSummary {
  meritScore: number; rank: string; rankColor: string; rankLabel: string;
  totalPoints: number;
  breakdown?: { statScore: number; streakScore: number; skillScore: number; claimScore: number; ptsScore: number };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT = '#60a5fa';

const RANK_TIERS = [
  { rank: 'E',  min: 0,  next: 12, color: '#6b7280', label: 'E-Class Hunter' },
  { rank: 'D',  min: 12, next: 26, color: '#3b82f6', label: 'D-Class Hunter' },
  { rank: 'C',  min: 26, next: 42, color: '#22c55e', label: 'C-Class Hunter' },
  { rank: 'B',  min: 42, next: 58, color: '#a855f7', label: 'B-Class Hunter' },
  { rank: 'A',  min: 58, next: 74, color: '#f97316', label: 'A-Class Hunter' },
  { rank: 'S',  min: 74, next: 88, color: '#ef4444', label: 'S-Class Hunter' },
  { rank: 'S+', min: 88, next: 100, color: '#e2c97e', label: 'Shadow Monarch' },
];

const MOOD_LABELS = ['', 'ROUGH', 'LOW', 'OKAY', 'GOOD', 'GREAT'];
const MOOD_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];

const TICK  = { fill: '#52525b', fontSize: 10, fontFamily: 'monospace' };
const TICK_S = { fill: '#3f3f46', fontSize: 9,  fontFamily: 'monospace' };

// ── Shared UI ─────────────────────────────────────────────────────────────────

function HudCard({ children, accent = ACCENT, className = '' }: {
  children: React.ReactNode; accent?: string; className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{ background: 'var(--hero-bg)', border: `1px solid ${accent}18`,
        boxShadow: `0 0 24px ${accent}07` }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: `repeating-linear-gradient(0deg,transparent,transparent 3px,${accent}02 3px,${accent}02 4px)` }} />
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg,transparent,${accent}55,transparent)`, boxShadow: `0 0 5px ${accent}` }} />
      {([['top-0 left-0',{borderTop:`1.5px solid ${accent}`,borderLeft:`1.5px solid ${accent}`}],
         ['top-0 right-0',{borderTop:`1.5px solid ${accent}`,borderRight:`1.5px solid ${accent}`}],
         ['bottom-0 left-0',{borderBottom:`1.5px solid ${accent}`,borderLeft:`1.5px solid ${accent}`}],
         ['bottom-0 right-0',{borderBottom:`1.5px solid ${accent}`,borderRight:`1.5px solid ${accent}`}],
      ] as [string, React.CSSProperties][]).map(([pos, s], i) => (
        <div key={i} className={`absolute ${pos} pointer-events-none`}
          style={{ width: 10, height: 10, opacity: 0.45, ...s }} />
      ))}
      <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg,transparent,${accent}22,transparent)` }} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function SectionLabel({ text, accent = ACCENT }: { text: string; accent?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-0.5 h-4 rounded-full flex-shrink-0"
        style={{ background: accent, boxShadow: `0 0 6px ${accent}` }} />
      <span className="text-[10px] font-black tracking-[0.22em] font-mono uppercase"
        style={{ color: accent, opacity: 0.65 }}>{text}</span>
    </div>
  );
}

function Tooltip2({ active, payload, label, accent = ACCENT }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'rgba(0,0,0,0.93)', border: `1px solid ${accent}30`,
      borderRadius: 8, padding: '7px 11px', fontSize: 11, boxShadow: `0 0 14px ${accent}18` }}>
      <p style={{ color: accent, fontFamily: 'monospace', fontWeight: 900,
        letterSpacing: '0.1em', marginBottom: 3, opacity: 0.8 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || 'var(--t-head)', fontFamily: 'monospace', marginBottom: 1 }}>
          <span style={{ opacity: 0.55 }}>{p.name}: </span>
          <span style={{ fontWeight: 900 }}>{p.value ?? '—'}</span>
        </p>
      ))}
    </div>
  );
}

// ── Range picker ──────────────────────────────────────────────────────────────

const RANGES = [
  { label: '7D',  days: 7  },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

function RangePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {RANGES.map(r => (
        <button key={r.days}
          className="tap px-3 py-1.5 rounded-lg text-[11px] font-black font-mono tracking-widest"
          style={value === r.days
            ? { background: `${ACCENT}20`, color: ACCENT, border: `1px solid ${ACCENT}40`,
                boxShadow: `0 0 8px ${ACCENT}20` }
            : { background: 'var(--s3)', color: 'var(--t-faint)', border: '1px solid transparent' }}
          onClick={() => onChange(r.days)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

// ── DataParticles ─────────────────────────────────────────────────────────────

function DataParticles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: 0.12 }}>
      {[...Array(12)].map((_, i) => (
        <div key={i} className="absolute w-px"
          style={{ left: `${8 + i * 7.5}%`, top: 0, bottom: 0,
            background: `linear-gradient(to bottom,transparent,${ACCENT},transparent)`,
            animation: `data-scroll ${2 + (i % 3) * 0.8}s linear ${i * 200}ms infinite` }} />
      ))}
    </div>
  );
}

// ── Rank Card ─────────────────────────────────────────────────────────────────

function RankCard({ me }: { me: MeSummary | null }) {
  if (!me) return null;
  const tier = RANK_TIERS.find(t => me.rank === t.rank) ?? RANK_TIERS[0];
  const next = RANK_TIERS.find(t => t.min === tier.next);
  const pct  = tier.next > tier.min
    ? Math.min(100, Math.round(((me.meritScore - tier.min) / (tier.next - tier.min)) * 100))
    : 100;
  const bd   = me.breakdown;

  return (
    <HudCard accent={tier.color}>
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[9px] font-black tracking-[0.25em] font-mono mb-0.5"
              style={{ color: tier.color, opacity: 0.55 }}>HUNTER_RANK://</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black font-mono leading-none"
                style={{ color: tier.color, textShadow: `0 0 24px ${tier.color}60` }}>
                {me.rank}
              </span>
              <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--t-muted)' }}>
                {tier.label}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black font-mono leading-none"
              style={{ color: 'var(--t-head)', textShadow: `0 0 14px ${tier.color}40` }}>
              {me.meritScore}
              <span className="text-sm font-normal opacity-40">/100</span>
            </p>
            <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--t-faint)' }}>
              merit score
            </p>
          </div>
        </div>

        {/* Progress bar to next rank */}
        <div className="mb-3">
          <div className="flex justify-between text-[9px] font-mono mb-1" style={{ color: 'var(--t-faint)', opacity: 0.6 }}>
            <span>{me.rank} · {tier.min}</span>
            {next && <span>{next.rank} at {tier.next} · {tier.next - me.meritScore} to go</span>}
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--s3)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${tier.color}80, ${tier.color})`,
                boxShadow: `0 0 8px ${tier.color}60` }} />
          </div>
          <p className="text-[9px] font-mono mt-0.5 text-right" style={{ color: tier.color, opacity: 0.6 }}>
            {pct}% to next rank
          </p>
        </div>

        {/* Breakdown mini-pills */}
        {bd && (
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'STATS',    val: bd.statScore,   max: 45, color: '#f97316' },
              { label: 'STREAKS',  val: bd.streakScore, max: 15, color: '#22c55e' },
              { label: 'SKILLS',   val: bd.skillScore,  max: 15, color: ACCENT },
              { label: 'CLAIMS',   val: bd.claimScore,  max: 10, color: '#a855f7' },
              { label: 'POINTS',   val: bd.ptsScore,    max: 15, color: '#e2c97e' },
            ].map(b => (
              <div key={b.label} className="flex items-center gap-1 px-2 py-0.5 rounded-md"
                style={{ background: `${b.color}12`, border: `1px solid ${b.color}25` }}>
                <span className="text-[9px] font-black font-mono tracking-wider"
                  style={{ color: b.color, opacity: 0.7 }}>{b.label}</span>
                <span className="text-[10px] font-black font-mono"
                  style={{ color: b.color }}>{b.val}<span className="opacity-40">/{b.max}</span></span>
              </div>
            ))}
          </div>
        )}

        <p className="text-[9px] font-mono mt-2.5" style={{ color: 'var(--t-faint)', opacity: 0.4 }}>
          {me.totalPoints.toLocaleString()} total points accumulated
        </p>
      </div>
    </HudCard>
  );
}

// ── Activity Table ────────────────────────────────────────────────────────────

function ActivityTable({ data }: { data: DailyData[] }) {
  const rows = [...data].reverse().slice(0, 30);

  function pctColor(pct: number | null) {
    if (pct == null) return 'var(--t-faint)';
    if (pct >= 70) return '#22c55e';
    if (pct >= 40) return '#f59e0b';
    return '#ef4444';
  }

  function sleepColor(h: number | null) {
    if (h == null) return 'var(--t-faint)';
    if (h >= 7 && h <= 9) return '#22c55e';
    if (h >= 5.5) return '#f59e0b';
    return '#ef4444';
  }

  return (
    <HudCard accent={ACCENT}>
      <div className="px-4 py-4 overflow-hidden">
        <SectionLabel text="Daily Activity Log" accent={ACCENT} />
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-[11px] font-mono" style={{ borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${ACCENT}20` }}>
                {['DATE', 'TASKS', 'DONE%', 'HABITS', 'SLEEP', 'MOOD', 'PTS'].map(h => (
                  <th key={h} className="text-left pb-2 pr-3 font-black tracking-[0.15em]"
                    style={{ color: ACCENT, opacity: 0.5, fontSize: 9 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isToday = r.date === new Date().toISOString().slice(0, 10);
                return (
                  <tr key={r.date}
                    style={{
                      background: isToday ? `${ACCENT}08` : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                    {/* Date */}
                    <td className="py-1.5 pr-3 font-black"
                      style={{ color: isToday ? ACCENT : 'var(--t-muted)', whiteSpace: 'nowrap' }}>
                      {r.label}{isToday && <span className="ml-1 text-[8px] opacity-60">●</span>}
                    </td>
                    {/* Tasks */}
                    <td className="py-1.5 pr-3" style={{ color: 'var(--t-faint)' }}>
                      <span style={{ color: '#6366f1' }}>{r.tasks_created}</span>
                      <span className="opacity-30 mx-0.5">→</span>
                      <span style={{ color: '#0ea5e9' }}>{r.tasks_completed}</span>
                    </td>
                    {/* Task% */}
                    <td className="py-1.5 pr-3 font-black" style={{ color: pctColor(r.task_pct) }}>
                      {r.task_pct != null ? `${r.task_pct}%` : '—'}
                    </td>
                    {/* Habits */}
                    <td className="py-1.5 pr-3 font-black" style={{ color: pctColor(r.habit_pct) }}>
                      {r.habits_total > 0
                        ? <>{r.habits_done}<span className="opacity-40">/{r.habits_total}</span></>
                        : <span style={{ opacity: 0.25 }}>—</span>}
                    </td>
                    {/* Sleep */}
                    <td className="py-1.5 pr-3 font-black" style={{ color: sleepColor(r.sleep_hrs) }}>
                      {r.sleep_hrs != null ? `${r.sleep_hrs}h` : <span style={{ opacity: 0.25 }}>—</span>}
                    </td>
                    {/* Mood */}
                    <td className="py-1.5 pr-3">
                      {r.mood != null
                        ? <span className="font-black text-[10px]"
                            style={{ color: MOOD_COLORS[r.mood] }}>{MOOD_LABELS[r.mood]}</span>
                        : <span style={{ color: 'var(--t-faint)', opacity: 0.25 }}>—</span>}
                    </td>
                    {/* Points */}
                    <td className="py-1.5 font-black"
                      style={{ color: r.points > 0 ? '#e2c97e' : 'var(--t-faint)', opacity: r.points > 0 ? 1 : 0.3 }}>
                      {r.points > 0 ? `+${r.points}` : '0'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </HudCard>
  );
}

// ── Journal Heatmap ───────────────────────────────────────────────────────────

function JournalHeatmap({ data }: { data: DailyData[] }) {
  const [hovered, setHovered] = useState<DailyData | null>(null);
  const days63 = data.slice(-63);

  return (
    <HudCard accent="#a855f7">
      <div className="px-4 py-4">
        <SectionLabel text="Mood Heatmap — 63 days" accent="#a855f7" />
        <div className="h-5 mb-3 flex items-center">
          {hovered
            ? <p className="text-[11px] font-mono">
                <span style={{ color: '#a855f7', opacity: 0.7 }}>{hovered.date} → </span>
                {hovered.mood != null
                  ? <span style={{ color: MOOD_COLORS[hovered.mood], fontWeight: 900 }}>{MOOD_LABELS[hovered.mood]}</span>
                  : <span style={{ color: 'var(--t-faint)' }}>no entry</span>}
              </p>
            : <p className="text-[10px] font-mono" style={{ color: 'var(--t-faint)', opacity: 0.4 }}>
                // tap a cell to inspect
              </p>}
        </div>
        <div className="flex flex-wrap gap-[3px]">
          {days63.map(d => {
            const isHov = hovered?.date === d.date;
            return (
              <div key={d.date}
                onMouseEnter={() => setHovered(d)} onMouseLeave={() => setHovered(null)}
                onTouchStart={() => setHovered(isHov ? null : d)}
                className="rounded-sm cursor-pointer"
                style={{
                  width: 16, height: 16,
                  backgroundColor: d.mood != null ? MOOD_COLORS[d.mood] : 'var(--s3)',
                  opacity: d.mood != null ? (isHov ? 1 : 0.75) : (isHov ? 0.5 : 0.2),
                  transform: isHov ? 'scale(1.5)' : undefined,
                  boxShadow: isHov && d.mood != null ? `0 0 7px ${MOOD_COLORS[d.mood!]}` : undefined,
                  transition: 'transform 0.1s,opacity 0.1s', zIndex: isHov ? 10 : undefined, position: 'relative',
                }} />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
          {MOOD_LABELS.slice(1).map((lbl, i) => (
            <span key={i} className="flex items-center gap-1 text-[9px] font-black font-mono tracking-widest"
              style={{ color: MOOD_COLORS[i + 1], opacity: 0.65 }}>
              <span className="w-2 h-2 rounded-sm inline-block flex-shrink-0"
                style={{ backgroundColor: MOOD_COLORS[i + 1] }} />{lbl}
            </span>
          ))}
        </div>
      </div>
    </HudCard>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Analytics() {
  const [days, setDays]   = useState(14);
  const [data, setData]   = useState<DailyData[]>([]);
  const [me, setMe]       = useState<MeSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, meRes] = await Promise.all([
        api.get<DailyData[]>(`/analytics/daily?days=${days}`),
        api.get<any>('/me/summary'),
      ]);
      setData(dRes.data);
      setMe(meRes.data);
    } finally { setLoading(false); }
  }, [days]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useSync(fetchAll, 120_000);

  // ── Derived totals ────────────────────────────────────────────────────────

  const totalCreated   = data.reduce((s, d) => s + d.tasks_created,   0);
  const totalCompleted = data.reduce((s, d) => s + d.tasks_completed,  0);
  const totalPts       = data.reduce((s, d) => s + d.points, 0);
  const completionRate = totalCreated > 0
    ? Math.round((totalCompleted / totalCreated) * 100) : 0;

  const habitsValid = data.filter(d => d.habit_pct != null);
  const avgHabit    = habitsValid.length
    ? Math.round(habitsValid.reduce((s, d) => s + (d.habit_pct ?? 0), 0) / habitsValid.length) : null;

  const activedays = data.filter(d =>
    d.tasks_created > 0 || d.journal || d.workouts > 0 || (d.habit_pct ?? 0) > 0
  ).length;

  // Only show sleep/workouts sections if the user has logged them
  const hasSleep   = data.some(d => d.sleep_hrs != null);
  const hasWorkout = data.some(d => d.workouts > 0);
  const hasMood    = data.some(d => d.mood != null);
  const hasHabits  = data.some(d => d.habit_pct != null);
  const hasTasks   = data.some(d => d.tasks_created > 0);

  // X-axis tick interval — avoid crowding on 90D
  const tickInterval = days <= 14 ? 0 : days <= 30 ? 2 : 6;

  return (
    <div className="max-w-2xl mx-auto space-y-4 anim-page pb-10 overflow-x-hidden"
      style={{ '--accent-rgb': '96 165 250' } as React.CSSProperties}>

      {/* Dot grid bg */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{ position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle,rgba(96,165,250,0.05) 1px,transparent 1px)',
          backgroundSize: '24px 24px' }} />
      </div>

      {/* ── Header ── */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{ background: 'var(--hero-bg)', border: '1px solid #60a5fa25', minHeight: 110, zIndex: 1 }}>
        <DataParticles />
        <div className="absolute top-0 left-0 pointer-events-none"
          style={{ width: 14, height: 14, borderTop: '1.5px solid #60a5fa', borderLeft: '1.5px solid #60a5fa', opacity: 0.6 }} />
        <div className="absolute top-0 right-0 pointer-events-none"
          style={{ width: 14, height: 14, borderTop: '1.5px solid #60a5fa', borderRight: '1.5px solid #60a5fa', opacity: 0.6 }} />
        <div className="absolute bottom-0 left-0 pointer-events-none"
          style={{ width: 14, height: 14, borderBottom: '1.5px solid #60a5fa', borderLeft: '1.5px solid #60a5fa', opacity: 0.6 }} />
        <div className="absolute bottom-0 right-0 pointer-events-none"
          style={{ width: 14, height: 14, borderBottom: '1.5px solid #60a5fa', borderRight: '1.5px solid #60a5fa', opacity: 0.6 }} />
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg,transparent,#60a5fa80,transparent)', boxShadow: '0 0 8px #60a5fa' }} />
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: ACCENT, opacity: 0.6 }}>ORACLE://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">DATA_CORE</span>
            <span className="cursor-blink font-mono" style={{ color: ACCENT, fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight leading-none text-white"
            style={{ textShadow: '0 0 30px #60a5fa40' }}>ORACLE CORE</h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: ACCENT, opacity: 0.45 }}>
            // daily signal analysis — behavioral pattern recognition
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg,transparent,#60a5fa25,transparent)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }} className="space-y-4">

      {/* Range picker */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-mono tracking-[0.2em] mb-0.5" style={{ color: ACCENT, opacity: 0.5 }}>TIME_RANGE://</p>
          <p className="text-xs font-mono" style={{ color: 'var(--t-faint)' }}>
            {loading ? '...' : `${days}d · ${activedays} active days`}
          </p>
        </div>
        <RangePicker value={days} onChange={setDays} />
      </div>

      {/* ── Rank card ── */}
      <RankCard me={me} />

      {/* ── Summary metric tiles ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Task completion */}
        <HudCard accent="#0ea5e9">
          <div className="px-3 py-3">
            <p className="text-[9px] font-black tracking-[0.2em] font-mono mb-1" style={{ color: '#0ea5e9', opacity: 0.55 }}>TASK RATE</p>
            <p className="text-3xl font-black font-mono leading-none"
              style={{ color: completionRate >= 70 ? '#22c55e' : completionRate >= 40 ? '#f59e0b' : '#ef4444',
                textShadow: '0 0 14px currentColor' }}>
              {completionRate}<span className="text-base opacity-40">%</span>
            </p>
            <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--t-faint)' }}>
              {totalCompleted}/{totalCreated} tasks done
            </p>
          </div>
        </HudCard>
        {/* Habit consistency */}
        <HudCard accent="#22c55e">
          <div className="px-3 py-3">
            <p className="text-[9px] font-black tracking-[0.2em] font-mono mb-1" style={{ color: '#22c55e', opacity: 0.55 }}>HABIT RATE</p>
            <p className="text-3xl font-black font-mono leading-none"
              style={{ color: avgHabit != null ? (avgHabit >= 70 ? '#22c55e' : avgHabit >= 40 ? '#f59e0b' : '#ef4444') : '#52525b' }}>
              {avgHabit != null ? <>{avgHabit}<span className="text-base opacity-40">%</span></> : '—'}
            </p>
            <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--t-faint)' }}>avg daily consistency</p>
          </div>
        </HudCard>
        {/* Active days */}
        <HudCard accent="#f97316">
          <div className="px-3 py-3">
            <p className="text-[9px] font-black tracking-[0.2em] font-mono mb-1" style={{ color: '#f97316', opacity: 0.55 }}>ACTIVE DAYS</p>
            <p className="text-3xl font-black font-mono leading-none" style={{ color: 'var(--t-head)' }}>
              {activedays}<span className="text-base opacity-40">/{days}</span>
            </p>
            <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--t-faint)' }}>
              {days > 0 ? Math.round((activedays / days) * 100) : 0}% of period
            </p>
          </div>
        </HudCard>
        {/* Points */}
        <HudCard accent="#e2c97e">
          <div className="px-3 py-3">
            <p className="text-[9px] font-black tracking-[0.2em] font-mono mb-1" style={{ color: '#e2c97e', opacity: 0.55 }}>POINTS EARNED</p>
            <p className="text-3xl font-black font-mono leading-none" style={{ color: '#e2c97e' }}>
              {totalPts.toLocaleString()}
            </p>
            <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--t-faint)' }}>last {days} days</p>
          </div>
        </HudCard>
      </div>

      {/* ── Tasks: daily created vs completed bars ── */}
      {hasTasks && (
        <HudCard accent="#0ea5e9">
          <div className="px-4 py-4 overflow-hidden">
            <SectionLabel text={`Task Creation & Completion — Daily`} accent="#0ea5e9" />
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={data} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor="#6366f1" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="gCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor="#0ea5e9" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.35} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={TICK_S} axisLine={false} tickLine={false}
                  interval={tickInterval} />
                <YAxis allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} />
                <Tooltip content={<Tooltip2 accent="#0ea5e9" />} />
                <Bar dataKey="tasks_created"   name="Created"   fill="url(#gCreated)"   radius={[3,3,0,0]} barSize={days <= 14 ? 10 : 6} />
                <Bar dataKey="tasks_completed" name="Completed" fill="url(#gCompleted)" radius={[3,3,0,0]} barSize={days <= 14 ? 10 : 6} />
                {/* Completion % line on secondary axis — only show if there's data */}
                <Line type="monotone" dataKey="task_pct" name="Done %" yAxisId="pct"
                  stroke="#e2c97e" strokeWidth={1.5} dot={false}
                  activeDot={{ r: 3, fill: '#e2c97e', strokeWidth: 0 }} connectNulls />
                <YAxis yAxisId="pct" orientation="right" domain={[0, 100]}
                  tick={TICK_S} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}%`} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4 mt-2">
              {[['#6366f1','Created'],['#0ea5e9','Completed'],['#e2c97e','Done %']].map(([c,l]) => (
                <span key={l} className="flex items-center gap-1.5 text-[10px] font-mono"
                  style={{ color: 'var(--t-faint)' }}>
                  <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: c as string }} />{l}
                </span>
              ))}
            </div>
          </div>
        </HudCard>
      )}

      {/* ── Performance: task% + habit% composite ── */}
      {(hasTasks || hasHabits) && (
        <HudCard accent={ACCENT}>
          <div className="px-4 py-4 overflow-hidden">
            <SectionLabel text="Performance Score — Daily %" accent={ACCENT} />
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gTaskPct" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gHabitPct" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={TICK_S} axisLine={false} tickLine={false}
                  interval={tickInterval} />
                <YAxis domain={[0, 100]} tick={TICK} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}%`} />
                <Tooltip content={<Tooltip2 accent={ACCENT} />}
                  formatter={(v: any) => [`${v}%`]} />
                <ReferenceLine y={70} stroke="#ffffff08" strokeDasharray="4 3" />
                {hasTasks && (
                  <Area type="monotone" dataKey="task_pct" name="Tasks %"
                    stroke="#0ea5e9" fill="url(#gTaskPct)" strokeWidth={2}
                    dot={false} activeDot={{ r: 4, fill: '#0ea5e9', strokeWidth: 0 }} connectNulls />
                )}
                {hasHabits && (
                  <Area type="monotone" dataKey="habit_pct" name="Habits %"
                    stroke="#22c55e" fill="url(#gHabitPct)" strokeWidth={2}
                    dot={false} activeDot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }} connectNulls />
                )}
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4 mt-2">
              {[hasTasks && ['#0ea5e9','Task completion %'],
                hasHabits && ['#22c55e','Habit consistency %']].filter(Boolean).map(([c, l]: any) => (
                <span key={l} className="flex items-center gap-1.5 text-[10px] font-mono"
                  style={{ color: 'var(--t-faint)' }}>
                  <span className="w-4 h-0.5 rounded-full inline-block"
                    style={{ background: c, boxShadow: `0 0 4px ${c}` }} />{l}
                </span>
              ))}
            </div>
          </div>
        </HudCard>
      )}

      {/* ── Consistency: habit % bars (shows gaps visually) ── */}
      {hasHabits && (
        <HudCard accent="#22c55e">
          <div className="px-4 py-4 overflow-hidden">
            <SectionLabel text="Habit Consistency — Daily" accent="#22c55e" />
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <XAxis dataKey="label" tick={TICK_S} axisLine={false} tickLine={false}
                  interval={tickInterval} />
                <YAxis domain={[0, 100]} tick={TICK} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}%`} />
                <Tooltip content={<Tooltip2 accent="#22c55e" />}
                  formatter={(v: any) => [`${v}%`, 'Habits done']} />
                <ReferenceLine y={70} stroke="#22c55e40" strokeDasharray="4 2"
                  label={{ value: '70%', fill: '#22c55e50', fontSize: 9, fontFamily: 'monospace', position: 'insideTopRight' }} />
                <Bar dataKey="habit_pct" name="Habits %" radius={[3, 3, 0, 0]} barSize={days <= 14 ? 12 : 7}>
                  {data.map((d, i) => {
                    const pct = d.habit_pct ?? 0;
                    const fill = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : pct > 0 ? '#ef4444' : '#27272a';
                    return <Cell key={i} fill={fill} fillOpacity={pct > 0 ? 0.85 : 0.25} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </HudCard>
      )}

      {/* ── Mood trend ── */}
      {hasMood && (
        <HudCard accent="#ec4899">
          <div className="px-4 py-4 overflow-hidden">
            <SectionLabel text="Mood — Daily" accent="#ec4899" />
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data.filter(d => d.mood != null)} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                <XAxis dataKey="label" tick={TICK_S} axisLine={false} tickLine={false}
                  interval={tickInterval} />
                <YAxis domain={[1, 5]} ticks={[1,2,3,4,5]} tick={TICK} axisLine={false} tickLine={false}
                  tickFormatter={v => MOOD_LABELS[v] || ''} width={38} />
                <Tooltip content={<Tooltip2 accent="#ec4899" />}
                  formatter={(v: any) => [MOOD_LABELS[v] || v, 'Mood']} />
                <ReferenceLine y={3} stroke="#ffffff08" strokeDasharray="4 3" />
                <Line type="monotone" dataKey="mood" name="Mood" stroke="#ec4899" strokeWidth={2.5}
                  dot={(props: any) => {
                    const c = MOOD_COLORS[props.payload.mood] || '#ec4899';
                    return <circle key={props.key} cx={props.cx} cy={props.cy} r={4}
                      fill={c} stroke="#0a0a0f" strokeWidth={1.5} />;
                  }}
                  activeDot={{ r: 5, fill: '#ec4899', strokeWidth: 0 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
              {MOOD_LABELS.slice(1).map((lbl, i) => (
                <span key={i} className="flex items-center gap-1 text-[9px] font-black font-mono tracking-wider"
                  style={{ color: MOOD_COLORS[i + 1], opacity: 0.65 }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block"
                    style={{ background: MOOD_COLORS[i + 1] }} />{i + 1}={lbl}
                </span>
              ))}
            </div>
          </div>
        </HudCard>
      )}

      {/* ── Sleep ── */}
      {hasSleep && (
        <HudCard accent="#6366f1">
          <div className="px-4 py-4 overflow-hidden">
            <SectionLabel text="Sleep — hours per night" accent="#6366f1" />
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <XAxis dataKey="label" tick={TICK_S} axisLine={false} tickLine={false}
                  interval={tickInterval} />
                <YAxis domain={[0, 12]} ticks={[0,4,6,8,10,12]} tick={TICK} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}h`} />
                <Tooltip content={<Tooltip2 accent="#6366f1" />}
                  formatter={(v: any) => [`${v}h`, 'Sleep']} />
                <ReferenceLine y={8} stroke="#6366f160" strokeDasharray="4 2"
                  label={{ value: '8h', fill: '#6366f170', fontSize: 9, fontFamily: 'monospace', position: 'insideTopRight' }} />
                <Bar dataKey="sleep_hrs" name="Sleep" radius={[3,3,0,0]} barSize={days <= 14 ? 12 : 7}>
                  {data.map((d, i) => {
                    const h = d.sleep_hrs;
                    const fill = h == null ? '#27272a' : h >= 7 && h <= 9 ? '#22c55e' : h >= 5.5 ? '#f59e0b' : '#ef4444';
                    return <Cell key={i} fill={fill} fillOpacity={h != null ? 0.8 : 0.15} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </HudCard>
      )}

      {/* ── Workout sessions ── */}
      {hasWorkout && (
        <HudCard accent="#f97316">
          <div className="px-4 py-4 overflow-hidden">
            <SectionLabel text="Workout Sessions — Daily" accent="#f97316" />
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <XAxis dataKey="label" tick={TICK_S} axisLine={false} tickLine={false}
                  interval={tickInterval} />
                <YAxis allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} />
                <Tooltip content={<Tooltip2 accent="#f97316" />}
                  formatter={(v: any) => [v, 'Sessions']} />
                <Bar dataKey="workouts" name="Sessions" fill="#f97316" fillOpacity={0.75}
                  radius={[3,3,0,0]} barSize={days <= 14 ? 12 : 7} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </HudCard>
      )}

      {/* ── Points earned per day ── */}
      {totalPts > 0 && (
        <HudCard accent="#e2c97e">
          <div className="px-4 py-4 overflow-hidden">
            <SectionLabel text="Points Earned — Daily" accent="#e2c97e" />
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gPts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor="#e2c97e" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#e2c97e" stopOpacity={0.25} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={TICK_S} axisLine={false} tickLine={false}
                  interval={tickInterval} />
                <YAxis allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} />
                <Tooltip content={<Tooltip2 accent="#e2c97e" />}
                  formatter={(v: any) => [v, 'Points']} />
                <Bar dataKey="points" name="Points" fill="url(#gPts)"
                  radius={[3,3,0,0]} barSize={days <= 14 ? 12 : 7} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </HudCard>
      )}

      {/* ── Activity table ── */}
      {data.length > 0 && <ActivityTable data={data} />}

      {/* ── Mood heatmap (always 63d) ── */}
      {data.length >= 7 && <JournalHeatmap data={data.length >= 63 ? data : data} />}

      </div>
    </div>
  );
}
