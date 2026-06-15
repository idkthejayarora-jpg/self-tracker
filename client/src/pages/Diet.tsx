import { useState, useEffect, useCallback, useRef } from 'react';
import { Trash2, ChevronLeft, ChevronRight, Salad, Check, Undo2, Mic, BookMarked, Plus, X, ChevronDown } from 'lucide-react';
import PaperBanner from '../components/PaperBanner';
import { format, parseISO, addDays, subDays } from 'date-fns';
import api from '../lib/api';
import { useVoiceInput } from '../hooks/useVoiceInput';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FoodLog {
  id: number; date: string; meal_type: string; name: string;
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
  saved_meal_id: number | null;
}

interface SavedMeal {
  id: number; name: string;
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
  notes: string;
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];

const ACCENT = '#d9a066';

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

  // saved meals
  const [savedMeals, setSavedMeals]         = useState<SavedMeal[]>([]);
  const [showSaved, setShowSaved]           = useState(false);
  const [showAddMeal, setShowAddMeal]       = useState(false);
  const [savedMealType, setSavedMealType]   = useState<MealType>('lunch');
  const [mealForm, setMealForm]             = useState({ name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '' });

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

  const loadSaved = useCallback(async () => {
    const res = await api.get<SavedMeal[]>('/diet/meals');
    setSavedMeals(res.data);
  }, []);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  async function createSavedMeal() {
    if (!mealForm.name.trim()) return;
    await api.post('/diet/meals', {
      name: mealForm.name.trim(),
      calories:  Number(mealForm.calories)  || 0,
      protein_g: Number(mealForm.protein_g) || 0,
      carbs_g:   Number(mealForm.carbs_g)   || 0,
      fat_g:     Number(mealForm.fat_g)     || 0,
    });
    setMealForm({ name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '' });
    setShowAddMeal(false);
    loadSaved();
  }

  async function logSavedMeal(meal: SavedMeal) {
    await api.post('/diet/log', {
      date, meal_type: savedMealType,
      name: meal.name, calories: meal.calories,
      protein_g: meal.protein_g, carbs_g: meal.carbs_g, fat_g: meal.fat_g,
      saved_meal_id: meal.id,
    });
    await loadLog(date);
  }

  async function deleteSavedMeal(id: number) {
    await api.delete(`/diet/meals/${id}`);
    loadSaved();
  }

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

  async function submitLog(override?: string) {
    const payload = (override ?? text).trim();
    if (!payload || logging) return;
    setLogging(true); setErr(''); setResult(null);
    try {
      const r = await api.post('/diet/quick-log', { text: payload, date });
      setResult(r.data);
      setUndoIds(r.data.insertedIds || []);
      setText('');
      await loadLog(date);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'Failed to log');
    } finally { setLogging(false); }
  }

  // ── Voice logging — speak the food, it transcribes + logs automatically ──────
  const voice = useVoiceInput({
    onFinal: (spoken) => {
      // Merge with any typed text, show it, then auto-log
      const merged = (text ? text + ' ' : '') + spoken;
      setText(merged);
      submitLog(merged);
    },
  });

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
  const calColor = calPct > 110 ? '#c2553d' : calPct > 85 ? '#cf8a3e' : '#d9a066';

  const byMeal = MEAL_TYPES.reduce<Record<MealType, FoodLog[]>>((acc, t) => {
    acc[t] = log.filter(e => e.meal_type === t);
    return acc;
  }, {} as Record<MealType, FoodLog[]>);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-7 anim-page pb-16"
      style={{ '--accent-rgb': '181 118 79', '--accent-rgb-light': ACCENT } as React.CSSProperties}>

      {/* Dot grid */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `radial-gradient(circle, rgba(217,160,102,0.05) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }} />
      </div>

      <PaperBanner
        title="Nutrition"
        label="BioLab"
        accent={ACCENT}
        subtitle="food, fuel, and what goes into the body"
      />

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
                { label: 'P', val: totals.p, color: '#c4a085' },
                { label: 'C', val: totals.c, color: ACCENT },
                { label: 'F', val: totals.f, color: '#e0b27c' },
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
            style={{ background: `${ACCENT}50` }} />
          <div className="relative z-10 px-4 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-0.5 h-4 rounded-full" style={{ background: ACCENT }} />
              <span className="text-[10px] font-black tracking-[0.22em] font-mono" style={{ color: ACCENT, opacity: 0.7 }}>
                {voice.listening ? 'LISTENING…' : 'LOG_FOOD://'}
              </span>

              {/* Voice mic button */}
              {voice.supported && (
                <div className="relative ml-auto">
                  {voice.listening && (
                    <>
                      <span className="mic-ring" />
                      <span className="mic-ring mic-ring-2" />
                      <span className="mic-ring mic-ring-3" />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => voice.listening ? voice.stop() : voice.start()}
                    title={voice.listening ? 'Stop' : 'Speak your meal'}
                    className={`tap relative z-10 w-9 h-9 rounded-xl flex items-center justify-center ${voice.listening ? 'mic-listening' : ''}`}
                    style={{
                      background: voice.listening ? 'rgba(205,82,64,0.9)' : `${ACCENT}1a`,
                      color: voice.listening ? '#fff' : ACCENT,
                      border: `1px solid ${voice.listening ? 'rgba(205,82,64,0.6)' : ACCENT + '40'}`,
                    }}>
                    <Mic size={16} />
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <textarea
                ref={textRef}
                rows={3}
                value={text}
                onChange={e => { setText(e.target.value); setResult(null); setErr(''); }}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitLog(); }}
                placeholder={voice.supported
                  ? 'Tap the mic and say it — or type:\n"2 rotis and dahi for lunch"\n"protein shake for breakfast"'
                  : '2 rotis and dahi for lunch\nprotein shake for breakfast\nchicken rice 200g dinner'}
                className="w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none resize-none font-mono leading-relaxed"
                style={{
                  background: 'var(--s3)',
                  color: 'var(--t-body)',
                  border: `1px solid ${voice.listening ? 'rgba(205,82,64,0.45)' : ACCENT + '20'}`,
                  lineHeight: 1.7,
                  transition: 'border-color 0.25s',
                }}
              />

              {/* Live listening overlay — waveform + interim transcript */}
              {voice.listening && (
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 py-2 rounded-b-xl scale-in"
                  style={{ background: 'rgba(205,82,64,0.10)' }}>
                  <div className="flex items-end gap-[2px] h-4">
                    {[0, 1, 2, 3, 4, 5, 6].map(i => (
                      <span key={i} className="waveform-bar"
                        style={{ height: '100%', background: '#e07b62', animationDelay: `${i * 0.09}s` }} />
                    ))}
                  </div>
                  <span className="text-[11px] font-mono truncate flex-1" style={{ color: '#e8a18f' }}>
                    {voice.interim || 'say your meal…'}
                  </span>
                </div>
              )}
            </div>

            {err && (
              <p className="text-xs font-mono" style={{ color: '#e07b62' }}>{err}</p>
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
                          style={{ background: '#d9a06620', color: '#d9a066' }}>~avg</span>
                      )}
                    </div>
                  ))}
                </div>
                {result.unmatched.length > 0 && (
                  <p className="text-[11px] font-mono" style={{ color: '#d9a066' }}>
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
                onClick={() => submitLog()}
                disabled={!text.trim() || logging}
                className="tap px-5 py-2 rounded-xl text-sm font-black disabled:opacity-40"
                style={{ background: logging ? `${ACCENT}60` : ACCENT, color: '#000' }}>
                {logging ? 'Logging...' : 'Log it'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Saved Meals ── */}
        <div className="card overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 tap"
            onClick={() => setShowSaved(s => !s)}>
            <div className="flex items-center gap-2">
              <BookMarked size={14} style={{ color: ACCENT }} />
              <span className="text-xs font-black tracking-[0.12em] uppercase" style={{ color: ACCENT }}>
                Saved Meals
              </span>
              {savedMeals.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono"
                  style={{ background: `${ACCENT}18`, color: ACCENT }}>
                  {savedMeals.length}
                </span>
              )}
            </div>
            <ChevronDown size={14} style={{ color: 'var(--t-faint)', transform: showSaved ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {showSaved && (
            <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: 'var(--b)' }}>
              {/* Meal type picker for logging */}
              <div className="flex items-center gap-2 pt-3">
                <span className="text-[10px] font-mono" style={{ color: 'var(--t-faint)' }}>Log as:</span>
                <div className="flex gap-1.5">
                  {MEAL_TYPES.map(mt => (
                    <button key={mt} onClick={() => setSavedMealType(mt)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-semibold capitalize tap transition-all"
                      style={{
                        background: savedMealType === mt ? `${ACCENT}22` : 'var(--s2)',
                        color: savedMealType === mt ? ACCENT : 'var(--t-faint)',
                        border: `1px solid ${savedMealType === mt ? ACCENT + '44' : 'var(--b)'}`,
                      }}>
                      {mt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Saved meal cards */}
              {savedMeals.length === 0 && !showAddMeal && (
                <p className="text-xs font-mono py-2" style={{ color: 'var(--t-faint)' }}>
                  No saved meals yet — add your go-to meals with exact macros.
                </p>
              )}

              <div className="space-y-2">
                {savedMeals.map(meal => (
                  <div key={meal.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{ background: 'var(--s2)', border: '1px solid var(--b)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--t-head)' }}>{meal.name}</p>
                      <p className="text-[11px] font-mono mt-0.5 flex gap-x-2 flex-wrap" style={{ color: 'var(--t-faint)' }}>
                        {meal.calories > 0 && <span style={{ color: ACCENT }}>{meal.calories} kcal</span>}
                        {meal.protein_g > 0 && <span>{meal.protein_g}g P</span>}
                        {meal.carbs_g   > 0 && <span>{meal.carbs_g}g C</span>}
                        {meal.fat_g     > 0 && <span>{meal.fat_g}g F</span>}
                      </p>
                    </div>
                    <button onClick={() => logSavedMeal(meal)}
                      className="tap shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold"
                      style={{ background: `${ACCENT}18`, color: ACCENT }}>
                      Log
                    </button>
                    <button onClick={() => deleteSavedMeal(meal.id)}
                      className="tap shrink-0 p-1.5 rounded-lg"
                      style={{ color: 'var(--t-faint)' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add new saved meal form */}
              {showAddMeal ? (
                <div className="rounded-xl p-3 space-y-2.5" style={{ background: 'var(--s2)', border: `1px solid ${ACCENT}30` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold" style={{ color: 'var(--t-head)' }}>New saved meal</span>
                    <button onClick={() => setShowAddMeal(false)} style={{ color: 'var(--t-faint)' }}><X size={14} /></button>
                  </div>
                  <input
                    value={mealForm.name}
                    onChange={e => setMealForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Meal name (e.g. Home oats bowl)"
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ background: 'var(--s3)', border: '1px solid var(--b)', color: 'var(--t-head)' }}
                  />
                  <div className="grid grid-cols-4 gap-2">
                    {([['calories','kcal'],['protein_g','P g'],['carbs_g','C g'],['fat_g','F g']] as const).map(([field, label]) => (
                      <div key={field}>
                        <p className="text-[10px] mb-1 font-mono" style={{ color: 'var(--t-faint)' }}>{label}</p>
                        <input
                          type="number" min="0"
                          value={mealForm[field]}
                          onChange={e => setMealForm(f => ({ ...f, [field]: e.target.value }))}
                          className="w-full px-2 py-1.5 rounded-lg text-sm text-center focus:outline-none"
                          style={{ background: 'var(--s3)', border: '1px solid var(--b)', color: 'var(--t-head)' }}
                        />
                      </div>
                    ))}
                  </div>
                  <button onClick={createSavedMeal} disabled={!mealForm.name.trim()}
                    className="tap w-full py-2 rounded-lg text-sm font-bold disabled:opacity-40"
                    style={{ background: ACCENT, color: '#000' }}>
                    Save meal
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowAddMeal(true)}
                  className="tap flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg w-full justify-center"
                  style={{ background: `${ACCENT}10`, color: ACCENT, border: `1px dashed ${ACCENT}40` }}>
                  <Plus size={13} /> Add custom meal
                </button>
              )}
            </div>
          )}
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
                      {e.calories > 0 && <span style={{ color: '#d9a066' }}>{e.calories} kcal</span>}
                      {e.protein_g > 0 && <span style={{ color: '#c4a085' }}>{e.protein_g}g P</span>}
                      {e.carbs_g   > 0 && <span style={{ color: ACCENT }}>{e.carbs_g}g C</span>}
                      {e.fat_g     > 0 && <span style={{ color: '#e0b27c' }}>{e.fat_g}g F</span>}
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
