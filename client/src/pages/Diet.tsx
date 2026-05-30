import { useState, useEffect, useCallback, useRef } from 'react';
import { Trash2, ChevronLeft, ChevronRight, Salad, Check, Undo2 } from 'lucide-react';
import { format, parseISO, addDays, subDays } from 'date-fns';
import api from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FoodLog {
  id: number; date: string; meal_type: string; name: string;
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
  saved_meal_id: number | null;
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];

const ACCENT = '#34d399';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStoredGoal() {
  const v = localStorage.getItem('calorie_goal');
  return v ? parseInt(v, 10) : 2000;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Diet() {
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [log, setLog]       = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(false);

  // calorie goal
  const [calorieGoal] = useState<number>(getStoredGoal);

  // text input
  const [text, setText]       = useState('');
  const [logging, setLogging] = useState(false);
  const [result, setResult]   = useState<{
    logged: { name: string; meal_type: string; calories: number; protein_g: number; source?: string }[];
    unmatched: string[];
    insertedIds: number[];
  } | null>(null);
  const [undoIds, setUndoIds] = useState<number[]>([]);
  const [err, setErr]         = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);

  const isToday = date === new Date().toISOString().slice(0, 10);

  const loadLog = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await api.get<FoodLog[]>(`/diet/log?date=${d}`);
      setLog(res.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadLog(date); }, [date, loadLog]);

  const goDay = (delta: number) => {
    const d = new Date(date + 'T00:00:00');
    setDate((delta > 0 ? addDays : subDays)(d, Math.abs(delta)).toISOString().slice(0, 10));
    setResult(null);
    setUndoIds([]);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function submitLog() {
    if (!text.trim() || logging) return;
    setLogging(true); setErr(''); setResult(null);
    try {
      const r = await api.post('/diet/quick-log', { text: text.trim(), date });
      setResult(r.data);
      setUndoIds(r.data.insertedIds || []);
      setText('');
      await loadLog(date);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'Failed to log');
    } finally { setLogging(false); }
  }

  async function undoLog() {
    if (!undoIds.length) return;
    await api.post('/diet/quick-log/undo', { ids: undoIds });
    setResult(null); setUndoIds([]);
    await loadLog(date);
  }

  async function deleteEntry(id: number) {
    await api.delete(`/diet/log/${id}`);
    setLog(prev => prev.filter(e => e.id !== id));
  }

  // ── Totals ─────────────────────────────────────────────────────────────────

  const totals = log.reduce(
    (acc, e) => ({ cal: acc.cal + e.calories, p: acc.p + e.protein_g, c: acc.c + e.carbs_g, f: acc.f + e.fat_g }),
    { cal: 0, p: 0, c: 0, f: 0 }
  );
  const calPct   = Math.min(100, Math.round((totals.cal / calorieGoal) * 100));
  const calColor = calPct > 110 ? '#f43f5e' : calPct > 85 ? '#22c55e' : '#f59e0b';

  const byMeal = MEAL_TYPES.reduce<Record<MealType, FoodLog[]>>((acc, t) => {
    acc[t] = log.filter(e => e.meal_type === t);
    return acc;
  }, {} as Record<MealType, FoodLog[]>);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-5 anim-page pb-16"
      style={{ '--accent-rgb': '52 211 153', '--accent-rgb-light': ACCENT } as React.CSSProperties}>

      {/* Dot grid */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `radial-gradient(circle, rgba(52,211,153,0.05) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* ── HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{ background: 'var(--hero-bg)', border: `1px solid ${ACCENT}25`, minHeight: 96, zIndex: 1 }}>
        {/* Scanlines */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, ${ACCENT}02 3px, ${ACCENT}02 4px)` }} />
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${ACCENT}80, transparent)` }} />
        {/* HUD corners */}
        {([['top-0 left-0', { borderTop: `1.5px solid ${ACCENT}`, borderLeft: `1.5px solid ${ACCENT}` }],
           ['top-0 right-0', { borderTop: `1.5px solid ${ACCENT}`, borderRight: `1.5px solid ${ACCENT}` }],
           ['bottom-0 left-0', { borderBottom: `1.5px solid ${ACCENT}`, borderLeft: `1.5px solid ${ACCENT}` }],
           ['bottom-0 right-0', { borderBottom: `1.5px solid ${ACCENT}`, borderRight: `1.5px solid ${ACCENT}` }],
        ] as [string, React.CSSProperties][]).map(([pos, s], i) => (
          <div key={i} className={`absolute ${pos} pointer-events-none`}
            style={{ width: 10, height: 10, opacity: 0.45, ...s }} />
        ))}
        <div className="relative z-10 px-5 py-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: ACCENT, opacity: 0.6 }}>LAB://</span>
              <span className="cursor-blink font-mono" style={{ color: ACCENT, fontSize: 11 }}>▌</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white" style={{ textShadow: `0 0 30px ${ACCENT}40` }}>
              BIOLAB
            </h1>
            <p className="font-mono text-[10px] mt-0.5" style={{ color: ACCENT, opacity: 0.45 }}>
              {'// fuel optimization — 430+ foods auto-matched'}
            </p>
          </div>
          <Salad size={30} style={{ color: ACCENT, opacity: 0.2 }} />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${ACCENT}30, transparent)` }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }} className="space-y-5">

        {/* ── Date nav ── */}
        <div className="flex items-center justify-between">
          <button onClick={() => goDay(-1)}
            className="p-2 rounded-lg tap" style={{ background: 'var(--s2)', color: 'var(--t-dim)' }}>
            <ChevronLeft size={16} />
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold" style={{ color: 'var(--t-head)' }}>
              {format(parseISO(date), 'EEE, d MMM yyyy')}
            </p>
            {isToday && (
              <span className="text-[10px] font-mono" style={{ color: ACCENT }}>today</span>
            )}
          </div>
          <button onClick={() => goDay(1)} disabled={isToday}
            className="p-2 rounded-lg tap disabled:opacity-30" style={{ background: 'var(--s2)', color: 'var(--t-dim)' }}>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* ── Macro summary ── */}
        <div className="card px-4 py-4 space-y-3">
          <div className="flex items-end justify-between">
            {/* Calories */}
            <div>
              <span className="text-3xl font-black" style={{ color: calColor }}>
                {Math.round(totals.cal)}
              </span>
              <span className="text-xs ml-1.5 font-mono" style={{ color: 'var(--t-faint)' }}>
                / {calorieGoal} kcal
              </span>
            </div>
            {/* P / C / F */}
            <div className="flex gap-5 text-right">
              {[
                { label: 'P', val: totals.p, color: '#60a5fa' },
                { label: 'C', val: totals.c, color: ACCENT },
                { label: 'F', val: totals.f, color: '#fbbf24' },
              ].map(({ label, val, color }) => (
                <div key={label} className="flex flex-col items-center">
                  <span className="text-lg font-bold leading-none" style={{ color }}>{Math.round(val)}</span>
                  <span className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--t-faint)' }}>g {label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full h-1 rounded-full" style={{ background: 'var(--s3)' }}>
            <div className="h-1 rounded-full transition-all duration-500"
              style={{ width: `${calPct}%`, background: calColor }} />
          </div>
          <p className="text-[10px] font-mono" style={{ color: 'var(--t-faint)' }}>
            {calPct}% of daily goal
          </p>
        </div>

        {/* ── Input ── */}
        <div className="relative overflow-hidden rounded-2xl"
          style={{ background: 'var(--hero-bg)', border: `1px solid ${ACCENT}20` }}>
          <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
            style={{ background: `linear-gradient(90deg, transparent, ${ACCENT}50, transparent)` }} />
          <div className="relative z-10 px-4 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-0.5 h-4 rounded-full" style={{ background: ACCENT }} />
              <span className="text-[10px] font-black tracking-[0.22em] font-mono" style={{ color: ACCENT, opacity: 0.7 }}>
                LOG_FOOD://
              </span>
            </div>

            <textarea
              ref={textRef}
              rows={3}
              value={text}
              onChange={e => { setText(e.target.value); setResult(null); setErr(''); }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitLog(); }}
              placeholder={'2 rotis and dahi for lunch\nprotein shake for breakfast\nchicken rice 200g dinner'}
              className="w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none resize-none font-mono leading-relaxed"
              style={{
                background: 'var(--s3)',
                color: 'var(--t-body)',
                border: `1px solid ${ACCENT}20`,
                lineHeight: 1.7,
              }}
            />

            {err && (
              <p className="text-xs font-mono" style={{ color: '#f87171' }}>{err}</p>
            )}

            {/* Result feedback */}
            {result && (
              <div className="rounded-xl px-3 py-3 space-y-2"
                style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}20` }}>
                <div className="flex flex-wrap gap-2">
                  {result.logged.map((e, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-lg"
                      style={{ background: `${ACCENT}12`, color: ACCENT }}>
                      <Check size={10} />
                      <span>{e.name}</span>
                      {e.calories > 0 && (
                        <span style={{ color: 'var(--t-faint)' }}>{e.calories}kcal</span>
                      )}
                      {e.source === 'db' && (
                        <span className="text-[9px] font-black px-1 py-0.5 rounded"
                          style={{ background: '#f59e0b20', color: '#f59e0b' }}>~avg</span>
                      )}
                    </div>
                  ))}
                </div>
                {result.unmatched.length > 0 && (
                  <p className="text-[11px] font-mono" style={{ color: '#f59e0b' }}>
                    Unknown: {result.unmatched.join(', ')}
                    <span style={{ color: 'var(--t-faint)' }}> — logged with 0 macros</span>
                  </p>
                )}
                <button onClick={undoLog}
                  className="flex items-center gap-1 text-[11px] font-mono tap"
                  style={{ color: 'var(--t-faint)' }}>
                  <Undo2 size={11} /> undo
                </button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono" style={{ color: 'var(--t-faint)', opacity: 0.5 }}>
                ⌘↵ to submit
              </p>
              <button
                onClick={submitLog}
                disabled={!text.trim() || logging}
                className="tap px-5 py-2 rounded-xl text-sm font-black disabled:opacity-40"
                style={{ background: logging ? `${ACCENT}60` : ACCENT, color: '#000' }}>
                {logging ? 'Logging...' : 'Log it'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Today's log ── */}
        {loading && (
          <p className="text-center text-xs font-mono py-4" style={{ color: 'var(--t-faint)' }}>
            loading...
          </p>
        )}

        {!loading && log.length === 0 && (
          <div className="card py-12 text-center">
            <Salad size={28} className="mx-auto mb-3" style={{ color: 'var(--t-faint)', opacity: 0.3 }} />
            <p className="text-sm font-mono" style={{ color: 'var(--t-faint)' }}>// nothing logged yet</p>
          </div>
        )}

        {!loading && MEAL_TYPES.map(mt => {
          const entries = byMeal[mt];
          if (!entries.length) return null;
          const sub = entries.reduce((s, e) => s + e.calories, 0);
          return (
            <div key={mt} className="space-y-1.5">
              {/* Meal header */}
              <div className="flex items-center gap-2 px-1">
                <div className="w-1 h-4 rounded-full" style={{ background: ACCENT, opacity: 0.5 }} />
                <span className="text-xs font-black tracking-[0.12em] uppercase"
                  style={{ color: 'var(--t-muted)' }}>
                  {mt}
                </span>
                <span className="ml-auto text-[11px] font-mono" style={{ color: 'var(--t-faint)' }}>
                  {Math.round(sub)} kcal
                </span>
              </div>

              {entries.map(e => (
                <div key={e.id} className="card flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-snug truncate" style={{ color: 'var(--t-head)' }}>
                      {e.name}
                    </p>
                    <p className="text-[11px] font-mono mt-1 flex flex-wrap gap-x-2" style={{ color: 'var(--t-faint)' }}>
                      {e.calories > 0 && <span style={{ color: '#f59e0b' }}>{e.calories} kcal</span>}
                      {e.protein_g > 0 && <span style={{ color: '#60a5fa' }}>{e.protein_g}g P</span>}
                      {e.carbs_g   > 0 && <span style={{ color: ACCENT }}>{e.carbs_g}g C</span>}
                      {e.fat_g     > 0 && <span style={{ color: '#fbbf24' }}>{e.fat_g}g F</span>}
                    </p>
                  </div>
                  <button onClick={() => deleteEntry(e.id)}
                    className="tap p-1.5 rounded-lg flex-shrink-0"
                    style={{ background: 'var(--s3)', color: 'var(--t-faint)' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          );
        })}

      </div>
    </div>
  );
}
