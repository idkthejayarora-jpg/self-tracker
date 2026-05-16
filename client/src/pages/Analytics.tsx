import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import type { WeeklyAnalytics, MoodDataPoint } from '../types';

const MOOD_EMOJI = ['', '😞', '😕', '😐', '🙂', '😄'];
const MOOD_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];

const TT: React.CSSProperties = {
  background: 'var(--s2)', border: '1px solid var(--b)', borderRadius: 8, fontSize: 12,
};
const TICK = { fill: '#52525b', fontSize: 11 };
const GRID = '#27272a';

function moodLabel(val: number) {
  return `${MOOD_EMOJI[Math.round(val)]} ${val.toFixed(1)}`;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card px-4 py-4">
      <p className="text-xs mb-1" style={{ color: '#71717a' }}>{label}</p>
      <p className="text-2xl font-bold text-head">{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: '#52525b' }}>{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card px-4 py-4">
      <p className="text-xs font-semibold mb-4" style={{ color: '#52525b', letterSpacing: '0.05em' }}>
        {title.toUpperCase()}
      </p>
      {children}
    </div>
  );
}

function DataParticles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: 0.12 }}>
      {[...Array(12)].map((_, i) => (
        <div key={i} className="absolute w-px"
          style={{
            left: `${8 + i * 7.5}%`,
            top: 0, bottom: 0,
            background: `linear-gradient(to bottom, transparent, #60a5fa, transparent)`,
            animation: `data-scroll ${2 + (i % 3) * 0.8}s linear ${i * 200}ms infinite`,
          }} />
      ))}
    </div>
  );
}

