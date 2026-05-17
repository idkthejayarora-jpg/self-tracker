import { useEffect, useState, useCallback } from 'react';
import { Plus, Bell, Trash2, AlarmClock, Check, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';
import type { Reminder } from '../types';

const SNOOZE_OPTIONS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
];

interface FormData {
  title: string;
  description: string;
  remind_at: string;
  repeat: 'none' | 'daily' | 'weekly';
}

const emptyForm = (): FormData => ({ title: '', description: '', remind_at: '', repeat: 'none' });

function toUTCIso(localDt: string) {
  return new Date(localDt).toISOString();
}

export default function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [loadErr, setLoadErr] = useState('');

  const fetchReminders = useCallback(async () => {
    try {
      setLoadErr('');
      const res = await api.get<Reminder[]>('/reminders');
      setReminders(res.data);
    } catch (e: any) {
      setLoadErr(e?.response?.data?.error || e?.message || 'Failed to load reminders');
    }
  }, []);

  useEffect(() => { fetchReminders(); }, [fetchReminders]);
  useSync(fetchReminders, 30000);

  async function createReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.remind_at) return;
    setSubmitting(true);
    setFormErr('');
    try {
      await api.post('/reminders', { ...form, remind_at: toUTCIso(form.remind_at) });
      setForm(emptyForm());
      setShowForm(false);
      await fetchReminders();
    } catch (err: any) {
      setFormErr(err?.response?.data?.error || err?.message || 'Failed to create reminder');
    } finally {
      setSubmitting(false);
    }
  }

  async function dismiss(id: number) {
    try {
      await api.patch(`/reminders/${id}`, { status: 'dismissed' });
      await fetchReminders();
    } catch {
      // silently retry on next sync
    }
  }

  async function snooze(id: number, minutes: number) {
    try {
      const until = new Date(Date.now() + minutes * 60000).toISOString();
      await api.patch(`/reminders/${id}`, { status: 'snoozed', snoozed_until: until });
      await fetchReminders();
    } catch {
      // silently retry on next sync
    }
  }

  async function deleteReminder(id: number) {
    try {
      await api.delete(`/reminders/${id}`);
      setReminders(prev => prev.filter(r => r.id !== id));
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to delete reminder');
    }
  }

  const now = new Date();
  const overdue = reminders.filter(r => new Date(r.remind_at) <= now || (r.snoozed_until && new Date(r.snoozed_until) <= now));
  const upcoming = reminders.filter(r => new Date(r.remind_at) > now && (!r.snoozed_until || new Date(r.snoozed_until) > now));

  return (
    <div className="space-y-4"
      style={{ '--accent-rgb': '251 191 36' } as React.CSSProperties}>

      {/* Cyberpunk body overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(251,191,36,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* ── INCOMING SIGNAL HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl mb-4"
        style={{ background: 'var(--hero-bg)', border: '1px solid #fbbf2425', minHeight: 110 }}>
        {/* Signal rings on right */}
        <div className="absolute pointer-events-none" style={{ top: '50%', right: 40, transform: 'translateY(-50%)' }}>
          {[0, 700, 1400].map(d => (
            <div key={d} className="absolute rounded-full" style={{
              width: 50, height: 50, top: -25, left: -25,
              border: '1px solid #fbbf24',
              animation: `signal-ring 2.1s ease-out ${d}ms infinite`,
            }} />
          ))}
          <div className="w-3 h-3 rounded-full absolute" style={{
            top: -6, left: -6, background: '#fbbf24',
            boxShadow: '0 0 10px #fbbf24, 0 0 20px #f59e0b',
          }} />
        </div>
        <div className="absolute top-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #fbbf24', borderLeft: '1.5px solid #fbbf24', opacity: 0.7 }} />
        <div className="absolute top-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #fbbf24', borderRight: '1.5px solid #fbbf24', opacity: 0.7 }} />
        <div className="absolute bottom-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #fbbf24', borderLeft: '1.5px solid #fbbf24', opacity: 0.7 }} />
        <div className="absolute bottom-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #fbbf24', borderRight: '1.5px solid #fbbf24', opacity: 0.7 }} />
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #fbbf2470, transparent)', boxShadow: '0 0 8px #fbbf24' }} />
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: '#fbbf24', opacity: 0.6 }}>SIG://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">BROADCAST_INCOMING</span>
            <span className="cursor-blink font-mono" style={{ color: '#fbbf24', fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight leading-none text-white" style={{ textShadow: '0 0 30px #fbbf2440' }}>
            INCOMING SIGNALS
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: '#fbbf24', opacity: 0.5 }}>
            // priority transmissions queued — awaiting acknowledgment
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #fbbf2430, transparent)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'rgb(var(--accent-rgb))' }}>// Reminders</h1>
        <button type="button" onClick={() => { setShowForm(s => !s); setFormErr(''); }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium tap"
          style={{ background: 'rgb(var(--accent-rgb) / 0.12)', color: 'rgb(var(--accent-rgb))', border: '1px solid rgb(var(--accent-rgb) / 0.25)' }}>
          <Plus size={16} /> New reminder
        </button>
      </div>

      {loadErr && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: 'rgb(239 68 68 / 0.08)', color: '#f87171', border: '1px solid rgb(239 68 68 / 0.2)' }}>
          <AlertCircle size={13} />
          {loadErr} — <button type="button" onClick={fetchReminders} className="underline">retry</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={createReminder} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <input placeholder="Reminder title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            autoFocus required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <input placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Remind at</label>
              <input type="datetime-local" value={form.remind_at} onChange={e => setForm(f => ({ ...f, remind_at: e.target.value }))}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Repeat</label>
              <select value={form.repeat} onChange={e => setForm(f => ({ ...f, repeat: e.target.value as FormData['repeat'] }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="none">No repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>
          {formErr && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgb(239 68 68 / 0.1)', color: '#f87171' }}>
              <AlertCircle size={13} />{formErr}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setShowForm(false); setFormErr(''); }} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button type="submit" disabled={submitting || !form.title.trim() || !form.remind_at}
              className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors">
              {submitting ? 'Adding...' : 'Add reminder'}
            </button>
          </div>
        </form>
      )}

      {/* Due / overdue */}
      {overdue.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: '#f87171' }}><AlarmClock size={14} /> // Due now ({overdue.length})</h2>
          <div className="space-y-2">
            {overdue.map(r => (
              <div key={r.id} className="bg-red-950/40 border border-red-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white text-sm">{r.title}</p>
                    {r.description && <p className="text-xs text-gray-400 mt-0.5">{r.description}</p>}
                    <p className="text-xs text-red-400 mt-1">{format(parseISO(r.remind_at), 'PPpp')}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {SNOOZE_OPTIONS.map(s => (
                      <button key={s.minutes} type="button" onClick={() => snooze(r.id, s.minutes)}
                        className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors">
                        {s.label}
                      </button>
                    ))}
                    <button type="button" onClick={() => dismiss(r.id)} className="p-1.5 bg-green-800 hover:bg-green-700 text-white rounded-lg transition-colors">
                      <Check size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming */}
      <div>
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'rgb(var(--accent-rgb))' }}>
          <Bell size={14} /> // Upcoming ({upcoming.length})
        </h2>
        {upcoming.length === 0 && <p className="text-gray-500 text-sm py-4 text-center">No upcoming reminders.</p>}
        <div className="space-y-2">
          {upcoming.map(r => (
            <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-white text-sm">{r.title}</p>
                {r.description && <p className="text-xs text-gray-400 mt-0.5">{r.description}</p>}
                <p className="text-xs text-gray-500 mt-1">{format(parseISO(r.remind_at), 'PPpp')}
                  {r.repeat !== 'none' && <span className="ml-2 text-brand-400">↻ {r.repeat}</span>}
                </p>
              </div>
              <button type="button" onClick={() => deleteReminder(r.id)} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      </div>{/* end relative zIndex wrapper */}
    </div>
  );
}
