import { useEffect, useState, useCallback } from 'react';
import { Target, Plus, Trash2, Flame, Check } from 'lucide-react';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import { format } from 'date-fns';
import type { Habit } from '../types';

const CATEGORIES = ['all', 'discipline', 'physical', 'mental', 'health', 'other'] as const;
const CAT_COLOR: Record<string, string> = {
  discipline: '#6366f1',
  physical:   '#f97316',
  mental:     '#a855f7',
  health:     '#22c55e',
  other:      '#71717a',
};

const ICONS = ['✅', '💪', '🧠', '🏃', '📚', '🧘', '💧', '🥗', '😴', '🚫', '🎯', '⚡', '🔥', '🌅', '🧹'];

const today = new Date().toISOString().slice(0, 10);

export default function Habits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [streaks, setStreaks] = useState<Record<number, number>>({});
  const [filter, setFilter] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', icon: '✅', category: 'discipline', color: '#6366f1' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [habitsRes, streaksRes] = await Promise.all([
      api.get<Habit[]>(`/habits/logs?date=${today}`),
      api.get<{ habit_id: number; streak: number }[]>('/habits/streaks'),
    ]);
    setHabits(habitsRes.data);
    const sm: Record<number, number> = {};
    streaksRes.data.forEach(s => { sm[s.habit_id] = s.streak; });
    setStreaks(sm);
  }, []);

  useEffect(() => { load(); }, [load]);
  useSync(load, 60000);

  const toggle = async (habit: Habit) => {
    const newDone = !habit.done;
    setHabits(prev => prev.map(h => h.id === habit.id ? { ...h, done: newDone } : h));
    await api.put(`/habits/log/${habit.id}`, { date: today, done: newDone });
    load();
  };

  const addHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post('/habits', form);
      setForm({ name: '', icon: '✅', category: 'discipline', color: '#6366f1' });
      setShowAdd(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const deleteHabit = async (id: number) => {
    await api.delete(`/habits/${id}`);
    setHabits(prev => prev.filter(h => h.id !== id));
  };

  const filtered = filter === 'all' ? habits : habits.filter(h => h.category === filter);
  const doneCount = habits.filter(h => h.done).length;

  return (
    <div className="max-w-xl space-y-4 anim-page">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium mb-0.5" style={{ color: '#52525b', letterSpacing: '0.05em' }}>
            {format(new Date(), 'EEEE, d MMM').toUpperCase()}
          </p>
          <h1 className="text-2xl font-bold text-head tracking-tight">Habits</h1>
          <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>
            {doneCount}/{habits.length} completed today
          </p>
        </div>
        <button onClick={() => setShowAdd(s => !s)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold tap"
          style={{ background: `rgb(var(--accent-rgb) / 0.12)`, color: `rgb(var(--accent-rgb-light))` }}>
          <Plus size={15} /> Add
        </button>
      </div>

      {/* Progress bar */}
      {habits.length > 0 && (
        <div className="h-1.5 rounded-full w-full" style={{ background: 'var(--s3)' }}>
          <div className="h-1.5 rounded-full bar-fill"
            style={{ width: `${habits.length > 0 ? Math.round((doneCount / habits.length) * 100) : 0}%`, background: `rgb(var(--accent-rgb))` }} />
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <form onSubmit={addHabit} className="card px-4 py-4 space-y-3 scale-in">
          <p className="text-sm font-semibold text-head">New habit</p>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Morning workout"
            className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none" />
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium" style={{ color: '#71717a' }}>ICON</p>
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map(ic => (
                <button key={ic} type="button"
                  onClick={() => setForm(f => ({ ...f, icon: ic }))}
                  className="w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all tap"
                  style={{ background: form.icon === ic ? `rgb(var(--accent-rgb) / 0.15)` : 'var(--s3)', outline: form.icon === ic ? `1.5px solid rgb(var(--accent-rgb))` : 'none' }}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium" style={{ color: '#71717a' }}>CATEGORY</p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.filter(c => c !== 'all').map(cat => (
                <button key={cat} type="button"
                  onClick={() => setForm(f => ({ ...f, category: cat, color: CAT_COLOR[cat] }))}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold capitalize tap"
                  style={{
                    background: form.category === cat ? CAT_COLOR[cat] + '22' : 'var(--s3)',
                    color: form.category === cat ? CAT_COLOR[cat] : '#71717a',
                    border: form.category === cat ? `1px solid ${CAT_COLOR[cat]}44` : '1px solid transparent',
                  }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowAdd(false)}
              className="flex-1 py-2 rounded-lg text-sm font-medium tap"
              style={{ background: 'var(--s3)', color: '#71717a' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-lg text-sm font-semibold tap disabled:opacity-50"
              style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
              {saving ? 'Saving...' : 'Add habit'}
            </button>
          </div>
        </form>
      )}

      {/* Category filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 hide-scroll">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 capitalize tap"
            style={{
              background: filter === cat ? `rgb(var(--accent-rgb) / 0.12)` : 'var(--s2)',
              color: filter === cat ? `rgb(var(--accent-rgb-light))` : '#71717a',
              border: filter === cat ? `1px solid rgb(var(--accent-rgb) / 0.2)` : '1px solid transparent',
            }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Habit list */}
      {filtered.length === 0 ? (
        <div className="card py-10 text-center">
          <Target size={28} style={{ color: '#52525b', margin: '0 auto 8px' }} />
          <p className="text-sm font-medium" style={{ color: '#71717a' }}>
            {habits.length === 0 ? 'No habits yet — add one above' : 'No habits in this category'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(h => {
            const streak = streaks[h.id] ?? 0;
            return (
              <div key={h.id} className="card px-4 py-3 flex items-center gap-3">
                {/* Done toggle */}
                <button onClick={() => toggle(h)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 tap transition-all"
                  style={{
                    background: h.done ? h.color + '22' : 'var(--s3)',
                    border: `1.5px solid ${h.done ? h.color : 'var(--b)'}`,
                    color: h.done ? h.color : '#52525b',
                  }}>
                  {h.done ? <Check size={15} strokeWidth={3} /> : <span className="text-base leading-none">{h.icon}</span>}
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-head" style={{ textDecoration: h.done ? 'line-through' : 'none', opacity: h.done ? 0.6 : 1 }}>
                    {h.name}
                  </p>
                  <p className="text-[11px] capitalize mt-0.5" style={{ color: CAT_COLOR[h.category] ?? '#71717a' }}>
                    {h.category}
                  </p>
                </div>

                {/* Streak */}
                {streak > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Flame size={12} color="#f97316" />
                    <span className="text-[11px] font-bold" style={{ color: '#f97316' }}>{streak}</span>
                  </div>
                )}

                {/* Delete */}
                <button onClick={() => deleteHabit(h.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg tap"
                  style={{ color: '#52525b' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
