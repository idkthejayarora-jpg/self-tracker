import { useEffect, useState, useCallback } from 'react';
import { Moon, Plus, Trash2, Star, Clock, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import { format } from 'date-fns';
import type { SleepLog } from '../types';

const QUALITY_LABEL = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Great'];
const QUALITY_COLOR = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];

function fmtDuration(minutes?: number | null) {
  if (!minutes) return '--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function calcDuration(bedtime: string, wakeTime: string): number | null {
  if (!bedtime || !wakeTime) return null;
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wakeTime.split(':').map(Number);
  let bedMins = bh * 60 + bm;
  let wakeMins = wh * 60 + wm;
  if (wakeMins < bedMins) wakeMins += 24 * 60; // crosses midnight
  return wakeMins - bedMins;
}

const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  bedtime: '', wake_time: '', quality: 3, notes: '',
});

export default function Sleep() {
  const [logs, setLogs] = useState<SleepLog[]>([]);
  const [stats, setStats] = useState<{ avgDuration: number | null; avgQuality: number | null; sleepDebt: number; count: number } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [loadErr, setLoadErr] = useState('');

  const autoDuration = calcDuration(form.bedtime, form.wake_time);

  const load = useCallback(async () => {
    try {
      setLoadErr('');
      const [logsRes, statsRes] = await Promise.all([
        api.get<SleepLog[]>('/sleep'),
        api.get('/sleep/stats'),
      ]);
      setLogs(logsRes.data);
      setStats(statsRes.data);
    } catch (e: any) {
      setLoadErr(e?.response?.data?.error || e?.message || 'Failed to load sleep logs');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useSync(load, 120000);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormErr('');
    try {
      await api.post('/sleep', {
        date: form.date,
        bedtime: form.bedtime || null,
        wake_time: form.wake_time || null,
        duration_minutes: autoDuration,
        quality: form.quality,
        notes: form.notes || null,
      });
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
      await api.delete(`/sleep/${id}`);
      setLogs(prev => prev.filter(l => l.id !== id));
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to delete log');
    }
  };

  const last7 = [...logs].slice(0, 7).reverse();

  const chartData = last7.map(l => ({
    date: l.date.slice(5),
    hours: l.duration_minutes ? +(l.duration_minutes / 60).toFixed(1) : 0,
    quality: l.quality,
  }));

  return (
    <div className="max-w-xl space-y-4 anim-page">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-head tracking-tight">Sleep</h1>
          <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>
            {stats && stats.avgDuration ? `Avg ${fmtDuration(stats.avgDuration)} / night this week` : 'Track your sleep'}
          </p>
        </div>
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

      {/* Stats row */}
      {stats && stats.count > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Avg Duration', val: fmtDuration(stats.avgDuration), color: '#6366f1' },
            { label: 'Avg Quality', val: stats.avgQuality ? `${stats.avgQuality}/5` : '--', color: '#a855f7' },
            { label: 'Sleep Debt', val: stats.sleepDebt > 0 ? `${fmtDuration(stats.sleepDebt)}` : 'None', color: stats.sleepDebt > 60 ? '#ef4444' : '#22c55e' },
          ].map(({ label, val, color }) => (
            <div key={label} className="card px-3 py-3">
              <p className="text-[10px] font-medium mb-1" style={{ color: '#52525b' }}>{label}</p>
              <p className="text-lg font-bold" style={{ color }}>{val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Log form */}
      {showForm && (
        <form onSubmit={save} className="card px-4 py-4 space-y-3 scale-in">
          <p className="text-sm font-semibold text-head">Log sleep</p>
          <div>
            <label className="text-[11px] font-medium" style={{ color: '#71717a' }}>DATE (morning)</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium" style={{ color: '#71717a' }}>BEDTIME</label>
              <input type="time" value={form.bedtime} onChange={e => setForm(f => ({ ...f, bedtime: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-medium" style={{ color: '#71717a' }}>WAKE TIME</label>
              <input type="time" value={form.wake_time} onChange={e => setForm(f => ({ ...f, wake_time: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
            </div>
          </div>
          {autoDuration !== null && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ background: 'var(--s3)' }}>
              <Clock size={13} style={{ color: '#71717a' }} />
              <span className="text-xs" style={{ color: '#a1a1aa' }}>Duration: <strong style={{ color: '#f4f4f5' }}>{fmtDuration(autoDuration)}</strong></span>
            </div>
          )}
          <div>
            <label className="text-[11px] font-medium" style={{ color: '#71717a' }}>QUALITY</label>
            <div className="flex gap-1.5 mt-1">
              {[1, 2, 3, 4, 5].map(q => (
                <button key={q} type="button"
                  onClick={() => setForm(f => ({ ...f, quality: q }))}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold tap"
                  style={{
                    background: form.quality === q ? QUALITY_COLOR[q] + '22' : 'var(--s3)',
                    color: form.quality === q ? QUALITY_COLOR[q] : '#71717a',
                    border: `1px solid ${form.quality === q ? QUALITY_COLOR[q] + '44' : 'transparent'}`,
                  }}>
                  <Star size={11} className="inline mb-0.5 mr-0.5" />{q}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium" style={{ color: '#71717a' }}>NOTES</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Dreamt well, woke up refreshed..."
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
          </div>
          {formErr && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgb(239 68 68 / 0.1)', color: '#f87171' }}>
              <AlertCircle size={13} />{formErr}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowForm(false); setFormErr(''); }}
              className="flex-1 py-2 rounded-lg text-sm font-medium tap"
              style={{ background: 'var(--s3)', color: '#71717a' }}>Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-lg text-sm font-semibold tap disabled:opacity-50"
              style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="card px-4 py-4">
          <p className="text-xs font-semibold mb-3" style={{ color: '#52525b', letterSpacing: '0.05em' }}>SLEEP DURATION (hrs)</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} barSize={20}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#52525b' }} />
              <YAxis domain={[0, 12]} tick={{ fontSize: 10, fill: '#52525b' }} />
              <Tooltip
                contentStyle={{ background: 'var(--s2)', border: '1px solid var(--b)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: any) => [`${v}h`, 'Sleep']}
              />
              <ReferenceLine y={8} stroke="#52525b" strokeDasharray="4 2" />
              <Bar dataKey="hours" radius={[4, 4, 0, 0]} fill="rgb(var(--accent-rgb))" />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] mt-1 text-center" style={{ color: '#52525b' }}>Dashed line = 8h goal</p>
        </div>
      )}

      {/* Log list */}
      {logs.length > 0 ? (
        <div className="card px-4 py-4">
          <p className="text-xs font-semibold mb-3" style={{ color: '#52525b', letterSpacing: '0.05em' }}>HISTORY</p>
          <div className="space-y-0">
            {logs.slice(0, 10).map(l => (
              <div key={l.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid var(--b)' }}>
                <Moon size={13} style={{ color: '#52525b', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-head">{format(new Date(l.date + 'T12:00:00'), 'd MMM')}</p>
                    {l.bedtime && l.wake_time && (
                      <span className="text-[11px]" style={{ color: '#71717a' }}>{l.bedtime} → {l.wake_time}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] font-semibold" style={{ color: 'rgb(var(--accent-rgb-light))' }}>
                      {fmtDuration(l.duration_minutes)}
                    </span>
                    {l.quality && (
                      <span className="text-[11px] font-medium" style={{ color: QUALITY_COLOR[l.quality] }}>
                        {QUALITY_LABEL[l.quality]}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => del(l.id)} className="tap" style={{ color: '#52525b' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : !showForm && (
        <div className="card py-12 text-center">
          <Moon size={28} style={{ color: '#52525b', margin: '0 auto 8px' }} />
          <p className="text-sm font-medium" style={{ color: '#71717a' }}>No sleep logs yet</p>
          <p className="text-xs mt-1" style={{ color: '#52525b' }}>Tap "Log" to add last night's sleep</p>
        </div>
      )}
    </div>
  );
}
