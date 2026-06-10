import { useEffect, useState, useCallback } from 'react';
import { Target, Plus, Trash2, Flame, Check, AlertCircle, Zap } from 'lucide-react';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import { format } from 'date-fns';
import type { Habit } from '../types';

const CATEGORIES = ['all', 'discipline', 'physical', 'mental', 'health', 'other'] as const;
const CAT_COLOR: Record<string, string> = {
  discipline: '#d97757',
  physical:   '#d97757',
  mental:     '#e59a7f',
  health:     '#cf8a3e',
  other:      '#757163',
};

function getToday() { return new Date().toISOString().slice(0, 10); }

const emptyForm = () => ({ name: '', icon: '', category: 'discipline', color: '#d97757' });

interface Violation { habit_id: number; missStreak: number; penaltyToday: number; }
interface Momentum { multiplier: number; expiresAt: string; }

export default function Habits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [streaks, setStreaks] = useState<Record<number, number>>({});
  const [violations, setViolations] = useState<Record<number, Violation>>({});
  const [momentum, setMomentum] = useState<Momentum | null>(null);
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
      const [habitsRes, streaksRes, enfRes] = await Promise.all([
        api.get<Habit[]>(`/habits/logs?date=${td}`),
        api.get<{ habit_id: number; streak: number }[]>('/habits/streaks'),
        api.get<{ violations: Violation[]; momentum: Momentum | null }>('/habits/enforcement')
          .catch(() => ({ data: { violations: [], momentum: null } })),
      ]);
      setHabits(habitsRes.data);
      const sm: Record<number, number> = {};
      streaksRes.data.forEach(s => { sm[s.habit_id] = s.streak; });
      setStreaks(sm);
      const vm: Record<number, Violation> = {};
      enfRes.data.violations.forEach(v => { vm[v.habit_id] = v; });
      setViolations(vm);
      setMomentum(enfRes.data.momentum);
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
      style={{ '--accent-rgb': '217 119 87' } as React.CSSProperties}>

      {/* Cyberpunk body overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(212,162,127,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* ── BIORHYTHM HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl mb-4"
        style={{ background: 'var(--hero-bg)', border: '1px solid #d4a27f25', minHeight: 110 }}>
        {/* Pulse rings */}
        <div className="absolute pointer-events-none" style={{ top: '50%', right: 40, transform: 'translateY(-50%)' }}>
          <div className="absolute rounded-full" style={{
            width: 80, height: 80, top: -40, left: -40,
            border: '1px solid #d4a27f',
            animation: 'pulse-ring-out 2.4s ease-out 0ms infinite',
          }} />
          <div className="absolute rounded-full" style={{
            width: 80, height: 80, top: -40, left: -40,
            border: '1px solid #d4a27f',
            animation: 'pulse-ring-out 2.4s ease-out 600ms infinite',
          }} />
          <div className="absolute rounded-full" style={{
            width: 80, height: 80, top: -40, left: -40,
            border: '1px solid #d4a27f',
            animation: 'pulse-ring-out 2.4s ease-out 1200ms infinite',
          }} />
          <div className="w-3 h-3 rounded-full absolute" style={{
            top: -6, left: -6,
            background: '#f0abfc',
            boxShadow: 'none',
          }} />
        </div>
        {/* HUD corners */}
        <div className="absolute top-0 left-0 pointer-events-none"
          style={{ width: 12, height: 12, borderTop: '1.5px solid #d4a27f', borderLeft: '1.5px solid #d4a27f', opacity: 0.6 }} />
        <div className="absolute top-0 right-0 pointer-events-none"
          style={{ width: 12, height: 12, borderTop: '1.5px solid #d4a27f', borderRight: '1.5px solid #d4a27f', opacity: 0.6 }} />
        <div className="absolute bottom-0 left-0 pointer-events-none"
          style={{ width: 12, height: 12, borderBottom: '1.5px solid #d4a27f', borderLeft: '1.5px solid #d4a27f', opacity: 0.6 }} />
        <div className="absolute bottom-0 right-0 pointer-events-none"
          style={{ width: 12, height: 12, borderBottom: '1.5px solid #d4a27f', borderRight: '1.5px solid #d4a27f', opacity: 0.6 }} />
        {/* Top neon edge */}
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: '#d4a27f60', boxShadow: 'none' }} />
        {/* Content */}
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: '#d4a27f', opacity: 0.6 }}>BIO://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">BEHAVIORAL_MATRIX</span>
            <span className="cursor-blink font-mono" style={{ color: '#f0abfc', fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight leading-none text-white"
            style={{ textShadow: 'none' }}>
            BEHAVIORAL MATRIX
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: '#d4a27f', opacity: 0.5 }}>
            {'// neural pathway reinforcement protocol — daily cycles active'}
          </p>
        </div>
        {/* Bottom neon edge */}
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: '#d4a27f40' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium mb-0.5" style={{ color: '#57544a', letterSpacing: '0.05em' }}>
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
          style={{ background: 'rgb(239 68 68 / 0.08)', color: '#e07b62', border: '1px solid rgb(239 68 68 / 0.2)' }}>
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

      {/* Momentum buff badge */}
      {momentum && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl scale-in"
          style={{ background: 'rgba(207,138,62,0.10)', border: '1px solid rgba(207,138,62,0.4)', boxShadow: 'none' }}>
          <Zap size={14} color="#cf8a3e" className="glow-pulse" />
          <span className="text-xs font-black tracking-wide" style={{ color: '#cf8a3e' }}>
            MOMENTUM ×{momentum.multiplier}
          </span>
          <span className="text-[11px] font-mono" style={{ color: '#cf8a3e', opacity: 0.7 }}>
            · habit points doubled — keep the streak alive
          </span>
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
                    color: form.category === cat ? CAT_COLOR[cat] : '#757163',
                    border: form.category === cat ? `1px solid ${CAT_COLOR[cat]}44` : '1px solid transparent',
                  }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          {formErr && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgb(239 68 68 / 0.1)', color: '#e07b62' }}>
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
              color: filter === cat ? `rgb(var(--accent-rgb-light))` : '#757163',
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
          <Target size={28} style={{ color: '#57544a', margin: '0 auto 8px' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--t-dim)' }}>
            {habits.length === 0 ? 'No habits yet — add one above' : 'No habits in this category'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(h => {
            const streak = streaks[h.id] ?? 0;
            const viol = violations[h.id];
            return (
              <div key={h.id} className="card px-4 py-3 flex items-center gap-3"
                style={viol ? {
                  borderColor: 'rgba(205,82,64,0.55)',
                  boxShadow: 'none',
                  animation: 'glow-pulse 2s ease-in-out infinite',
                } : undefined}>
                {/* Done toggle */}
                <button type="button" onClick={() => toggle(h)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 tap transition-all"
                  style={{
                    background: h.done ? h.color + '22' : 'var(--s3)',
                    border: `1.5px solid ${h.done ? h.color : 'var(--b)'}`,
                    color: h.done ? h.color : '#57544a',
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
                  {viol ? (
                    <p className="text-[10px] font-black tracking-wide mt-0.5 flex items-center gap-1" style={{ color: '#cd5240' }}>
                      <Flame size={10} /> {viol.missStreak} DAYS MISSED · PENALTY ACTIVE
                    </p>
                  ) : (
                    <p className="text-[11px] capitalize mt-0.5" style={{ color: CAT_COLOR[h.category] ?? '#757163' }}>
                      {h.category}
                    </p>
                  )}
                </div>

                {/* Streak */}
                {streak > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Flame size={12} color="#d97757" />
                    <span className="text-[11px] font-bold" style={{ color: '#d97757' }}>{streak}</span>
                  </div>
                )}

                {/* Delete */}
                <button type="button" onClick={() => deleteHabit(h.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg tap"
                  style={{ color: '#57544a' }}>
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