// 9×7 heatmap (63 days)
function JournalHeatmap({ data }: { data: { date: string; mood: number | null }[] }) {
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
    <ChartCard title="Journal heatmap (63 days)">
      <div className="flex flex-wrap gap-1">
        {days.map(d => (
          <div
            key={d.date}
            title={`${d.date}${d.mood ? ' · ' + MOOD_EMOJI[d.mood] : ''}`}
            className="w-4 h-4 rounded-sm"
            style={{
              backgroundColor: d.mood ? MOOD_COLORS[d.mood] : 'var(--s3)',
              opacity: d.mood ? 0.8 : 0.4,
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-2">
        {MOOD_EMOJI.slice(1).map((e, i) => (
          <span key={i} className="text-xs flex items-center gap-1" style={{ color: '#52525b' }}>
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: MOOD_COLORS[i + 1], opacity: 0.8 }} />
            {e}
          </span>
        ))}
        <span className="text-xs flex items-center gap-1" style={{ color: '#52525b' }}>
          <span className="w-3 h-3 rounded-sm inline-block opacity-40" style={{ backgroundColor: 'var(--s3)' }} />
          No entry
        </span>
      </div>
    </ChartCard>
  );
}

export default function Analytics() {
  const [weekly, setWeekly] = useState<WeeklyAnalytics[]>([]);
  const [mood, setMood] = useState<MoodDataPoint[]>([]);
  const [heatmap, setHeatmap] = useState<{ date: string; mood: number | null }[]>([]);

  const fetchAll = useCallback(async () => {
    const [w, m, h] = await Promise.all([
      api.get<WeeklyAnalytics[]>('/analytics/weekly?weeks=8'),
      api.get<MoodDataPoint[]>('/analytics/mood?days=30'),
      api.get<{ date: string; mood: number | null }[]>('/analytics/journal?days=63'),
    ]);
    setWeekly(w.data);
    setMood(m.data);
    setHeatmap(h.data);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useSync(fetchAll, 120000);

  const latestWeek = weekly[weekly.length - 1];
  const avgMoodAll = mood.length
    ? (mood.reduce((s, d) => s + d.mood, 0) / mood.length).toFixed(1)
    : '—';

  const totalCreated = weekly.reduce((s, w) => s + w.tasks_created, 0);
  const totalCompleted = weekly.reduce((s, w) => s + w.tasks_completed, 0);
  const completionRate = totalCreated > 0 ? Math.round((totalCompleted / totalCreated) * 100) : 0;

  const avgHabitsScore = weekly.filter(w => w.habits_score != null).length
    ? Math.round(weekly.filter(w => w.habits_score != null).reduce((s, w) => s + (w.habits_score ?? 0), 0) /
        weekly.filter(w => w.habits_score != null).length)
    : null;

  const totalWorkouts = weekly.reduce((s, w) => s + (w.workout_sessions ?? 0), 0);

  const hasSleep   = weekly.some(w => w.sleep_avg_hrs != null);
  const hasHabits  = weekly.some(w => w.habits_score  != null);
  const hasWorkout = weekly.some(w => (w.workout_sessions ?? 0) > 0);

  return (
    <div className="max-w-xl space-y-4 anim-page">

      {/* ── ORACLE CORE HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl mb-4"
        style={{ background: '#000', border: '1px solid #60a5fa25', minHeight: 110 }}>
        <DataParticles />
        <div className="absolute top-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #60a5fa', borderLeft: '1.5px solid #60a5fa', opacity: 0.7 }} />
        <div className="absolute top-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #60a5fa', borderRight: '1.5px solid #60a5fa', opacity: 0.7 }} />
        <div className="absolute bottom-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #60a5fa', borderLeft: '1.5px solid #60a5fa', opacity: 0.7 }} />
        <div className="absolute bottom-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #60a5fa', borderRight: '1.5px solid #60a5fa', opacity: 0.7 }} />
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #60a5fa80, transparent)', boxShadow: '0 0 8px #60a5fa' }} />
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: '#60a5fa', opacity: 0.6 }}>ORACLE://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">DATA_CORE_v1.0</span>
            <span className="cursor-blink font-mono" style={{ color: '#60a5fa', fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight leading-none text-white" style={{ textShadow: '0 0 30px #60a5fa40' }}>
            ORACLE CORE
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: '#60a5fa', opacity: 0.5 }}>
            // pattern recognition engine — behavioral insights processing
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #60a5fa30, transparent)' }} />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-head tracking-tight">Analytics</h1>
        <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>Last 8 weeks across all modules</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Task completion" value={`${completionRate}%`} sub={`${totalCompleted}/${totalCreated} tasks`} />
        <StatCard label="Journal this week" value={latestWeek ? `${latestWeek.journal_score}%` : '—'} sub="entries / 7 days" />
        <StatCard label="Avg mood (30d)" value={avgMoodAll !== '—' ? `${MOOD_EMOJI[Math.round(Number(avgMoodAll))]} ${avgMoodAll}` : '—'} />
        {avgHabitsScore != null
          ? <StatCard label="Habit score (avg)" value={`${avgHabitsScore}%`} sub="of possible days" />
          : <StatCard label="Workouts (8 wks)" value={totalWorkouts} sub="total sessions" />
        }
      </div>

      {/* Weekly performance scores */}
      {weekly.length > 0 && (
        <ChartCard title="Weekly performance scores">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="week" tick={TICK} />
              <YAxis domain={[0, 100]} tick={TICK} />
              <Tooltip contentStyle={TT} labelStyle={{ color: '#f4f4f5' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#71717a' }} />
              <Area type="monotone" dataKey="task_score"    name="Tasks %"   stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.12} strokeWidth={2} connectNulls />
              <Area type="monotone" dataKey="journal_score" name="Journal %"  stroke="#a855f7" fill="#a855f7" fillOpacity={0.12} strokeWidth={2} />
              {hasHabits && (
                <Area type="monotone" dataKey="habits_score" name="Habits %"  stroke="#22c55e" fill="#22c55e" fillOpacity={0.12} strokeWidth={2} connectNulls />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Tasks created vs completed */}
      {weekly.length > 0 && (
        <ChartCard title="Tasks: created vs completed">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="week" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={TT} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#71717a' }} />
              <Bar dataKey="tasks_created"   name="Created"   fill="#3f3f46" radius={[4, 4, 0, 0]} />
              <Bar dataKey="tasks_completed" name="Completed" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Sleep avg hrs per week */}
      {hasSleep && (
        <ChartCard title="Sleep — avg hrs/night per week">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="week" tick={TICK} />
              <YAxis domain={[0, 12]} tick={TICK} />
              <Tooltip contentStyle={TT} formatter={(v: any) => [`${v}h`, 'Avg sleep']} />
              <ReferenceLine y={8} stroke="#52525b" strokeDasharray="4 2" />
              <Bar dataKey="sleep_avg_hrs" name="Sleep hrs" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] mt-1 text-center" style={{ color: '#52525b' }}>Dashed line = 8h goal</p>
        </ChartCard>
      )}

      {/* Workout sessions per week */}
      {hasWorkout && (
        <ChartCard title="Workout sessions per week">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="week" tick={TICK} />
              <YAxis allowDecimals={false} tick={TICK} />
              <Tooltip contentStyle={TT} formatter={(v: any) => [v, 'Sessions']} />
              <Bar dataKey="workout_sessions" name="Sessions" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Mood trend */}
      {mood.length > 0 && (
        <ChartCard title="Mood trend (30 days)">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={mood}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="date" tick={{ ...TICK, fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={TICK} tickFormatter={v => MOOD_EMOJI[v]} />
              <Tooltip contentStyle={TT} formatter={(v) => [moodLabel(Number(v)), 'Mood']} />
              <Line type="monotone" dataKey="mood" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Avg mood per week */}
      {weekly.some(w => w.avg_mood) && (
        <ChartCard title="Average mood per week">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={weekly.filter(w => w.avg_mood)}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="week" tick={TICK} />
              <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={TICK} tickFormatter={v => MOOD_EMOJI[v] || ''} />
              <Tooltip contentStyle={TT} formatter={(v) => [moodLabel(Number(v)), 'Avg mood']} />
              <Bar dataKey="avg_mood" name="Avg mood" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <JournalHeatmap data={heatmap} />
    </div>
  );
}
