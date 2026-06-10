import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, X, ArrowRight } from 'lucide-react';
import api from '../lib/api';
import type { Task } from '../types';

const SESSION_KEY = 'urgentShown';

function playAlertBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';

    // Two-tone alert: high then mid
    osc.frequency.setValueAtTime(1040, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.02);
    gain.gain.setValueAtTime(0.28, ctx.currentTime + 0.16);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.38);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
  } catch (_) {
    // AudioContext unavailable (e.g. server-side) — silently skip
  }
}

export default function UrgentTasksModal() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');

    api.get<Task[]>('/tasks', { params: { status: 'pending', priority: 'urgent' } })
      .then(res => {
        if (res.data.length > 0) {
          setTasks(res.data);
          setVisible(true);
          playAlertBeep();
        }
      })
      .catch(() => {});
  }, []);

  if (!visible) return null;

  const dismiss = () => setVisible(false);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      onClick={dismiss}
    >
      <div
        className="card max-w-sm w-full mx-4 px-5 py-5 space-y-4"
        onClick={e => e.stopPropagation()}
        style={{ borderColor: 'rgba(205,82,64,0.3)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgb(239 68 68 / 0.12)' }}>
              <AlertTriangle size={16} color="#cd5240" />
            </div>
            <div>
              <p className="text-sm font-bold text-head">Urgent Tasks</p>
              <p className="text-[11px]" style={{ color: '#757163' }}>
                {tasks.length} task{tasks.length !== 1 ? 's' : ''} need{tasks.length === 1 ? 's' : ''} immediate attention
              </p>
            </div>
          </div>
          <button onClick={dismiss} className="tap shrink-0 mt-0.5" style={{ color: '#57544a' }}>
            <X size={16} />
          </button>
        </div>

        {/* Task list */}
        <div className="space-y-0 rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
          {tasks.slice(0, 6).map((t, i) => (
            <div
              key={t.id}
              className="flex items-center gap-2.5 px-3 py-2.5"
              style={{
                background: 'var(--s2)',
                borderBottom: i < Math.min(tasks.length, 6) - 1 ? '1px solid var(--b)' : 'none',
              }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#cd5240' }} />
              <p className="text-sm text-body flex-1 truncate">{t.title}</p>
              {t.due_date && (
                <span className="text-[10px] shrink-0" style={{ color: '#cd5240' }}>
                  {t.due_date < new Date().toISOString().slice(0, 10) ? '⚠ overdue' : t.due_date}
                </span>
              )}
            </div>
          ))}
          {tasks.length > 6 && (
            <div className="px-3 py-2 text-center text-xs" style={{ color: '#57544a', background: 'var(--s2)' }}>
              +{tasks.length - 6} more
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={dismiss}
            className="flex-1 py-2 rounded-xl text-sm font-medium tap"
            style={{ background: 'var(--s3)', color: '#757163' }}
          >
            Dismiss
          </button>
          <Link
            to="/tasks"
            onClick={dismiss}
            className="flex-1 py-2 rounded-xl text-sm font-semibold tap flex items-center justify-center gap-1.5 no-underline"
            style={{ background: 'rgb(239 68 68 / 0.15)', color: '#cd5240' }}
          >
            View Tasks <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
