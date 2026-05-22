import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import type { WeeklyAnalytics, MoodDataPoint } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT = '#60a5fa';

const MOOD_LABELS  = ['', 'ROUGH', 'LOW', 'OKAY', 'GOOD', 'GREAT'];
const MOOD_COLORS  = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function moodLabel(val: number) {
  const idx = Math.min(5, Math.max(1, Math.round(val)));
  return `${MOOD_LABELS[idx]} (${val.toFixed(1)})`;
}

function moodColor(val: number) {
  return MOOD_COLORS[Math.min(5, Math.max(1, Math.round(val)))];
}

// ── Shared Components ─────────────────────────────────────────────────────────

function HudCard({
  children, accent = ACCENT, className = '',
}: { children: React.ReactNode; accent?: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{ background: 'var(--hero-bg)', border: `1px solid ${accent}18`,
        boxShadow: `0 0 24px ${accent}07` }}>
      {/* Scanlines */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, ${accent}02 3px, ${accent}02 4px)` }} />
      {/* Top neon bar */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)`,
          boxShadow: `0 0 5px ${accent}` }} />
      {/* HUD corners */}
      {([
        ['top-0 left-0',     { borderTop: `1.5px solid ${accent}`, borderLeft:  `1.5px solid ${accent}` }],
        ['top-0 right-0',    { borderTop: `1.5px solid ${accent}`, borderRight: `1.5px solid ${accent}` }],
        ['bottom-0 left-0',  { borderBottom: `1.5px solid ${accent}`, borderLeft:  `1.5px solid ${accent}` }],
        ['bottom-0 right-0', { borderBottom: `1.5px solid ${accent}`, borderRight: `1.5px solid ${accent}` }],
      ] as [string, React.CSSProperties][]).map(([pos, s], i) => (
        <div key={i} className={`absolute ${pos} pointer-events-none`}
          style={{ width: 10, height: 10, opacity: 0.45, ...s }} />
      ))}
      {/* Bottom dim bar */}
      <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}22, transparent)` }} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function ChartLabel({ text, accent = ACCENT }: { text: string; accent?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-0.5 h-4 rounded-full flex-shrink-0"
        style={{ background: accent, boxShadow: `0 0 6px ${accent}` }} />
      <span className="text-[10px] font-black tracking-[0.22em] font-mono uppercase"
        style={{ color: accent, opacity: 0.65 }}>{text}</span>
    </div>
  );
}

function MetricCard({ label, value, sub, accent = ACCENT }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <HudCard accent={accent}>
      <div className="px-4 py-4">
        <p className="text-[9px] font-black tracking-[0.22em] font-mono mb-1.5"
          style={{ color: accent, opacity: 0.5 }}>{label}</p>
        <p className="text-[1.6rem] font-black font-mono leading-none"
          style={{ color: 'var(--t-head)', textShadow: `0 0 18px ${accent}45` }}>{value}</p>
        {sub && <p className="text-[10px] font-mono mt-1.5" style={{ color: 'var(--t-faint)' }}>{sub}</p>}
      </div>
    </HudCard>
  );
}

// Custom tooltip
function CyberpunkTooltip({ active, payload, label, accent = ACCENT }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(0,0,0,0.92)',
      border: `1px solid ${accent}30`,
      borderRadius: 8, padding: '8px 12px', fontSize: 11,
      boxShadow: `0 0 14px ${accent}18`,
    }}>
      <p style={{ color: accent, fontFamily: 'monospace', fontWeight: 900,
        letterSpacing: '0.12em', marginBottom: 4, opacity: 0.8 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || 'var(--t-head)', fontFamily: 'monospace', marginBottom: 1 }}>
          <span style={{ opacity: 0.6 }}>{p.name}:</span>{' '}
          <span style={{ fontWeight: 900 }}>{typeof p.value === 'number' ? p.value : p.value}</span>
        </p>
      ))}
    </div>
  );
}

const TICK_STYLE = { fill: '#52525b', fontSize: 10, fontFamily: 'monospace' };
const TINY_TICK  = { fill: '#3f3f46', fontSize: 9,  fontFamily: 'monospace' };

// ── DataParticles ─────────────────────────────────────────────────────────────

function DataParticles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: 0.12 }}>
      {[...Array(12)].map((_, i) => (
        <div key={i} className="absolute w-px"
          style={{
            left: `${8 + i * 7.5}%`,
            top: 0, bottom: 0,
            background: `linear-gradient(to bottom, transparent, ${ACCENT}, transparent)`,
            animation: `data-scroll ${2 + (i % 3) * 0.8}s linear ${i * 200}ms infinite`,
          }} />
      ))}
    </div>
  );
}

// ── Journal Heatmap ───────────────────────────────────────────────────────────

function JournalHeatmap({ data }: { data: { date: string; mood: number | null }[] }) {
  const [hovered, setHovered] = useState<{ date: string; mood: number | null } | null>(null);

  const byDate: Record<string, number | null> = {};
  data.forEach(d => { byDate[d.date] = d.mood; });

  const days: { date: string; mood: number | null }[] = [];
  for (let i = 62; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, mood: byDate[key] ?? null });
  }

  return (
    <HudCard accent="#a855f7">
      <div className="px-4 py-4">
        <ChartLabel text="Journal Heatmap — 63 days" accent="#a855f7" />

        {/* Hover info bar */}
        <div className="h-5 mb-3 flex items-center">
          {hovered
            ? <p className="text-[11px] font-mono">
                <span style={{ color: '#a855f7', opacity: 0.7 }}>{hovered.date} → </span>
                {hovered.mood
                  ? <span style={{ color: MOOD_COLORS[hovered.mood], fontWeight: 900 }}>
                      {MOOD_LABELS[hovered.mood]}
                    </span>
                  : <span style={{ color: 'var(--t-faint)' }}>no entry</span>
                }
              </p>
            : <p className="text-[10px] font-mono" style={{ color: 'var(--t-faint)', opacity: 0.4 }}>
                // hover a cell to inspect
              </p>
          }
        </div>

        {/* Grid */}
        <div className="flex flex-wrap gap-[3px]">
          {days.map(d => {
            const isHov = hovered?.date === d.date;
            return (
              <div key={d.date}
                onMouseEnter={() => setHovered(d)}
                onMouseLeave={() => setHovered(null)}
                onTouchStart={() => setHovered(d)}
                className="rounded-sm cursor-pointer"
                style={{
                  width: 16, height: 16,
                  backgroundColor: d.mood ? MOOD_COLORS[d.mood] : 'var(--s3)',
                  opacity: d.mood ? (isHov ? 1 : 0.75) : (isHov ? 0.5 : 0.2),
                  transform: isHov ? 'scale(1.5)' : undefined,
                  boxShadow: isHov && d.mood ? `0 0 7px ${MOOD_COLORS[d.mood]}` : undefined,
                  transition: 'transform 0.1s, opacity 0.1s',
                  zIndex: isHov ? 10 : undefined,
                  position: 'relative',
                }}
              />
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
          {MOOD_LABELS.slice(1).map((lbl, i) => (
            <span key={i} className="flex items-center gap-1 text-[9px] font-black font-mono tracking-widest"
              style={{ color: MOOD_COLORS[i + 1], opacity: 0.65 }}>
              <span className="w-2 h-2 rounded-sm inline-block flex-shrink-0"
                style={{ backgroundColor: MOOD_COLORS[i + 1] }} />
              {lbl}
            </span>
          ))}
          <span className="flex items-center gap-1 text-[9px] font-mono" style={{ color: 'var(--t-faint)', opacity: 0.4 }}>
            <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: 'var(--s3)' }} />
            NONE
          </span>
        </div>
      </div>
    </HudCard>
  );
}

// ── Range picker ──────────────────────────────────────────────────────────────

function RangePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {([4, 8, 12] as const).map(w => (
        <button key={w}
          className="tap px-3 py-1 rounded-lg text-[11px] font-black font-mono tracking-widest"
          style={value === w
            ? { background: `${ACCENT}20`, color: ACCENT, border: `1px solid ${ACCENT}40`,
                boxShadow: `0 0 8px ${ACCENT}20` }
            : { background: 'var(--s3)', color: 'var(--t-faint)', border: '1px solid transparent' }}
          onClick={() => onChange(w)}>
          {w}W
        </button>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Analytics() {
  const [weeks, setWeeks]   = useState(8);
  const [weekly, setWeekly] = useState<WeeklyAnalytics[]>([]);
  const [mood, setMood]     = useState<MoodDataPoint[]>([]);
  const [heatmap, setHeatmap] = useState<{ date: string; mood: number | null }[]>([]);

  const fetchAll = useCallback(async () => {
    const moodDays = weeks * 7;
    const [w, m, h] = await Promise.all([
      api.get<WeeklyAnalytics[]>(`/analytics/weekly?weeks=${weeks}`),
      api.get<MoodDataPoint[]>(`/analytics/mood?days=${moodDays}`),
      api.get<{ date: string; mood: number | null }[]>('/analytics/journal?days=63'),
    ]);
    setWeekly(w.data);
    setMood(m.data);
    setHeatmap(h.data);
  }, [weeks]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useSync(fetchAll, 120_000);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const latestWeek = weekly[weekly.length - 1];

  const avgMoodAll = mood.length
    ? (mood.reduce((s, d) => s + d.mood, 0) / mood.length)
    : null;

  const totalCreated   = weekly.reduce((s, w) => s + w.tasks_created, 0);
  const totalCompleted = weekly.reduce((s, w) => s + w.tasks_completed, 0);
  const completionRate = totalCreated > 0 ? Math.round((totalCompleted / totalCreated) * 100) : 0;

  const avgHabitsScore = (() => {
    const valid = weekly.filter(w => w.habits_score != null);
    if (!valid.length) return null;
    return Math.round(valid.reduce((s, w) => s + (w.habits_score ?? 0), 0) / valid.length);
  })();

  const totalWorkouts = weekly.reduce((s, w) => s + (w.workout_sessions ?? 0), 0);

  const hasSleep   = weekly.some(w => w.sleep_avg_hrs != null);
  const hasHabits  = weekly.some(w => w.habits_score  != null);
  const hasWorkout = weekly.some(w => (w.workout_sessions ?? 0) > 0);
  const hasMood    = mood.length > 0;

  // Shorter week labels (strip 'w ago')
  const chartData = weekly.map(w => ({
    ...w,
    label: w.week.replace(' ago', '').replace('This week', 'NOW'),
  }));

  return (
    <div className="max-w-2xl mx-auto space-y-4 anim-page pb-8"
      style={{ '--accent-rgb': '96 165 250' } as React.CSSProperties}>

      {/* Dot grid bg */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(96,165,250,0.05) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* ── ORACLE CORE HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{ background: 'var(--hero-bg)', border: '1px solid #60a5fa25', minHeight: 110, zIndex: 1 }}>
        <DataParticles />
        {/* HUD corners */}
        <div className="absolute top-0 left-0 pointer-events-none"
          style={{ width: 14, height: 14, borderTop: '1.5px solid #60a5fa', borderLeft: '1.5px solid #60a5fa', opacity: 0.6 }} />
        <div className="absolute top-0 right-0 pointer-events-none"
          style={{ width: 14, height: 14, borderTop: '1.5px solid #60a5fa', borderRight: '1.5px solid #60a5fa', opacity: 0.6 }} />
        <div className="absolute bottom-0 left-0 pointer-events-none"
          style={{ width: 14, height: 14, borderBottom: '1.5px solid #60a5fa', borderLeft: '1.5px solid #60a5fa', opacity: 0.6 }} />
        <div className="absolute bottom-0 right-0 pointer-events-none"
          style={{ width: 14, height: 14, borderBottom: '1.5px solid #60a5fa', borderRight: '1.5px solid #60a5fa', opacity: 0.6 }} />
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #60a5fa80, transparent)', boxShadow: '0 0 8px #60a5fa' }} />
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: ACCENT, opacity: 0.6 }}>ORACLE://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">DATA_CORE</span>
            <span className="cursor-blink font-mono" style={{ color: ACCENT, fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight leading-none text-white"
            style={{ textShadow: '0 0 30px #60a5fa40' }}>
            ORACLE CORE
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: ACCENT, opacity: 0.45 }}>
            {'// pattern recognition — behavioral signals decoded'}
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #60a5fa25, transparent)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }} className="space-y-4">

      {/* Range + period header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-mono tracking-[0.2em] mb-0.5" style={{ color: ACCENT, opacity: 0.5 }}>
            TIME_RANGE://
          </p>
          <p className="text-xs font-mono" style={{ color: 'var(--t-faint)' }}>
            {weeks}w · {totalCreated} tasks logged
          </p>
        </div>
        <RangePicker value={weeks} onChange={setWeeks} />
      </div>

      {/* ── Summary metric cards ── */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="COMPLETION RATE"
          value={`${completionRate}%`}
          sub={`${totalCompleted} / ${totalCreated} tasks`}
          accent="#0ea5e9"
        />
        <MetricCard
          label="JOURNAL THIS WEEK"
          value={latestWeek ? `${latestWeek.journal_score}%` : '—'}
          sub={latestWeek ? `${latestWeek.journal_entries} entries` : 'no data'}
          accent="#a855f7"
        />
        <MetricCard
          label={`AVG MOOD (${weeks}W)`}
          value={avgMoodAll !== null ? avgMoodAll.toFixed(1) : '—'}
          sub={avgMoodAll !== null ? MOOD_LABELS[Math.round(avgMoodAll)] : 'no entries'}
          accent={avgMoodAll !== null ? moodColor(avgMoodAll) : '#52525b'}
        />
        {avgHabitsScore != null
          ? <MetricCard label="HABIT SCORE AVG" value={`${avgHabitsScore}%`} sub="of possible days" accent="#22c55e" />
          : <MetricCard label="TOTAL WORKOUTS"  value={totalWorkouts} sub={`sessions in ${weeks}w`} accent="#f97316" />
        }
      </div>

      {/* ── Performance area chart ── */}
      {weekly.length > 0 && (
        <HudCard accent={ACCENT}>
          <div className="px-4 py-4 overflow-hidden">
            <ChartLabel text={`Performance Scores — ${weeks}W`} accent={ACCENT} />
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="gTask"    x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0ea5e9" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gJournal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gHabits"  x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={TICK_STYLE} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}`} />
                <Tooltip content={<CyberpunkTooltip accent={ACCENT} />}
                  formatter={(v: any) => [`${v}%`]} />
                <Area type="monotone" dataKey="task_score"    name="Tasks"
                  stroke="#0ea5e9" fill="url(#gTask)"    strokeWidth={2}
                  dot={false} activeDot={{ r: 4, fill: '#0ea5e9', strokeWidth: 0 }}
                  connectNulls />
                <Area type="monotone" dataKey="journal_score" name="Journal"
                  stroke="#a855f7" fill="url(#gJournal)" strokeWidth={2}
                  dot={false} activeDot={{ r: 4, fill: '#a855f7', strokeWidth: 0 }} />
                {hasHabits && (
                  <Area type="monotone" dataKey="habits_score" name="Habits"
                    stroke="#22c55e" fill="url(#gHabits)"  strokeWidth={2}
                    dot={false} activeDot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }}
                    connectNulls />
                )}
              </AreaChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-2">
              {[['#0ea5e9', 'Tasks'], ['#a855f7', 'Journal'],
                ...(hasHabits ? [['#22c55e', 'Habits']] : [])
              ].map(([color, label]) => (
                <span key={label} className="flex items-center gap-1.5 text-[10px] font-mono"
                  style={{ color: 'var(--t-faint)' }}>
                  <span className="w-4 h-0.5 rounded-full inline-block"
                    style={{ background: color as string, boxShadow: `0 0 4px ${color}` }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </HudCard>
      )}

      {/* ── Tasks created vs completed ── */}
      {weekly.length > 0 && (
        <HudCard accent="#0ea5e9">
          <div className="px-4 py-4 overflow-hidden">
            <ChartLabel text="Tasks · Created vs Completed" accent="#0ea5e9" />
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barGap={3} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <Tooltip content={<CyberpunkTooltip accent="#0ea5e9" />} />
                <Bar dataKey="tasks_created"   name="Created"
                  fill="#6366f1" fillOpacity={0.55} radius={[3, 3, 0, 0]} />
                <Bar dataKey="tasks_completed" name="Completed"
                  fill="#0ea5e9" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2">
              {[['#6366f1', 'Created'], ['#0ea5e9', 'Completed']].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1.5 text-[10px] font-mono"
                  style={{ color: 'var(--t-faint)' }}>
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: c as string }} />
                  {l}
                </span>
              ))}
            </div>
          </div>
        </HudCard>
      )}

      {/* ── Mood trend line ── */}
      {hasMood && (
        <HudCard accent="#ec4899">
          <div className="px-4 py-4 overflow-hidden">
            <ChartLabel text={`Mood Trend — ${weeks}W`} accent="#ec4899" />
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={mood} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="gMoodLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"   stopColor="#ef4444" />
                    <stop offset="50%"  stopColor="#eab308" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={TINY_TICK} axisLine={false} tickLine={false}
                  tickFormatter={d => d.slice(5)}
                  interval={Math.floor(mood.length / 6)} />
                <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={TICK_STYLE}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => MOOD_LABELS[v] || ''} width={38} />
                <Tooltip content={<CyberpunkTooltip accent="#ec4899" />}
                  formatter={(v) => [moodLabel(Number(v)), 'Mood']}
                  labelFormatter={d => d} />
                {/* Reference zones */}
                <ReferenceLine y={3} stroke="#ffffff08" strokeDasharray="4 3" />
                <Line type="monotone" dataKey="mood"
                  stroke="#ec4899" strokeWidth={2.5}
                  dot={(props: any) => {
                    const c = moodColor(props.payload.mood);
                    return <circle key={props.key} cx={props.cx} cy={props.cy} r={3.5}
                      fill={c} stroke="#0a0a0f" strokeWidth={1.5} />;
                  }}
                  activeDot={{ r: 5, fill: '#ec4899', strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
            {/* Mood legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {MOOD_LABELS.slice(1).map((lbl, i) => (
                <span key={i} className="flex items-center gap-1 text-[9px] font-black font-mono tracking-wider"
                  style={{ color: MOOD_COLORS[i + 1], opacity: 0.65 }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block"
                    style={{ background: MOOD_COLORS[i + 1] }} />
                  {i + 1}={lbl}
                </span>
              ))}
            </div>
          </div>
        </HudCard>
      )}

      {/* ── Sleep chart ── */}
      {hasSleep && (
        <HudCard accent="#6366f1">
          <div className="px-4 py-4 overflow-hidden">
            <ChartLabel text="Sleep — avg hrs / night" accent="#6366f1" />
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="gSleep" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#6366f1" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 12]} ticks={[0, 4, 6, 8, 10, 12]} tick={TICK_STYLE}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}h`} />
                <Tooltip content={<CyberpunkTooltip accent="#6366f1" />}
                  formatter={(v: any) => [`${v}h`, 'Avg sleep']} />
                <ReferenceLine y={8} stroke="#6366f160" strokeDasharray="4 2"
                  label={{ value: '8h goal', fill: '#6366f170', fontSize: 9, fontFamily: 'monospace', position: 'insideTopRight' }} />
                <Bar dataKey="sleep_avg_hrs" name="Sleep"
                  fill="url(#gSleep)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </HudCard>
      )}

      {/* ── Workout sessions ── */}
      {hasWorkout && (
        <HudCard accent="#f97316">
          <div className="px-4 py-4 overflow-hidden">
            <ChartLabel text="Workout Sessions / Week" accent="#f97316" />
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="gWorkout" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#f97316" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <Tooltip content={<CyberpunkTooltip accent="#f97316" />}
                  formatter={(v: any) => [v, 'Sessions']} />
                <Bar dataKey="workout_sessions" name="Sessions"
                  fill="url(#gWorkout)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </HudCard>
      )}

      {/* ── Habits score ── */}
      {hasHabits && (
        <HudCard accent="#22c55e">
          <div className="px-4 py-4 overflow-hidden">
            <ChartLabel text="Habit Consistency / Week" accent="#22c55e" />
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="gHabit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#22c55e" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.25} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={TICK_STYLE} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}%`} />
                <Tooltip content={<CyberpunkTooltip accent="#22c55e" />}
                  formatter={(v: any) => [`${v}%`, 'Habits']} />
                <ReferenceLine y={70} stroke="#22c55e40" strokeDasharray="4 2"
                  label={{ value: '70% target', fill: '#22c55e50', fontSize: 9, fontFamily: 'monospace', position: 'insideTopRight' }} />
                <Bar dataKey="habits_score" name="Habits"
                  fill="url(#gHabit)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </HudCard>
      )}

      {/* ── Journal heatmap ── */}
      <JournalHeatmap data={heatmap} />

      </div>
    </div>
  );
}
