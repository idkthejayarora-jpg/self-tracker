import { useState, useEffect, useRef, useCallback } from 'react';
import { Brain, Play, Pause, Check, CornerDownRight, X, Plus, Flame, Clock, AlertTriangle } from 'lucide-react';
import PaperBanner from '../components/PaperBanner';
import api from '../lib/api';

const ACCENT = '#d97757';
const DURATIONS = [15, 25, 45];

interface Task {
  id: number; title: string; priority: string; status: string;
  due_date: string | null; due_time: string | null; priority_score?: number;
}
interface NextResp { task: Task | null; remaining: number; pickable: number; overdue: number; dueToday: number; }
interface FocusToday { sessions: number; minutes: number; streak: number; }

type Phase = 'idle' | 'running' | 'paused' | 'done';

// ── Relative due time — fights time-blindness ─────────────────────────────────
function relativeDue(due_date: string | null, due_time: string | null): { text: string; tone: 'over' | 'soon' | 'later' } | null {
  if (!due_date) return null;
  const now = new Date();
  const due = new Date(`${due_date}T${due_time || '23:59'}:00`);
  const diffMs = due.getTime() - now.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 0) {
    const over = Math.abs(mins);
    if (over < 60) return { text: `${over}m overdue`, tone: 'over' };
    if (over < 1440) return { text: `${Math.round(over / 60)}h overdue`, tone: 'over' };
    return { text: `${Math.round(over / 1440)}d overdue`, tone: 'over' };
  }
  if (mins < 60) return { text: `in ${mins}m`, tone: 'soon' };
  if (mins < 240) return { text: `in ${Math.round(mins / 60)}h`, tone: 'soon' };
  if (mins < 1440) return { text: 'today', tone: 'soon' };
  if (mins < 2880) return { text: 'tomorrow', tone: 'later' };
  return { text: `in ${Math.round(mins / 1440)}d`, tone: 'later' };
}

const toneColor = (tone: 'over' | 'soon' | 'later') =>
  tone === 'over' ? '#c2553d' : tone === 'soon' ? '#cf8a3e' : '#a5a293';

function beep() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 660;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    o.start(); o.stop(ctx.currentTime + 0.95);
  } catch { /* no audio, no problem */ }
  try { navigator.vibrate?.([120, 60, 120]); } catch { /* ignore */ }
}

