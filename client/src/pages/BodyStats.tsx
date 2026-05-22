import { useEffect, useState, useCallback } from 'react';
import { Activity, Plus, Trash2, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import { format } from 'date-fns';
import type { BodyStat } from '../types';

const FIELDS: { key: keyof BodyStat; label: string; unit: string }[] = [
  { key: 'weight_kg',    label: 'Weight',    unit: 'kg'  },
  { key: 'body_fat_pct', label: 'Body Fat',  unit: '%'   },
  { key: 'chest_cm',    label: 'Chest',     unit: 'cm'  },
  { key: 'waist_cm',    label: 'Waist',     unit: 'cm'  },
  { key: 'hips_cm',     label: 'Hips',      unit: 'cm'  },
  { key: 'bicep_cm',    label: 'Bicep',     unit: 'cm'  },
  { key: 'neck_cm',     label: 'Neck',      unit: 'cm'  },
];

function Trend({ curr, prev }: { curr?: number | null; prev?: number | null }) {
  if (curr == null || prev == null) return <Minus size={12} style={{ color: '#52525b' }} />;
  if (curr > prev) return <TrendingUp size={12} style={{ color: '#f97316' }} />;
  if (curr < prev) return <TrendingDown size={12} style={{ color: '#22c55e' }} />;
  return <Minus size={12} style={{ color: '#52525b' }} />;
}

const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  weight_kg: '', body_fat_pct: '',
  chest_cm: '', waist_cm: '', hips_cm: '', neck_cm: '', bicep_cm: '',
  notes: '',
});

function EKGLine() {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none overflow-hidden" style={{ opacity: 0.4 }}>
      <svg viewBox="0 0 400 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
        <polyline
          points="0,20 40,20 55,20 65,5 75,28 85,15 95,20 140,20 155,20 165,2 175,28 185,14 195,20 240,20 255,20 265,4 275,28 285,15 295,20 340,20 355,20 365,3 375,28 385,15 400,20"
          fill="none" stroke="#38bdf8" strokeWidth="1.5"
          strokeDasharray="200" style={{ animation: 'ekg-sweep 2.5s linear infinite' }}
        />
      </svg>
    </div>
  );
}

