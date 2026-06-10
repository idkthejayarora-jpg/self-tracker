import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Flame, Check, Zap } from 'lucide-react';
import api from '../lib/api';

const SESSION_KEY = 'habitBreachDismissed';
const ACCENT = '#cd5240';

interface Violation {
  habit_id: number;
  name: string;
  icon: string;
  color: string;
  missStreak: number;
  penaltyToday: number;
}
interface Enforcement {
  violations: Violation[];
  momentum: { multiplier: number; expiresAt: string } | null;
}
interface RedemptionResult {
  points: number;
  missStreak: number;
  momentumUntil: string | null;
}

function playAlertBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.setValueAtTime(160, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.02);
    gain.gain.setValueAtTime(0.22, ctx.currentTime + 0.18);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.45);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.46);
    osc.onended = () => ctx.close();
  } catch (_) { /* no audio context */ }
}

export default function HabitLockdownModal() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [visible, setVisible]       = useState(false);
  const [busyId, setBusyId]         = useState<number | null>(null);
  const [reward, setReward]         = useState<RedemptionResult | null>(null);

  const fetchEnforcement = useCallback(async () => {
    try {
      const { data } = await api.get<Enforcement>('/habits/enforcement');
      return data.violations || [];
    } catch { return []; }
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    fetchEnforcement().then(v => {
      if (v.length) {
        setViolations(v);
        setVisible(true);
        playAlertBeep();
      }
    });
  }, [fetchEnforcement]);

  const totalPenalty = violations.reduce((s, v) => s + v.penaltyToday, 0);

  async function doItNow(v: Violation) {
    setBusyId(v.habit_id);
    try {
      const { data } = await api.put(`/habits/log/${v.habit_id}`, { done: true });
      if (data?.redemption) setReward(data.redemption);
      // Re-scan; close when nothing left in violation
      const fresh = await fetchEnforcement();
      setViolations(fresh);
      if (!fresh.length) {
        // brief reward flash before close
        setTimeout(() => setVisible(false), data?.redemption ? 2200 : 600);
      }
    } finally { setBusyId(null); }
  }

  function takeTheHit() {
    sessionStorage.setItem(SESSION_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.86)', backdropFilter: 'blur(8px)' }}>
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden scale-in"
        style={{
          background: 'rgba(26,20,18,0.96)',
          border: `1px solid ${ACCENT}55`,
          boxShadow: `0 0 60px ${ACCENT}40, 0 24px 64px rgba(0,0,0,0.7)`,
        }}>
        {/* Scanlines */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, ${ACCENT}08 3px, ${ACCENT}08 4px)` }} />
        {/* Top neon bar */}
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, boxShadow: `0 0 10px ${ACCENT}` }} />

        <div className="relative z-10 px-5 py-5 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}40` }}>
              <AlertTriangle size={20} color={ACCENT} className="glow-pulse" />
            </div>
            <div>
              <p className="text-[10px] font-black tracking-[0.28em]" style={{ color: ACCENT }}>HABIT BREACH DETECTED</p>
              <p className="text-[11px] font-mono" style={{ color: 'var(--t-muted)' }}>
                {violations.length} habit{violations.length !== 1 ? 's' : ''} missed 3+ days · −{totalPenalty} pts today
              </p>
            </div>
          </div>

          {/* Reward burst */}
          {reward && (
            <div className="rounded-xl px-4 py-3 scale-in text-center"
              style={{ background: 'rgba(111,157,92,0.12)', border: '1px solid rgba(111,157,92,0.4)' }}>
              <p className="text-sm font-black tracking-wide flex items-center justify-center gap-1.5" style={{ color: '#6f9d5c' }}>
                <Zap size={14} /> COMEBACK · +{reward.points} PTS
              </p>
              <p className="text-[11px] font-mono mt-0.5" style={{ color: '#6f9d5c', opacity: 0.8 }}>
                MOMENTUM ×2 active for 24h — habit points doubled
              </p>
            </div>
          )}

          {/* Violation rows */}
          <div className="space-y-2">
            {violations.map(v => (
              <div key={v.habit_id} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${ACCENT}25` }}>
                <span className="text-lg shrink-0">{v.icon || '🎯'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--t-head)' }}>{v.name}</p>
                  <p className="text-[10px] font-mono flex items-center gap-1" style={{ color: ACCENT }}>
                    <Flame size={10} /> {v.missStreak} DAYS MISSED · −{v.penaltyToday} PTS
                  </p>
                </div>
                <button
                  onClick={() => doItNow(v)}
                  disabled={busyId === v.habit_id}
                  className="tap shrink-0 flex items-center gap-1.5 text-[11px] font-black px-3 py-2 rounded-lg"
                  style={{ background: '#6f9d5c', color: '#04140a', opacity: busyId === v.habit_id ? 0.5 : 1 }}>
                  <Check size={13} /> {busyId === v.habit_id ? '...' : 'DO IT NOW'}
                </button>
              </div>
            ))}
          </div>

          {/* Take the hit */}
          <button onClick={takeTheHit}
            className="w-full py-2.5 rounded-xl text-xs font-bold tap"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--t-faint)', border: '1px solid var(--b)' }}>
            Take the hit — penalty stands, bigger tomorrow
          </button>
        </div>
      </div>
    </div>
  );
}