export default function Focus() {
  const [next, setNext] = useState<NextResp | null>(null);
  const [stats, setStats] = useState<FocusToday>({ sessions: 0, minutes: 0, streak: 0 });
  const [skip, setSkip] = useState<number[]>([]);
  const [customLabel, setCustomLabel] = useState('');
  const [pickMin, setPickMin] = useState(25);

  // Timer
  const [phase, setPhase] = useState<Phase>('idle');
  const [label, setLabel] = useState('');
  const [taskId, setTaskId] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const targetRef = useRef(0);     // total target seconds (grows with +5)
  const endAtRef = useRef(0);      // wall-clock ms when it should hit zero
  const [lastResult, setLastResult] = useState<{ minutes: number; points: number; completed: boolean } | null>(null);
  const [, force] = useState(0);   // re-render tick

  const loadNext = useCallback(async (skipIds: number[]) => {
    const r = await api.get<NextResp>(`/focus/next?exclude=${skipIds.join(',')}`);
    setNext(r.data);
  }, []);
  const loadStats = useCallback(async () => {
    const r = await api.get<FocusToday>('/focus/today');
    setStats(r.data);
  }, []);

  useEffect(() => { loadNext(skip); loadStats(); }, [loadNext, loadStats, skip]);

  // ── Timer engine — drift-free via wall clock ───────────────────────────────
  const finish = useCallback(async (completed: boolean) => {
    const actual = completed ? targetRef.current : Math.max(0, targetRef.current - secondsLeft);
    setPhase('done');
    if (completed) beep();
    try {
      const r = await api.post('/focus/complete', {
        label, task_id: taskId,
        planned_minutes: Math.round(targetRef.current / 60),
        actual_seconds: actual, completed,
      });
      setLastResult({ minutes: Math.round(actual / 60), points: r.data.points, completed });
      loadStats();
    } catch {
      setLastResult({ minutes: Math.round(actual / 60), points: 0, completed });
    }
  }, [label, taskId, secondsLeft, loadStats]);

  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
      setSecondsLeft(left);
      force(n => n + 1);
      if (left <= 0) { clearInterval(id); finish(true); }
    }, 250);
    return () => clearInterval(id);
  }, [phase, finish]);

  function start(lbl: string, mins: number, tId: number | null) {
    setLabel(lbl || 'Focus'); setTaskId(tId);
    targetRef.current = mins * 60;
    endAtRef.current = Date.now() + mins * 60 * 1000;
    setSecondsLeft(mins * 60);
    setLastResult(null);
    setPhase('running');
  }
  function pause() { setPhase('paused'); }
  function resume() { endAtRef.current = Date.now() + secondsLeft * 1000; setPhase('running'); }
  function addFive() {
    targetRef.current += 300;
    if (phase === 'running') endAtRef.current += 300000;
    setSecondsLeft(s => s + 300);
  }
  function reset() { setPhase('idle'); setLabel(''); setTaskId(null); setLastResult(null); }

  async function completeTask(id: number) {
    try { await api.patch(`/tasks/${id}`, { status: 'completed' }); } catch { /* ignore */ }
    setSkip([]); loadNext([]);
  }

  // ── Day progress (time-blindness) ──────────────────────────────────────────
  const now = new Date();
  const dayPct = Math.round(((now.getHours() * 60 + now.getMinutes()) / 1440) * 100);
  const minsLeftToday = 1440 - (now.getHours() * 60 + now.getMinutes());
  const hLeft = Math.floor(minsLeftToday / 60), mLeft = minsLeftToday % 60;

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const progress = targetRef.current ? secondsLeft / targetRef.current : 0;
  const R = 130, C = 2 * Math.PI * R;

  // ════════════════ RUNNING / PAUSED — distraction-free ════════════════
  if (phase === 'running' || phase === 'paused') {
    return (
      <div className="max-w-2xl mx-auto anim-page" style={{ '--accent-rgb': '217 119 87' } as React.CSSProperties}>
        <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: '78vh', gap: 24 }}>
          <p className="text-[11px] font-black tracking-[0.28em] uppercase" style={{ color: ACCENT, opacity: 0.7, fontFamily: "'Lora', Georgia, serif" }}>
            {phase === 'paused' ? 'Paused' : 'In focus'}
          </p>
          <h1 className="text-2xl font-bold px-6" style={{ color: 'var(--t-head)', fontFamily: "'Lora', Georgia, serif", lineHeight: 1.2 }}>
            {label}
          </h1>

          {/* Ring */}
          <div className="relative" style={{ width: 280, height: 280 }}>
            <svg viewBox="0 0 280 280" width="280" height="280" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="140" cy="140" r={R} fill="none" stroke="var(--s3)" strokeWidth="14" />
              <circle cx="140" cy="140" r={R} fill="none" stroke={ACCENT} strokeWidth="14" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
                style={{ transition: 'stroke-dashoffset 0.4s linear', filter: phase === 'running' ? `drop-shadow(0 0 8px ${ACCENT}66)` : 'none' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="tabular-nums font-black" style={{ fontSize: 56, color: 'var(--t-head)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                {mm}:{ss}
              </span>
              <span className="text-xs mt-2" style={{ color: 'var(--t-faint)' }}>
                {Math.round(targetRef.current / 60)} min block
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <button onClick={() => finish(false)} title="Give up"
              className="tap w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'var(--s2)', border: '1px solid var(--b)', color: 'var(--t-faint)' }}>
              <X size={18} />
            </button>
            {phase === 'running' ? (
              <button onClick={pause}
                className="tap w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: ACCENT, color: '#fff', boxShadow: `0 8px 24px ${ACCENT}55` }}>
                <Pause size={26} />
              </button>
            ) : (
              <button onClick={resume}
                className="tap w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: ACCENT, color: '#fff', boxShadow: `0 8px 24px ${ACCENT}55` }}>
                <Play size={26} style={{ marginLeft: 3 }} />
              </button>
            )}
            <button onClick={() => finish(true)} title="Done now"
              className="tap w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: '#cf8a3e22', border: '1px solid #cf8a3e55', color: '#cf8a3e' }}>
              <Check size={18} />
            </button>
          </div>
          <button onClick={addFive} className="tap text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--t-faint)' }}>
            <Plus size={12} /> 5 more minutes
          </button>
        </div>
      </div>
    );
  }

  // ════════════════ DONE — celebration ════════════════
  if (phase === 'done' && lastResult) {
    return (
      <div className="max-w-2xl mx-auto anim-page" style={{ '--accent-rgb': '217 119 87' } as React.CSSProperties}>
        <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: '70vh', gap: 16 }}>
          <div className="done-stamp flex items-center gap-2 px-5 py-2 rounded-xl"
            style={{ border: '2px solid #cf8a3e', color: '#cf8a3e' }}>
            <Check size={20} />
            <span className="text-lg font-black tracking-[0.16em] uppercase" style={{ fontFamily: "'Lora', Georgia, serif" }}>
              {lastResult.completed ? 'Block done' : 'Logged'}
            </span>
          </div>
          <p className="text-sm" style={{ color: 'var(--t-body)' }}>
            <span className="font-bold" style={{ color: 'var(--t-head)' }}>{lastResult.minutes} min</span> of focus
            {lastResult.points > 0 && <> · <span style={{ color: ACCENT }}>+{lastResult.points} pts</span></>}
          </p>
          <p className="text-xs italic" style={{ color: 'var(--t-faint)' }}>
            {lastResult.completed ? 'You rode the wave. One more, or rest.' : 'Every minute counts. Pick back up when ready.'}
          </p>
          <div className="flex items-center gap-2 mt-2">
            {taskId && (
              <button onClick={() => { completeTask(taskId); reset(); }}
                className="tap px-4 py-2 rounded-xl text-sm font-bold" style={{ background: '#cf8a3e22', color: '#cf8a3e', border: '1px solid #cf8a3e55' }}>
                Mark task done
              </button>
            )}
            <button onClick={() => start(label, pickMin, taskId)}
              className="tap px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: ACCENT }}>
              Another round
            </button>
            <button onClick={reset} className="tap px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--s2)', color: 'var(--t-faint)', border: '1px solid var(--b)' }}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════ IDLE — what now + start ════════════════
  const task = next?.task || null;
  const due = task ? relativeDue(task.due_date, task.due_time) : null;
  const nudge = (next?.overdue || 0) + (next?.dueToday || 0);

  return (
    <div className="max-w-2xl mx-auto space-y-5 anim-page pb-16" style={{ '--accent-rgb': '217 119 87' } as React.CSSProperties}>
      <PaperBanner title="Focus" label="Deep Work" accent={ACCENT} icon={Brain}
        subtitle="one thing at a time — ride the wave, clear the fog" />

      <div className="space-y-5" style={{ position: 'relative', zIndex: 1 }}>
        {/* Nudge bar — time-blindness */}
        {nudge > 0 && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl scale-in"
            style={{ background: '#c2553d12', border: '1px solid #c2553d33' }}>
            <AlertTriangle size={15} style={{ color: '#c2553d' }} className="shrink-0" />
            <span className="text-xs" style={{ color: 'var(--t-body)' }}>
              {next!.overdue > 0 && <><b style={{ color: '#c2553d' }}>{next!.overdue} overdue</b>{next!.dueToday > 0 ? ' · ' : ''}</>}
              {next!.dueToday > 0 && <><b style={{ color: '#cf8a3e' }}>{next!.dueToday} due today</b></>}
              {' '}— knock one out below.
            </span>
          </div>
        )}

        {/* RIGHT NOW — one next action */}
        <div className="card overflow-hidden" style={{ borderLeft: `3px solid ${ACCENT}` }}>
          <div className="px-4 pt-3.5 pb-2 flex items-center gap-2" style={{ background: `${ACCENT}0c` }}>
            <span className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: ACCENT }}>Right now</span>
            {next && next.remaining > 0 && (
              <span className="text-[10px] ml-auto" style={{ color: 'var(--t-faint)' }}>{next.remaining} on your plate</span>
            )}
          </div>

          {task ? (
            <div className="px-4 py-4">
              <div className="flex items-start gap-2 mb-3">
                <p className="text-base font-bold flex-1" style={{ color: 'var(--t-head)', fontFamily: "'Lora', Georgia, serif", lineHeight: 1.3 }}>
                  {task.title}
                </p>
                {due && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"
                    style={{ background: `${toneColor(due.tone)}1e`, color: toneColor(due.tone) }}>
                    <Clock size={9} /> {due.text}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => start(task.title, pickMin, task.id)}
                  className="tap flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ background: ACCENT }}>
                  <Play size={15} /> Focus {pickMin}m
                </button>
                <button onClick={() => completeTask(task.id)}
                  className="tap px-3.5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5"
                  style={{ background: '#cf8a3e1e', color: '#cf8a3e', border: '1px solid #cf8a3e44' }}>
                  <Check size={15} /> Done
                </button>
                <button onClick={() => setSkip(s => [...s, task.id])} title="Show me something else"
                  className="tap px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-1"
                  style={{ background: 'var(--s2)', color: 'var(--t-faint)', border: '1px solid var(--b)' }}>
                  <CornerDownRight size={14} /> Later
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-7 text-center space-y-1.5">
              <p className="text-sm font-semibold" style={{ color: 'var(--t-head)' }}>
                {skip.length > 0 ? 'That’s everything for now ✦' : 'Nothing urgent on your list'}
              </p>
              <p className="text-xs" style={{ color: 'var(--t-faint)' }}>
                {skip.length > 0
                  ? <button onClick={() => setSkip([])} className="underline tap" style={{ color: ACCENT }}>start over</button>
                  : 'Pick your own focus below and just begin.'}
              </p>
            </div>
          )}
        </div>

        {/* FREE FOCUS — pick duration + start anything */}
        <div className="card px-4 py-4 space-y-3">
          <span className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: 'var(--t-faint)' }}>Start a focus block</span>
          <input
            value={customLabel}
            onChange={e => setCustomLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && customLabel.trim()) start(customLabel.trim(), pickMin, null); }}
            placeholder="What are you focusing on?"
            className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
            style={{ background: 'var(--s2)', border: '1px solid var(--b)', color: 'var(--t-body)' }} />
          <div className="flex items-center gap-2">
            {DURATIONS.map(d => (
              <button key={d} onClick={() => setPickMin(d)}
                className="tap flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                style={pickMin === d
                  ? { background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}55` }
                  : { background: 'var(--s2)', color: 'var(--t-faint)', border: '1px solid var(--b)' }}>
                {d}m
              </button>
            ))}
          </div>
          <button onClick={() => start(customLabel.trim() || 'Focus', pickMin, null)}
            className="tap w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ background: ACCENT }}>
            <Play size={15} /> Start {pickMin}-minute focus
          </button>
        </div>

        {/* TODAY — dopamine stats + day progress */}
        <div className="card px-4 py-4 space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { v: stats.sessions, l: 'blocks today', c: ACCENT },
              { v: stats.minutes, l: 'minutes', c: '#cf8a3e' },
              { v: stats.streak, l: 'day streak', c: '#c2553d', flame: true },
            ].map(s => (
              <div key={s.l}>
                <div className="flex items-center justify-center gap-1">
                  {s.flame && stats.streak > 0 && <Flame size={15} style={{ color: s.c }} />}
                  <span className="text-2xl font-black" style={{ color: s.c }}>{s.v}</span>
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--t-faint)' }}>{s.l}</p>
              </div>
            ))}
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>
              <span>Day progress</span>
              <span>{hLeft}h {mLeft}m left</span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'var(--s3)' }}>
              <div className="h-1.5 rounded-full" style={{ width: `${dayPct}%`, background: `linear-gradient(90deg, ${ACCENT}, #cf8a3e)` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
