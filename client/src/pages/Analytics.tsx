import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import type { WeeklyAnalytics, MoodDataPoint } from '../types';

const MOOD_EMOJI = ['', '😞', '😕', '😐', '🙂', '😄'];
const MOOD_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];

function moodLabel(val: number) {
  return `${MOOD_EMOJI[Math.round(val)]} ${val.toFixed(1)}`;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3">Journal Heatmap (63 days)</h3>
      <div className="flex flex-wrap gap-1">
        {days.map(d => (
          <div
            key={d.date}
            title={`${d.date}${d.mood ? ' · ' + MOOD_EMOJI[d.mood] : ''}`}
            className="w-4 h-4 rounded-sm"
            style={{
              backgroundColor: d.mood
                ? MOOD_COLORS[d.mood]
                : d.mood === null ? '#1f2937' : '#374151',
              opacity: d.mood ? 0.8 : 0.4,
            }}
          />
        ))}
      </div>
      <div className="flex gap-3 mt-2">
        {MOOD_EMOJI.slice(1).map((e, i) => (
          <span key={i} className="text-xs text-gray-500 flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: MOOD_COLORS[i + 1], opacity: 0.8 }} />
            {e}
          </span>
        ))}
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm inline-block bg-gray-700 opacity-40" />
          No entry
        </span>
      </div>
    </div>
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Analytics</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Task completion rate" value={`${completionRate}%`} sub={`${totalCompleted}/${totalCreated} tasks`} />
        <StatCard label="Journal score this week" value={latestWeek ? `${latestWeek.journal_score}%` : '—'} sub="entries / 7 days" />
        <StatCard label="Avg mood (30d)" value={avgMoodAll !== '—' ? `${MOOD_EMOJI[Math.round(Number(avgMoodAll))]} ${avgMoodAll}` : '—'} />
        <StatCard label="Task score this week" value={latestWeek?.task_score != null ? `${latestWeek.task_score}%` : '—'} sub="completed / created" />
      </div>

      {/* Weekly scores */}
      {weekly.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Weekly Scores</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#f9fafb' }}
              />
              <Legend />
              <Area type="monotone" dataKey="task_score" name="Task %" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.15} strokeWidth={2} />
              <Area type="monotone" dataKey="journal_score" name="Journal %" stroke="#a855f7" fill="#a855f7" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tasks created vs completed */}
      {weekly.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Tasks: Created vs Completed</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="tasks_created" name="Created" fill="#374151" radius={[4, 4, 0, 0]} />
              <Bar dataKey="tasks_completed" name="Completed" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Mood trend */}
      {mood.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Mood Trend (30 days)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={mood}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }}
                tickFormatter={d => d.slice(5)} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={v => MOOD_EMOJI[v]} />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v) => [moodLabel(Number(v)), 'Mood']} />
              <Line type="monotone" dataKey="mood" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Avg mood per week */}
      {weekly.some(w => w.avg_mood) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Average Mood per Week</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weekly.filter(w => w.avg_mood)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={v => MOOD_EMOJI[v] || ''} />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v) => [moodLabel(Number(v)), 'Avg mood']} />
              <Bar dataKey="avg_mood" name="Avg mood" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <JournalHeatmap data={heatmap} />
    </div>
  );
}
