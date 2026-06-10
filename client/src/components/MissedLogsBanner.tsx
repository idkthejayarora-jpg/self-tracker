import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, AlertTriangle, Salad, Moon, BookOpen, Dumbbell, Video } from 'lucide-react';
import api from '../lib/api';

// Map server icon tokens → Lucide components (no emoji rendering)
const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  diet:    Salad,
  sleep:   Moon,
  journal: BookOpen,
  workout: Dumbbell,
  content: Video,
};

interface MissedLog {
  type: string;
  label: string;
  icon: string;
  route: string;
  daysSince: number;
}

const DISMISS_KEY = 'missedLogsDismissedAt';
const DISMISS_TTL_MS = 6 * 60 * 60 * 1000; // re-show after 6 hours

export default function MissedLogsBanner() {
  const [missed, setMissed]       = useState<MissedLog[]>([]);
  const [visible, setVisible]     = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const navigate = useNavigate();

  const check = useCallback(async () => {
    // Don't nag if dismissed recently
    const ts = localStorage.getItem(DISMISS_KEY);
    if (ts && Date.now() - Number(ts) < DISMISS_TTL_MS) return;

    try {
      const r = await api.get<{ missed: MissedLog[] }>('/life/missed-logs');
      if (r.data.missed.length > 0) {
        setMissed(r.data.missed);
        setVisible(true);
        setExpanded(true);

        // Native push notification for the worst offender
        const worst = r.data.missed.reduce((a, b) => a.daysSince > b.daysSince ? a : b);
        if (Notification.permission === 'granted') {
          new Notification(`${worst.label} not logged in ${worst.daysSince} days`, {
            body: r.data.missed.map(m => `${m.label}: ${m.daysSince}d ago`).join('\n'),
            icon: '/favicon.ico',
          });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission();
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, 30 * 60 * 1000); // re-check every 30 min
    return () => clearInterval(id);
  }, [check]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
    setExpanded(false);
  }

  function goLog(route: string) {
    navigate(route);
    dismiss();
  }

  if (!visible || missed.length === 0) return null;

  const maxDays = Math.max(...missed.map(m => m.daysSince));

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: maxDays >= 7
          ? 'linear-gradient(90deg, #7f1d1d, #991b1b)'
          : maxDays >= 4
          ? 'linear-gradient(90deg, #78350f, #92400e)'
          : 'linear-gradient(90deg, #1e1b4b, #3a2a22)',
        borderBottom: `2px solid ${maxDays >= 7 ? '#cd5240' : maxDays >= 4 ? '#d9a066' : '#d97757'}`,
        boxShadow: `0 4px 24px ${maxDays >= 7 ? '#cd524040' : maxDays >= 4 ? '#d9a06640' : '#d9775740'}`,
      }}>

      {/* Collapsed strip */}
      {!expanded ? (
        <div
          className="flex items-center gap-3 px-4 py-2 cursor-pointer"
          onClick={() => setExpanded(true)}>
          <AlertTriangle size={14} className="shrink-0 animate-pulse" style={{ color: maxDays >= 7 ? '#e8a18f' : '#d9a066' }} />
          <span className="text-xs font-bold text-white">
            {missed.length} log{missed.length > 1 ? 's' : ''} overdue — tap to see
          </span>
          <button onClick={e => { e.stopPropagation(); dismiss(); }}
            className="ml-auto tap" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <X size={14} />
          </button>
        </div>
      ) : (
        /* Expanded banner */
        <div className="px-4 py-3">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 animate-pulse"
                style={{ color: maxDays >= 7 ? '#e8a18f' : '#d9a066' }} />
              <span className="text-sm font-black text-white tracking-wide">
                {maxDays >= 7 ? 'SERIOUSLY OVERDUE' : maxDays >= 4 ? 'FALLING BEHIND' : 'LOGS MISSED'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setExpanded(false)}
                className="text-[10px] tap px-2 py-1 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                collapse
              </button>
              <button onClick={dismiss}
                className="tap" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {missed.map(m => {
              const Icon = ICON_MAP[m.icon] || ICON_MAP[m.type] || AlertTriangle;
              return (
                <button key={m.type}
                  onClick={() => goLog(m.route)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl tap text-white"
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}>
                  <Icon size={16} color="rgba(255,255,255,0.95)" />
                  <div className="text-left">
                    <p className="text-xs font-bold leading-none">{m.label}</p>
                    <p className="text-[10px] opacity-70 mt-0.5">
                      {m.daysSince === 999 ? 'never logged' : `${m.daysSince}d ago`}
                    </p>
                  </div>
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full ml-1"
                    style={{
                      background: m.daysSince >= 7 ? '#cd524040' : m.daysSince >= 4 ? '#d9a06640' : '#d9775740',
                      color: m.daysSince >= 7 ? '#e8a18f' : m.daysSince >= 4 ? '#d9a066' : '#d4a27f',
                    }}>
                    LOG NOW →
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-[10px] mt-2.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Dismissed for 6 hours · tap any card to log now
          </p>
        </div>
      )}
    </div>
  );
}
