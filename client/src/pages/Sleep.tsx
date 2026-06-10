import { useEffect, useState, useCallback, useRef } from 'react';
import { Moon, Plus, Trash2, Star, Clock, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import { format } from 'date-fns';
import type { SleepLog } from '../types';

const QUALITY_LABEL = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Great'];
const QUALITY_COLOR = ['', '#cd5240', '#d97757', '#d9a066', '#cf8a3e', '#d9a066'];

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

function StarField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.offsetWidth || 600; const H = 130;
    c.width = W; c.height = H;
    const stars = Array.from({ length: 80 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.5 + 0.3,
      speed: Math.random() * 0.3 + 0.05,
      phase: Math.random() * Math.PI * 2,
    }));
    let raf: number;
    function draw() {
      ctx!.clearRect(0, 0, W, H);
      const t = Date.now() / 1000;
      stars.forEach(s => {
        const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        const color = Math.random() > 0.9 ? '#f0abfc' : (Math.random() > 0.7 ? '#d4a27f' : '#ffffff');
        ctx!.fillStyle = color;
        ctx!.globalAlpha = alpha;
        ctx!.fill();
      });
      ctx!.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} style={{ width: '100%', height: 130, display: 'block' }} />;
}

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

  // Group logs by date for display
  const byDate: Map<string, SleepLog[]> = new Map();
  for (const l of logs) {
    if (!byDate.has(l.date)) byDate.set(l.date, []);
    byDate.get(l.date)!.push(l);
  }
  const groupedDates = Array.from(byDate.keys()).slice(0, 14); // last 14 days

  // Chart: aggregate duration per day (sum), take last 7 unique dates
  const chartDates = groupedDates.slice(0, 7).reverse();
  const chartData = chartDates.map(date => {
    const entries = byDate.get(date)!;
    const totalMins = entries.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const avgQuality = entries.reduce((s, e) => s + (e.quality || 0), 0) / entries.filter(e => e.quality).length || 0;
    return {
      date: date.slice(5),
      hours: totalMins ? +(totalMins / 60).toFixed(1) : 0,
      quality: Math.round(avgQuality),
    };
  });

  return (
    <div className="max-w-2xl mx-auto space-y-5 anim-page"
      style={{ '--accent-rgb': '229 154 127' } as React.CSSProperties}>

      {/* Cyberpunk body overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(212,162,127,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* ── DEEP SPACE HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl mb-4"
        style={{ background: 'var(--hero-bg)', border: '1px solid #d4a27f25', minHeight: 130 }}>
        {/* Starfield */}
        <div className="absolute inset-0 pointer-events-none">
          <StarField />
        </div>
        {/* Dark bottom vignette */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.7) 100%)' }} />
        {/* Nebula glow spot */}
        <div className="absolute pointer-events-none" style={{
          right: -20, top: -20, width: 150, height: 150, borderRadius: '50%',
          background: 'radial-gradient(circle, #d4a27f15 0%, transparent 70%)',
          filter: 'blur(20px)',
        }} />
        {/* HUD corners */}
        <div className="absolute top-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #d4a27f', borderLeft: '1.5px solid #d4a27f', opacity: 0.7 }} />
        <div className="absolute top-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #d4a27f', borderRight: '1.5px solid #d4a27f', opacity: 0.7 }} />
        <div className="absolute bottom-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #d4a27f', borderLeft: '1.5px solid #d4a27f', opacity: 0.7 }} />
        <div className="absolute bottom-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #d4a27f', borderRight: '1.5px solid #d4a27f', opacity: 0.7 }} />
        {/* Top violet edge */}
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #d4a27f80, transparent)', boxShadow: '0 0 10px #d4a27f' }} />
        {/* Content */}
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: '#d4a27f', opacity: 0.6 }}>VOID://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">HYPERSLEEP_ARCHIVE</span>
            <span className="cursor-blink font-mono" style={{ color: '#d4a27f', fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight leading-none text-white"
            style={{ textShadow: '0 0 40px #d4a27f50' }}>
            HYPERSLEEP ARCHIVE
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: '#d4a27f', opacity: 0.5 }}>
            // rest cycle analysis — neural recovery metrics
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #d4a27f30, transparent)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--t-dim)' }}>
          {stats && stats.avgDuration ? `Avg ${fmtDuration(stats.avgDuration)} / night this week` : 'Track your sleep'}
        </p>
        <button type="button" onClick={() => { setShowForm(s => !s); setFormErr(''); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold tap"
          style={{ background: `rgb(var(--accent-rgb) / 0.12)`, color: `rgb(var(--accent-rgb-light))` }}>
          <Plus size={15} /> Log
        </button>
      </div>

      {loadErr && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: 'rgb(239 68 68 / 0.08)', color: '#e07b62', border: '1px solid rgb(239 68 68 / 0.2)' }}>
          <AlertCircle size={13} />
          {loadErr} — <button type="button" onClick={load} className="underline tap">retry</button>
        </div>
      )}

      {/* Stats row */}
      {stats && stats.count > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Avg Duration', val: fmtDuration(stats.avgDuration), color: '#d97757' },
            { label: 'Avg Quality', val: stats.avgQuality ? `${stats.avgQuality}/5` : '--', color: '#e59a7f' },
            { label: 'Sleep Debt', val: stats.sleepDebt > 0 ? `${fmtDuration(stats.sleepDebt)}` : 'None', color: stats.sleepDebt > 60 ? '#cd5240' : '#cf8a3e' },
          ].map(({ label, val, color }) => (
            <div key={label} className="card px-3 py-3">
              <p className="text-[10px] font-medium mb-1" style={{ color: '#57544a' }}>{label}</p>
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
            <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>DATE (morning)</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>BEDTIME</label>
              <input type="time" value={form.bedtime} onChange={e => setForm(f => ({ ...f, bedtime: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>WAKE TIME</label>
              <input type="time" value={form.wake_time} onChange={e => setForm(f => ({ ...f, wake_time: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
            </div>
          </div>
          {autoDuration !== null && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ background: 'var(--s3)' }}>
              <Clock size={13} style={{ color: 'var(--t-dim)' }} />
              <span className="text-xs" style={{ color: '#a5a293' }}>Duration: <strong style={{ color: '#f4f4f5' }}>{fmtDuration(autoDuration)}</strong></span>
            </div>
          )}
          <div>
            <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>QUALITY</label>
            <div className="flex gap-1.5 mt-1">
              {[1, 2, 3, 4, 5].map(q => (
                <button key={q} type="button"
                  onClick={() => setForm(f => ({ ...f, quality: q }))}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold tap"
                  style={{
                    background: form.quality === q ? QUALITY_COLOR[q] + '22' : 'var(--s3)',
                    color: form.quality === q ? QUALITY_COLOR[q] : '#757163',
                    border: `1px solid ${form.quality === q ? QUALITY_COLOR[q] + '44' : 'transparent'}`,
                  }}>
                  <Star size={11} className="inline mb-0.5 mr-0.5" />{q}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium" style={{ color: 'var(--t-dim)' }}>NOTES</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Dreamt well, woke up refreshed..."
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none mt-1" />
          </div>
          {formErr && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgb(239 68 68 / 0.1)', color: '#e07b62' }}>
              <AlertCircle size={13} />{formErr}
            </div>
          )}
          <div className="flex gap-2">
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
      {chartData.length > 1 && (
        <div className="card px-4 py-4">
          <p className="text-xs font-semibold mb-3" style={{ color: 'rgb(var(--accent-rgb))', letterSpacing: '0.05em' }}>// SLEEP DURATION (hrs)</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} barSize={20}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#57544a' }} />
              <YAxis domain={[0, 12]} tick={{ fontSize: 10, fill: '#57544a' }} />
              <Tooltip
                contentStyle={{ background: 'var(--s2)', border: '1px solid var(--b)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: any) => [`${v}h`, 'Sleep']}
              />
              <ReferenceLine y={7} stroke="#57544a" strokeDasharray="4 2" />
              <Bar dataKey="hours" radius={[4, 4, 0, 0]} fill="rgb(var(--accent-rgb))" />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] mt-1 text-center" style={{ color: '#57544a' }}>Dashed line = 7h goal</p>
        </div>
      )}

      {/* Log list — grouped by date */}
      {logs.length > 0 ? (
        <div className="card px-4 py-4">
          <p className="text-xs font-semibold mb-3" style={{ color: 'rgb(var(--accent-rgb))', letterSpacing: '0.05em' }}>// HISTORY</p>
          <div className="space-y-0">
            {groupedDates.map(date => {
              const entries = byDate.get(date)!;
              const totalMins = entries.reduce((s, e) => s + (e.duration_minutes || 0), 0);
              return (
                <div key={date} style={{ borderBottom: '1px solid var(--b)' }}>
                  {/* Date header with total */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs font-bold" style={{ color: 'var(--t-body)' }}>
                      {format(new Date(date + 'T12:00:00'), 'EEE, d MMM')}
                    </span>
                    {entries.length > 1 && totalMins > 0 && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: 'rgb(var(--accent-rgb)/0.1)', color: 'rgb(var(--accent-rgb-light))' }}>
                        Total {fmtDuration(totalMins)}
                      </span>
                    )}
                  </div>
                  {/* Each sleep entry for this date */}
                  {entries.map((l, i) => (
                    <div key={l.id} className="flex items-center gap-3 py-2 pl-3"
                      style={{ borderTop: i > 0 ? '1px solid var(--b)' : undefined }}>
                      <Moon size={11} style={{ color: 'var(--t-faint)', flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {entries.length > 1 && (
                            <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--s3)', color: 'var(--t-faint)' }}>
                              {i === 0 ? 'Night' : 'Nap'}
                            </span>
                          )}
                          {l.bedtime && l.wake_time && (
                            <span className="text-[11px]" style={{ color: 'var(--t-dim)' }}>{l.bedtime} → {l.wake_time}</span>
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
                          {l.notes && (
                            <span className="text-[10px] truncate" style={{ color: 'var(--t-faint)', maxWidth: 120 }}>{l.notes}</span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => del(l.id)} className="tap" style={{ color: 'var(--t-faint)' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : !showForm && (
        <div className="card py-12 text-center">
          <Moon size={28} style={{ color: '#57544a', margin: '0 auto 8px' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--t-dim)' }}>No sleep logs yet</p>
          <p className="text-xs mt-1" style={{ color: '#57544a' }}>Tap "Log" to add last night's sleep</p>
        </div>
      )}

      </div>{/* end relative zIndex wrapper */}
    </div>
  );
}
