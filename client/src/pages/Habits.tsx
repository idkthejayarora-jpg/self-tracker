import { useEffect, useState, useCallback } from 'react';
import { Target, Plus, Trash2, Flame, Check, AlertCircle } from 'lucide-react';
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

function getToday() { return new Date().toISOString().slice(0, 10); }

const emptyForm = () => ({ name: '', icon: '', category: 'discipline', color: '#6366f1' });

export default function Habits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [streaks, setStreaks] = useState<Record<number, number>>({});
  const [filter, setFilter] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [loadErr, setLoadErr] = useState('');

  const load = useCallback(async () => {
    try {
      setLoadErr('');
      const td = getToday();
      const [habitsRes, streaksRes] = await Promise.all([
        api.get<Habit[]>(`/habits/logs?date=${td}`),
        api.get<{ habit_id: number; streak: number }[]>('/habits/streaks'),
      ]);
      setHabits(habitsRes.data);
      const sm: Record<number, number> = {};
      streaksRes.data.forEach(s => { sm[s.habit_id] = s.streak; });
      setStreaks(sm);
    } catch (e: any) {
      setLoadErr(e?.response?.data?.error || e?.message || 'Failed to load habits');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useSync(load, 60000);

  const toggle = async (habit: Habit) => {
    const td = getToday();
    const newDone = !habit.done;
    // Optimistic update
    setHabits(prev => prev.map(h => h.id === habit.id ? { ...h, done: newDone } : h));
    try {
      await api.put(`/habits/log/${habit.id}`, { date: td, done: newDone });
      await load();
    } catch {
      // Revert optimistic update on failure
      setHabits(prev => prev.map(h => h.id === habit.id ? { ...h, done: !newDone } : h));
    }
  };

  const addHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setFormErr('');
    try {
      await api.post('/habits', form);
      setForm(emptyForm());
      setShowAdd(false);
      await load();
    } catch (err: any) {
      setFormErr(err?.response?.data?.error || err?.message || 'Failed to add habit');
    } finally {
      setSaving(false);
    }
  };

  const deleteHabit = async (id: number) => {
    try {
      await api.delete(`/habits/${id}`);
      setHabits(prev => prev.filter(h => h.id !== id));
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to delete habit');
    }
  };

  const filtered = filter === 'all' ? habits : habits.filter(h => h.category === filter);
  const doneCount = habits.filter(h => h.done).length;

  return (
    <div className="max-w-2xl mx-auto space-y-5 anim-page"
      style={{ '--accent-rgb': '167 139 250' } as React.CSSProperties}>

      {/* Cyberpunk body overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(167,139,250,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      <div className="page-header flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex items-center justify-center rounded-2xl"
            style={{ width: 44, height: 44, background: '#f9731615', border: '1px solid #f9731625' }}>
            <Target size={22} style={{ color: '#f97316' }} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-head tracking-tight">Habits</h1>
            <p className="text-xs text-muted mt-0.5">Daily reinforcement</p>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium mb-0.5" style={{ color: '#52525b', letterSpacing: '0.05em' }}>
            {format(new Date(), 'EEEE, d MMM').toUpperCase()}
          </p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--t-dim)' }}>
            {doneCount}/{habits.length} completed today
          </p>
        </div>
        <button type="button" onClick={() => { setShowAdd(s => !s); setFormErr(''); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold tap"
          style={{ background: `rgb(var(--accent-rgb) / 0.12)`, color: `rgb(var(--accent-rgb-light))` }}>
          <Plus size={15} /> Add
        </button>
      </div>

      {loadErr && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: 'rgb(239 68 68 / 0.08)', color: '#f87171', border: '1px solid rgb(239 68 68 / 0.2)' }}>
          <AlertCircle size={13} />
          {loadErr} — <button type="button" onClick={load} className="underline tap">retry</button>
        </div>
      )}

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
            required
            className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none" />
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>CATEGORY</p>
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
          {formErr && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgb(239 68 68 / 0.1)', color: '#f87171' }}>
              <AlertCircle size={13} />{formErr}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowAdd(false); setFormErr(''); }}
              className="flex-1 py-2 rounded-lg text-sm font-medium tap"
              style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>
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
          <button key={cat} type="button" onClick={() => setFilter(cat)}
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

      </div>{/* end relative zIndex wrapper */}

      {/* Habit list */}
      {filtered.length === 0 ? (
        <div className="card py-10 text-center">
          <Target size={28} style={{ color: '#52525b', margin: '0 auto 8px' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--t-dim)' }}>
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
                <button type="button" onClick={() => toggle(h)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 tap transition-all"
                  style={{
                    background: h.done ? h.color + '22' : 'var(--s3)',
                    border: `1.5px solid ${h.done ? h.color : 'var(--b)'}`,
                    color: h.done ? h.color : '#52525b',
                  }}>
                  {h.done
                    ? <Check size={15} strokeWidth={3} />
                    : <span className="text-xs font-black">{h.name.charAt(0).toUpperCase()}</span>
                  }
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
                <button type="button" onClick={() => deleteHabit(h.id)}
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
