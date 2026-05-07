import { useEffect, useState, useCallback } from 'react';
import { Plus, Bell, Trash2, AlarmClock, Check } from 'lucide-react';
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

const EMPTY: FormData = { title: '', description: '', remind_at: '', repeat: 'none' };

function toUTCIso(localDt: string) {
  return new Date(localDt).toISOString();
}

export default function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  const fetchReminders = useCallback(async () => {
    const res = await api.get<Reminder[]>('/reminders');
    setReminders(res.data);
  }, []);

  useEffect(() => { fetchReminders(); }, [fetchReminders]);
  useSync(fetchReminders, 30000);

  async function createReminder() {
    if (!form.title.trim() || !form.remind_at) return;
    setSubmitting(true);
    try {
      await api.post('/reminders', { ...form, remind_at: toUTCIso(form.remind_at) });
      setForm(EMPTY);
      setShowForm(false);
      fetchReminders();
    } finally {
      setSubmitting(false);
    }
  }

  async function dismiss(id: number) {
    await api.patch(`/reminders/${id}`, { status: 'dismissed' });
    fetchReminders();
  }

  async function snooze(id: number, minutes: number) {
    const until = new Date(Date.now() + minutes * 60000).toISOString();
    await api.patch(`/reminders/${id}`, { status: 'snoozed', snoozed_until: until });
    fetchReminders();
  }

  async function deleteReminder(id: number) {
    await api.delete(`/reminders/${id}`);
    setReminders(prev => prev.filter(r => r.id !== id));
  }

  const now = new Date();
  const overdue = reminders.filter(r => new Date(r.remind_at) <= now || (r.snoozed_until && new Date(r.snoozed_until) <= now));
  const upcoming = reminders.filter(r => new Date(r.remind_at) > now && (!r.snoozed_until || new Date(r.snoozed_until) > now));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Reminders</h1>
        <button onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> New reminder
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <input placeholder="Reminder title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <input placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Remind at</label>
              <input type="datetime-local" value={form.remind_at} onChange={e => setForm(f => ({ ...f, remind_at: e.target.value }))}
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
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button onClick={createReminder} disabled={submitting || !form.title.trim() || !form.remind_at}
              className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors">
              {submitting ? 'Adding...' : 'Add reminder'}
            </button>
          </div>
        </div>
      )}

      {/* Due / overdue */}
      {overdue.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2"><AlarmClock size={14} /> Due now ({overdue.length})</h2>
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
                      <button key={s.minutes} onClick={() => snooze(r.id, s.minutes)}
                        className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors">
                        {s.label}
                      </button>
                    ))}
                    <button onClick={() => dismiss(r.id)} className="p-1.5 bg-green-800 hover:bg-green-700 text-white rounded-lg transition-colors">
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
        <h2 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
          <Bell size={14} /> Upcoming ({upcoming.length})
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
              <button onClick={() => deleteReminder(r.id)} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
