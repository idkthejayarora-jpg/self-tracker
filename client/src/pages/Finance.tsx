import { useEffect, useState, useCallback } from 'react';
import { Wallet, Plus, Trash2, ChevronLeft, ChevronRight, Target, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import { format } from 'date-fns';
import type { FinanceEntry, FinanceGoal } from '../types';

const EXPENSE_CATS = ['food', 'rent', 'transport', 'health', 'fitness', 'entertainment', 'shopping', 'education', 'subscriptions', 'other'];
const INCOME_CATS  = ['salary', 'freelance', 'investment', 'gift', 'refund', 'other'];

interface Summary {
  income: number;
  expenses: number;
  net: number;
  categories: { category: string; income: number; expense: number; net: number }[];
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

const emptyEntry = (type: 'income' | 'expense') => ({
  date: new Date().toISOString().slice(0, 10),
  type,
  category: type === 'income' ? 'salary' : 'food',
  amount: '',
  note: '',
});

const TICKER_ITEMS = ['STRENGTH +12','HABITS 87%','SLEEP 7.2h','FOCUS 94%','NET +₹4.2k','XP +240','STREAK 14d','TASKS 8/10','WELLNESS 91%'];
function TickerTape() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div style={{ overflow: 'hidden', height: 20, display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 24, animation: 'ticker-scroll 18s linear infinite', whiteSpace: 'nowrap' }}>
        {items.map((item, i) => (
          <span key={i} className="text-[9px] font-black font-mono tracking-widest"
            style={{ color: item.includes('+') ? '#00ff9f' : item.includes('%') ? '#00f5ff' : '#ff003c',
              textShadow: `0 0 6px currentColor` }}>
            ▶ {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Finance() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [goals, setGoals] = useState<FinanceGoal[]>([]);

  const [showEntry, setShowEntry] = useState(false);
  const [entryForm, setEntryForm] = useState(emptyEntry('expense'));
  const [savingEntry, setSavingEntry] = useState(false);
  const [entryErr, setEntryErr] = useState('');

  const [showGoal, setShowGoal] = useState(false);
  const [goalForm, setGoalForm] = useState({ name: '', target_amount: '', saved_amount: '', deadline: '', color: '#22c55e' });
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalErr, setGoalErr] = useState('');
  const [loadErr, setLoadErr] = useState('');

  const load = useCallback(async () => {
    try {
      setLoadErr('');
      const [entRes, sumRes, goalRes] = await Promise.all([
        api.get<FinanceEntry[]>(`/finance/entries?month=${month}`),
        api.get<Summary>(`/finance/summary?month=${month}`),
        api.get<FinanceGoal[]>('/finance/goals'),
      ]);
      setEntries(entRes.data);
      setSummary(sumRes.data);
      setGoals(goalRes.data);
    } catch (e: any) {
      setLoadErr(e?.response?.data?.error || e?.message || 'Failed to load finance data');
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);
  useSync(load, 120000);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const addEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEntry(true);
    setEntryErr('');
    try {
      await api.post('/finance/entries', { ...entryForm, amount: parseFloat(entryForm.amount as any) });
      setEntryForm(emptyEntry('expense'));
      setShowEntry(false);
      await load();
    } catch (err: any) {
      setEntryErr(err?.response?.data?.error || err?.message || 'Failed to add entry');
    } finally { setSavingEntry(false); }
  };

  const delEntry = async (id: number) => {
    try {
      await api.delete(`/finance/entries/${id}`);
      setEntries(prev => prev.filter(e => e.id !== id));
      await load(); // refresh summary
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to delete entry');
    }
  };

  const addGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGoal(true);
    setGoalErr('');
    try {
      await api.post('/finance/goals', {
        name: goalForm.name,
        target_amount: parseFloat(goalForm.target_amount),
        saved_amount: goalForm.saved_amount ? parseFloat(goalForm.saved_amount) : 0,
        deadline: goalForm.deadline || null,
        color: goalForm.color,
      });
      setGoalForm({ name: '', target_amount: '', saved_amount: '', deadline: '', color: '#22c55e' });
      setShowGoal(false);
      await load();
    } catch (err: any) {
      setGoalErr(err?.response?.data?.error || err?.message || 'Failed to create goal');
    } finally { setSavingGoal(false); }
  };

  const updateGoalSaved = async (goal: FinanceGoal, delta: number) => {
    const newSaved = Math.max(0, goal.saved_amount + delta);
    // Optimistic update
    setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, saved_amount: newSaved } : g));
    try {
      await api.put(`/finance/goals/${goal.id}`, { saved_amount: newSaved });
    } catch {
      // Revert on failure
      setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, saved_amount: goal.saved_amount } : g));
    }
  };

  const delGoal = async (id: number) => {
    try {
      await api.delete(`/finance/goals/${id}`);
      setGoals(prev => prev.filter(g => g.id !== id));
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to delete goal');
    }
  };

  const catChartData = (summary?.categories ?? [])
    .map(c => ({ name: c.category, income: c.income, expense: c.expense }))
    .filter(c => c.income > 0 || c.expense > 0)
    .sort((a, b) => (b.income + b.expense) - (a.income + a.expense))
    .slice(0, 8);

  const monthLabel = format(new Date(`${month}-15`), 'MMMM yyyy');

  return (
    <div className="max-w-xl space-y-4 anim-page"
      style={{ '--accent-rgb': '0 255 159' } as React.CSSProperties}>

      {/* Cyberpunk body overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(0,255,159,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* ── ASSET NEXUS HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl mb-4"
        style={{ background: 'var(--hero-bg)', border: '1px solid #00ff9f20' }}>
        {/* Financial grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(0,255,159,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,159,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
        {/* HUD corners */}
        <div className="absolute top-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #00ff9f', borderLeft: '1.5px solid #00ff9f', opacity: 0.7 }} />
        <div className="absolute top-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #00ff9f', borderRight: '1.5px solid #00ff9f', opacity: 0.7 }} />
        <div className="absolute bottom-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #00ff9f', borderLeft: '1.5px solid #00ff9f', opacity: 0.7 }} />
        <div className="absolute bottom-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #00ff9f', borderRight: '1.5px solid #00ff9f', opacity: 0.7 }} />
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #00ff9f80, transparent)', boxShadow: '0 0 10px #00ff9f' }} />
        {/* Main content */}
        <div className="relative z-10 px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: '#00ff9f', opacity: 0.6 }}>MKT://</span>
                <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">ASSET_NEXUS</span>
                <span className="cursor-blink font-mono" style={{ color: '#00ff9f', fontSize: 11 }}>▌</span>
              </div>
              <h1 className="text-3xl font-black tracking-tight leading-none text-white"
                style={{ textShadow: '0 0 40px #00ff9f40' }}>
                ASSET NEXUS
              </h1>
              <p className="font-mono text-[10px] mt-1" style={{ color: '#00ff9f', opacity: 0.5 }}>
                // financial intelligence — wealth tracking protocol
              </p>
            </div>
            {/* Live indicator */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: '#00ff9f', boxShadow: '0 0 8px #00ff9f', animation: 'neon-pulse 1.5s ease-in-out infinite' }} />
                <span className="text-[9px] font-black tracking-widest" style={{ color: '#00ff9f' }}>LIVE</span>
              </div>
              <span className="text-[8px] font-mono opacity-30 text-white">MARKET OPEN</span>
            </div>
          </div>
        </div>
        {/* Ticker tape */}
        <div className="relative z-10 px-2 pb-2">
          <div style={{ borderTop: '1px solid rgba(0,255,159,0.1)', paddingTop: 6 }}>
            <TickerTape />
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      {/* Month selector */}
      <div className="flex items-center gap-2">
        <button onClick={() => shiftMonth(-1)} className="tap" style={{ color: 'var(--t-dim)' }}><ChevronLeft size={16} /></button>
        <span className="text-sm font-semibold text-head">{monthLabel}</span>
        <button onClick={() => shiftMonth(1)} className="tap" style={{ color: 'var(--t-dim)' }}><ChevronRight size={16} /></button>
      </div>

      {loadErr && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: 'rgb(239 68 68 / 0.08)', color: '#f87171', border: '1px solid rgb(239 68 68 / 0.2)' }}>
          <AlertCircle size={13} />
          {loadErr} — <button type="button" onClick={load} className="underline tap">retry</button>
        </div>
      )}

      {/* Add buttons */}
      <div className="flex gap-2">
        <button type="button" onClick={() => { setEntryForm(emptyEntry('expense')); setEntryErr(''); setShowEntry(true); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold tap"
          style={{ background: 'rgb(239 68 68 / 0.1)', color: '#f87171' }}>
          <TrendingDown size={14} /> Add Expense
        </button>
        <button type="button" onClick={() => { setEntryForm(emptyEntry('income')); setEntryErr(''); setShowEntry(true); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold tap"
          style={{ background: 'rgb(34 197 94 / 0.1)', color: '#4ade80' }}>
          <TrendingUp size={14} /> Add Income
        </button>
      </div>

      {/* Add entry form */}
      {showEntry && (
        <form onSubmit={addEntry} className="card px-4 py-4 space-y-3 scale-in">
          <div className="flex gap-2">
            {(['expense', 'income'] as const).map(t => (
              <button key={t} type="button"
                onClick={() => setEntryForm(f => ({ ...f, type: t, category: t === 'income' ? 'salary' : 'food' }))}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize tap"
                style={{
                  background: entryForm.type === t ? (t === 'income' ? 'rgb(34 197 94 / 0.12)' : 'rgb(239 68 68 / 0.12)') : 'var(--s3)',
                  color: entryForm.type === t ? (t === 'income' ? '#4ade80' : '#f87171') : '#71717a',
                }}>
                {t}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>AMOUNT</label>
              <input type="number" step="0.01" min="0" required
                value={entryForm.amount} onChange={e => setEntryForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>DATE</label>
              <input type="date" value={entryForm.date} onChange={e => setEntryForm(f => ({ ...f, date: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>CATEGORY</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {(entryForm.type === 'income' ? INCOME_CATS : EXPENSE_CATS).map(cat => (
                <button key={cat} type="button"
                  onClick={() => setEntryForm(f => ({ ...f, category: cat }))}
                  className="px-2.5 py-1 rounded-full text-xs font-medium capitalize tap"
                  style={{
                    background: entryForm.category === cat ? `rgb(var(--accent-rgb) / 0.12)` : 'var(--s3)',
                    color: entryForm.category === cat ? `rgb(var(--accent-rgb-light))` : '#71717a',
                  }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>NOTE</label>
            <input value={entryForm.note} onChange={e => setEntryForm(f => ({ ...f, note: e.target.value }))}
              placeholder="e.g. Groceries"
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
          </div>
          {entryErr && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgb(239 68 68 / 0.1)', color: '#f87171' }}>
              <AlertCircle size={13} />{entryErr}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowEntry(false); setEntryErr(''); }}
              className="flex-1 py-2 rounded-lg text-sm font-medium tap"
              style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>Cancel</button>
            <button type="submit" disabled={savingEntry}
              className="flex-1 py-2 rounded-lg text-sm font-semibold tap disabled:opacity-50"
              style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
              {savingEntry ? 'Saving...' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-2">
          <div className="card px-3 py-3">
            <p className="text-[10px] font-medium mb-1" style={{ color: 'rgb(var(--accent-rgb))', opacity: 0.7 }}>Income</p>
            <p className="text-base font-bold" style={{ color: '#22c55e' }}>₹{fmt(summary.income)}</p>
          </div>
          <div className="card px-3 py-3">
            <p className="text-[10px] font-medium mb-1" style={{ color: '#52525b' }}>Expenses</p>
            <p className="text-base font-bold" style={{ color: '#ef4444' }}>₹{fmt(summary.expenses)}</p>
          </div>
          <div className="card px-3 py-3">
            <p className="text-[10px] font-medium mb-1" style={{ color: '#52525b' }}>Net</p>
            <p className="text-base font-bold" style={{ color: summary.net >= 0 ? '#22c55e' : '#ef4444' }}>
              {summary.net >= 0 ? '+' : ''}₹{fmt(summary.net)}
            </p>
          </div>
        </div>
      )}

      {/* Category chart */}
      {catChartData.length > 0 && (
        <div className="card px-4 py-4">
          <p className="text-xs font-semibold mb-3" style={{ color: '#52525b', letterSpacing: '0.05em' }}>BY CATEGORY</p>
          <ResponsiveContainer width="100%" height={catChartData.length * 28 + 10} minHeight={80}>
            <BarChart data={catChartData} layout="vertical" barSize={10}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#52525b' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#a1a1aa' }} width={70} />
              <Tooltip
                contentStyle={{ background: 'var(--s2)', border: '1px solid var(--b)', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="expense" name="Expense" radius={[0, 4, 4, 0]}>
                {catChartData.map((_, i) => <Cell key={i} fill="#ef4444" fillOpacity={0.7} />)}
              </Bar>
              <Bar dataKey="income" name="Income" radius={[0, 4, 4, 0]}>
                {catChartData.map((_, i) => <Cell key={i} fill="#22c55e" fillOpacity={0.7} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Entries */}
      {entries.length > 0 && (
        <div className="card px-4 py-4">
          <p className="text-xs font-semibold mb-3" style={{ color: '#52525b', letterSpacing: '0.05em' }}>TRANSACTIONS</p>
          <div className="space-y-0">
            {entries.map(e => (
              <div key={e.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid var(--b)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-head capitalize">{e.category}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full capitalize font-medium"
                      style={{
                        background: e.type === 'income' ? 'rgb(34 197 94 / 0.1)' : 'rgb(239 68 68 / 0.1)',
                        color: e.type === 'income' ? '#4ade80' : '#f87171',
                      }}>
                      {e.type}
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--t-dim)' }}>
                    {format(new Date(e.date + 'T12:00:00'), 'd MMM')}{e.note ? ` · ${e.note}` : ''}
                  </p>
                </div>
                <p className="text-sm font-bold shrink-0" style={{ color: e.type === 'income' ? '#22c55e' : '#ef4444' }}>
                  {e.type === 'income' ? '+' : '-'}₹{fmt(e.amount)}
                </p>
                <button onClick={() => delEntry(e.id)} className="tap" style={{ color: '#52525b' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Savings Goals */}
      <div className="card px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold" style={{ color: '#52525b', letterSpacing: '0.05em' }}>SAVINGS GOALS</p>
          <button onClick={() => setShowGoal(s => !s)}
            className="flex items-center gap-1 text-[11px] font-semibold tap"
            style={{ color: `rgb(var(--accent-rgb-light))` }}>
            <Plus size={12} /> Add goal
          </button>
        </div>

        {showGoal && (
          <form onSubmit={addGoal} className="space-y-3 mb-4 p-3 rounded-xl" style={{ background: 'var(--s2)' }}>
            <input required value={goalForm.name} onChange={e => setGoalForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Goal name (e.g. Emergency fund)"
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>TARGET (₹)</label>
                <input type="number" min="0" required
                  value={goalForm.target_amount} onChange={e => setGoalForm(f => ({ ...f, target_amount: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
              </div>
              <div>
                <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>SAVED SO FAR (₹)</label>
                <input type="number" min="0"
                  value={goalForm.saved_amount} onChange={e => setGoalForm(f => ({ ...f, saved_amount: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>DEADLINE (optional)</label>
              <input type="date" value={goalForm.deadline} onChange={e => setGoalForm(f => ({ ...f, deadline: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
            </div>
            {goalErr && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                style={{ background: 'rgb(239 68 68 / 0.1)', color: '#f87171' }}>
                <AlertCircle size={13} />{goalErr}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowGoal(false); setGoalErr(''); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium tap"
                style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>Cancel</button>
              <button type="submit" disabled={savingGoal}
                className="flex-1 py-2 rounded-lg text-sm font-semibold tap disabled:opacity-50"
                style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
                {savingGoal ? '...' : 'Create Goal'}
              </button>
            </div>
          </form>
        )}

        {goals.length === 0 && !showGoal && (
          <p className="text-sm text-center py-4" style={{ color: '#52525b' }}>No goals yet</p>
        )}

        <div className="space-y-3">
          {goals.map(g => {
            const pct = g.target_amount > 0 ? Math.min(100, Math.round((g.saved_amount / g.target_amount) * 100)) : 0;
            return (
              <div key={g.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target size={13} style={{ color: g.color }} />
                    <p className="text-sm font-semibold text-head">{g.name}</p>
                    {g.deadline && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>
                        {format(new Date(g.deadline + 'T12:00:00'), 'MMM yyyy')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: g.color }}>{pct}%</span>
                    <button onClick={() => delGoal(g.id)} className="tap" style={{ color: '#52525b' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="h-1.5 rounded-full w-full" style={{ background: 'var(--s3)' }}>
                  <div className="h-1.5 rounded-full bar-fill" style={{ width: `${pct}%`, background: g.color }} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateGoalSaved(g, -1000)}
                      className="text-[11px] px-2 py-0.5 rounded tap" style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>−₹1k</button>
                    <button onClick={() => updateGoalSaved(g, 1000)}
                      className="text-[11px] px-2 py-0.5 rounded tap" style={{ background: 'var(--s3)', color: `rgb(var(--accent-rgb-light))` }}>+₹1k</button>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--t-dim)' }}>₹{fmt(g.saved_amount)} / ₹{fmt(g.target_amount)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {entries.length === 0 && !showEntry && summary?.income === 0 && summary?.expenses === 0 && (
        <div className="card py-12 text-center">
          <Wallet size={28} style={{ color: '#52525b', margin: '0 auto 8px' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--t-dim)' }}>No transactions for {monthLabel}</p>
        </div>
      )}

      </div>{/* end relative zIndex wrapper */}
    </div>
  );
}