export default function BodyStats() {
  const [stats, setStats] = useState<BodyStat[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [loadErr, setLoadErr] = useState('');

  const load = useCallback(async () => {
    try {
      setLoadErr('');
      const res = await api.get<BodyStat[]>('/body');
      setStats(res.data);
    } catch (e: any) {
      setLoadErr(e?.response?.data?.error || e?.message || 'Failed to load stats');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useSync(load, 120000);

  const latest = stats[0];
  const prev = stats[1];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormErr('');
    try {
      const payload: any = { date: form.date, notes: form.notes || null };
      FIELDS.forEach(f => {
        const v = (form as any)[f.key];
        payload[f.key] = v !== '' ? parseFloat(v) : null;
      });
      await api.post('/body', payload);
      setForm(emptyForm());
      setShowForm(false);
      await load();
    } catch (err: any) {
      setFormErr(err?.response?.data?.error || err?.message || 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: number) => {
    try {
      await api.delete(`/body/${id}`);
      setStats(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to delete entry');
    }
  };

  // Chart data — weight over time
  const chartData = [...stats].reverse().map(s => ({
    date: s.date.slice(5), // MM-DD
    weight: s.weight_kg,
    fat: s.body_fat_pct,
  }));

  return (
    <div className="max-w-2xl mx-auto space-y-5 anim-page"
      style={{ '--accent-rgb': '56 189 248' } as React.CSSProperties}>

      {/* Cyberpunk body overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(56,189,248,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      <div className="page-header flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex items-center justify-center rounded-2xl"
            style={{ width: 44, height: 44, background: '#06b6d415', border: '1px solid #06b6d425' }}>
            <Activity size={22} style={{ color: '#06b6d4' }} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-head tracking-tight">Body</h1>
            <p className="text-xs text-muted mt-0.5">Biometric tracking</p>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--t-dim)' }}>
          {latest ? `Last logged ${format(new Date(latest.date + 'T12:00:00'), 'd MMM yyyy')}` : 'No entries yet'}
        </p>
        <button type="button" onClick={() => { setShowForm(s => !s); setFormErr(''); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold tap"
          style={{ background: `rgb(var(--accent-rgb) / 0.12)`, color: `rgb(var(--accent-rgb-light))` }}>
          <Plus size={15} /> Log
        </button>
      </div>

      {loadErr && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: 'rgb(239 68 68 / 0.08)', color: '#f87171', border: '1px solid rgb(239 68 68 / 0.2)' }}>
          <AlertCircle size={13} />
          {loadErr} — <button type="button" onClick={load} className="underline tap">retry</button>
        </div>
      )}

      {/* Latest stats card */}
      {latest && (
        <div className="card px-4 py-4">
          <p className="text-xs font-semibold mb-3" style={{ color: '#52525b', letterSpacing: '0.05em' }}>
            LATEST — {format(new Date(latest.date + 'T12:00:00'), 'd MMM yyyy')}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {FIELDS.map(({ key, label, unit }) => {
              const val = latest[key] as number | null;
              if (val == null) return null;
              return (
                <div key={key}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <Trend curr={val} prev={prev?.[key] as number | null} />
                    <span className="text-[11px]" style={{ color: '#52525b' }}>{label}</span>
                  </div>
                  <p className="text-lg font-bold text-head">{val}<span className="text-xs font-normal ml-0.5" style={{ color: 'var(--t-dim)' }}>{unit}</span></p>
                </div>
              );
            })}
          </div>
          {latest.notes && (
            <p className="text-xs mt-3 pt-3 italic" style={{ color: 'var(--t-dim)', borderTop: '1px solid var(--b)' }}>{latest.notes}</p>
          )}
        </div>
      )}

      {/* Log form */}
      {showForm && (
        <form onSubmit={save} className="card px-4 py-4 space-y-3 scale-in">
          <p className="text-sm font-semibold text-head">Log measurements</p>
          <div>
            <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>DATE</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map(({ key, label, unit }) => (
              <div key={key}>
                <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>{label.toUpperCase()} ({unit})</label>
                <input
                  type="number" step="0.1" min="0"
                  value={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={`e.g. ${key === 'weight_kg' ? '75.5' : key === 'body_fat_pct' ? '18' : '95'}`}
                  className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
              </div>
            ))}
          </div>
          <div>
            <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>NOTES</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Any notes..."
              rows={2}
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1 resize-none" />
          </div>
          <div className="flex gap-2">
            {formErr && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs col-span-2"
                style={{ background: 'rgb(239 68 68 / 0.1)', color: '#f87171' }}>
                <AlertCircle size={13} />{formErr}
              </div>
            )}
            <button type="button" onClick={() => { setShowForm(false); setFormErr(''); }}
              className="flex-1 py-2 rounded-lg text-sm font-medium tap"
              style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-lg text-sm font-semibold tap disabled:opacity-50"
              style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {/* Chart */}
      {chartData.filter(d => d.weight != null).length > 1 && (
        <div className="card px-4 py-4">
          <p className="text-xs font-semibold mb-3" style={{ color: 'rgb(var(--accent-rgb))', letterSpacing: '0.05em' }}>// WEIGHT TREND</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--s3)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#52525b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#52525b' }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: 'var(--s2)', border: '1px solid var(--b)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#a1a1aa' }}
              />
              <Line type="monotone" dataKey="weight" stroke="rgb(var(--accent-rgb))" strokeWidth={2} dot={false} name="Weight (kg)" />
              {chartData.some(d => d.fat != null) && (
                <Line type="monotone" dataKey="fat" stroke="#a855f7" strokeWidth={2} dot={false} name="Body fat %" />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* History */}
      {stats.length > 0 && (
        <div className="card px-4 py-4">
          <p className="text-xs font-semibold mb-3" style={{ color: 'rgb(var(--accent-rgb))', letterSpacing: '0.05em' }}>// HISTORY</p>
          <div className="space-y-2">
            {stats.map(s => (
              <div key={s.id} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--b)' }}>
                <Activity size={13} style={{ color: '#52525b', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-head">{format(new Date(s.date + 'T12:00:00'), 'd MMM yyyy')}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--t-dim)' }}>
                    {[
                      s.weight_kg != null && `${s.weight_kg}kg`,
                      s.body_fat_pct != null && `${s.body_fat_pct}% fat`,
                      s.waist_cm != null && `${s.waist_cm}cm waist`,
                    ].filter(Boolean).join(' · ') || 'No data'}
                  </p>
                </div>
                <button onClick={() => del(s.id)} className="tap" style={{ color: '#52525b' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.length === 0 && !showForm && (
        <div className="card py-12 text-center">
          <Activity size={28} style={{ color: '#52525b', margin: '0 auto 8px' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--t-dim)' }}>No measurements yet</p>
          <p className="text-xs mt-1" style={{ color: '#52525b' }}>Tap "Log" to add your first entry</p>
        </div>
      )}

      </div>{/* end relative zIndex wrapper */}
    </div>
  );
}
