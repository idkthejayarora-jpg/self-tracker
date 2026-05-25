import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, BookMarked, ChevronLeft, ChevronRight, X, Save, Pencil, Check, AlertCircle, Search, Salad } from 'lucide-react';
import { format, parseISO, addDays, subDays } from 'date-fns';
import api from '../lib/api';

interface SavedMeal {
  id: number; name: string; calories: number;
  protein_g: number; carbs_g: number; fat_g: number; notes: string;
}
interface FoodLog {
  id: number; date: string; meal_type: string; name: string;
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
  saved_meal_id: number | null;
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];

const MEAL_EMOJI: Record<MealType, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
};

interface FoodItem {
  id: number; name: string; serving: string;
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
  category: string;
}

type MetricUnit = 'g' | 'ml' | 'mg' | 'pcs';

function defaultMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 19) return 'snack';
  return 'dinner';
}

function guessUnit(serving: string): MetricUnit {
  const s = serving.toLowerCase();
  if (/\d+\s*ml/.test(s) || s.includes('litr')) return 'ml';
  if (/\d+\s*mg/.test(s)) return 'mg';
  if (/\d+\s*g/.test(s)) return 'g';
  return 'pcs';
}

function metricToMultiplier(val: string, unit: MetricUnit, serving: string): number {
  const num = parseFloat(val);
  if (!val.trim() || isNaN(num) || num <= 0) return 1;
  const s = serving.toLowerCase();
  if (unit === 'pcs') return num;
  if (unit === 'g') {
    const m = s.match(/~?(\d+(?:\.\d+)?)\s*g/);
    return m ? num / parseFloat(m[1]) : num / 100;
  }
  if (unit === 'ml') {
    const m = s.match(/(\d+(?:\.\d+)?)\s*ml/);
    return m ? num / parseFloat(m[1]) : num / 200;
  }
  if (unit === 'mg') {
    const m = s.match(/~?(\d+(?:\.\d+)?)\s*g/);
    return m ? num / (parseFloat(m[1]) * 1000) : num / 100000;
  }
  return 1;
}

const ACCENT_DIET = '#34d399';

// ── Meal Picker popup ──────────────────────────────────────────────────────────
function MealPickerSheet({
  item, cal, p, c, f, onSelect, onCancel,
}: {
  item: FoodItem; cal: number; p: number; c: number; f: number;
  onSelect: (meal: MealType) => void; onCancel: () => void;
}) {
  const def = defaultMealType();
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm scale-in"
        style={{ background: 'var(--s1)', border: `1px solid ${ACCENT_DIET}30`, borderRadius: 20 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Item summary */}
        <div className="px-5 pt-5 pb-3 border-b" style={{ borderColor: 'var(--b)' }}>
          <p className="text-sm font-bold text-head truncate">{item.name}</p>
          <p className="text-[11px] font-mono mt-0.5" style={{ color: ACCENT_DIET, opacity: 0.7 }}>
            {cal} kcal &nbsp;·&nbsp; {p}g P &nbsp;·&nbsp; {c}g C &nbsp;·&nbsp; {f}g F
          </p>
        </div>
        {/* Meal options */}
        <div className="px-4 py-4">
          <p className="text-[9px] font-black tracking-[0.2em] mb-3" style={{ color: ACCENT_DIET, opacity: 0.55 }}>
            ADD TO WHICH MEAL?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {MEAL_TYPES.map(mt => (
              <button key={mt} onClick={() => onSelect(mt)}
                className="tap py-3 rounded-xl text-sm font-bold capitalize flex items-center justify-center gap-2"
                style={{
                  background: mt === def ? `${ACCENT_DIET}18` : 'var(--s2)',
                  color: mt === def ? ACCENT_DIET : 'var(--t-body)',
                  border: `1px solid ${mt === def ? ACCENT_DIET + '40' : 'var(--b)'}`,
                }}>
                <span>{MEAL_EMOJI[mt]}</span> {mt}
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 pb-4">
          <button onClick={onCancel} className="w-full py-2 rounded-xl text-xs font-semibold tap"
            style={{ background: 'var(--s2)', color: 'var(--t-faint)' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Food Search ────────────────────────────────────────────────────────────────
function FoodSearchBar({ onLogged }: { onLogged: () => void }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [qty, setQty]         = useState<Record<number, { val: string; unit: MetricUnit }>>({});
  const [logging, setLogging] = useState<Record<number, boolean>>({});
  const [done, setDone]       = useState<Record<number, boolean>>({});
  const [pending, setPending] = useState<FoodItem | null>(null);
  const debounceRef           = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getEntry = (item: FoodItem) => {
    const e = qty[item.id] ?? { val: '', unit: guessUnit(item.serving) };
    const mult = metricToMultiplier(e.val, e.unit, item.serving);
    return {
      val: e.val, unit: e.unit, mult,
      cal: Math.round(item.calories  * mult),
      p:   Math.round(item.protein_g * mult * 10) / 10,
      c:   Math.round(item.carbs_g   * mult * 10) / 10,
      f:   Math.round(item.fat_g     * mult * 10) / 10,
    };
  };

  const setItemQty = (id: number, patch: Partial<{ val: string; unit: MetricUnit }>) =>
    setQty(prev => ({ ...prev, [id]: { ...(prev[id] ?? { val: '', unit: 'g' }), ...patch } }));

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const r = await api.get<FoodItem[]>(`/diet/food-search?q=${encodeURIComponent(q)}&limit=6`);
      setResults(r.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  const logItem = async (item: FoodItem, meal: MealType) => {
    setPending(null);
    const { mult, cal, p, c, f } = getEntry(item);
    setLogging(prev => ({ ...prev, [item.id]: true }));
    try {
      await api.post('/diet/log', {
        name: item.name, meal_type: meal,
        calories: cal, protein_g: p, carbs_g: c, fat_g: f,
        // pass raw multiplier for reference
        _qty_multiplier: mult,
      });
      setDone(prev => ({ ...prev, [item.id]: true }));
      setTimeout(() => setDone(prev => { const n = {...prev}; delete n[item.id]; return n; }), 1800);
      onLogged();
    } finally { setLogging(prev => ({ ...prev, [item.id]: false })); }
  };

  return (
    <>
      {/* Meal picker popup */}
      {pending && (() => {
        const { cal, p, c, f } = getEntry(pending);
        return (
          <MealPickerSheet
            item={pending} cal={cal} p={p} c={c} f={f}
            onSelect={meal => logItem(pending, meal)}
            onCancel={() => setPending(null)}
          />
        );
      })()}

      <div className="relative overflow-hidden rounded-2xl"
        style={{ background: 'var(--hero-bg)', border: `1px solid ${ACCENT_DIET}18`, boxShadow: `0 0 20px ${ACCENT_DIET}07` }}>
        {/* Scanlines */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, ${ACCENT_DIET}02 3px, ${ACCENT_DIET}02 4px)` }} />
        {/* Top glow bar */}
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${ACCENT_DIET}55, transparent)` }} />
        {/* HUD corners */}
        {([['top-0 left-0', 'borderTop', 'borderLeft'], ['top-0 right-0', 'borderTop', 'borderRight'],
           ['bottom-0 left-0', 'borderBottom', 'borderLeft'], ['bottom-0 right-0', 'borderBottom', 'borderRight']] as const)
          .map(([pos, a, b], i) => (
            <div key={i} className={`absolute ${pos} pointer-events-none`}
              style={{ width: 10, height: 10, opacity: 0.4, [a]: `1.5px solid ${ACCENT_DIET}`, [b]: `1.5px solid ${ACCENT_DIET}` }} />
          ))}

        <div className="relative z-10 px-4 py-4 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-4 rounded-full" style={{ background: ACCENT_DIET }} />
            <span className="text-[10px] font-black tracking-[0.22em] font-mono" style={{ color: ACCENT_DIET, opacity: 0.65 }}>
              FOOD_SEARCH://
            </span>
            <span className="text-[10px] font-mono opacity-30 text-white">// 430+ Indian foods + typo-tolerant</span>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: ACCENT_DIET, opacity: 0.5 }} />
            <input
              type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="roti, chicken breast, protein bar..."
              autoComplete="off"
              className="w-full text-sm rounded-xl pl-8 pr-3 py-2 focus:outline-none"
              style={{ background: 'var(--s3)', color: 'var(--t-head)', border: `1px solid ${ACCENT_DIET}25` }}
            />
            {loading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono animate-pulse"
                style={{ color: ACCENT_DIET, opacity: 0.5 }}>...</span>
            )}
          </div>

          {/* Results */}
          <div className="space-y-2">
            {results.map(item => {
              const e = getEntry(item);
              const isDone    = done[item.id];
              const isLogging = logging[item.id];
              const UNITS: MetricUnit[] = ['g', 'ml', 'mg', 'pcs'];

              return (
                <div key={item.id} className="rounded-xl px-3 py-2.5"
                  style={{ background: 'var(--s2)', border: `1px solid ${isDone ? ACCENT_DIET+'50' : 'rgba(255,255,255,0.06)'}`, transition: 'border-color 0.2s' }}>

                  {/* Name + live macros */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-tight truncate" style={{ color: 'var(--t-head)' }}>
                        {item.name}
                      </p>
                      <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--t-faint)' }}>
                        per {item.serving}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 text-[10px] font-mono font-bold">
                      <span style={{ color: '#f59e0b' }}>{e.cal}kcal</span>
                      <span style={{ color: '#60a5fa' }}>{e.p}P</span>
                      <span style={{ color: ACCENT_DIET }}>{e.c}C</span>
                      <span style={{ color: '#fbbf24' }}>{e.f}F</span>
                    </div>
                  </div>

                  {/* Metric qty + log button */}
                  <div className="flex items-center gap-2">
                    {/* Number input */}
                    <input
                      type="number" min="0" step="any"
                      value={e.val}
                      onChange={ev => setItemQty(item.id, { val: ev.target.value })}
                      placeholder="qty"
                      className="text-sm font-mono rounded-lg px-2.5 py-1.5 focus:outline-none w-20 text-center"
                      style={{ background: 'var(--s3)', color: 'var(--t-body)', border: `1px solid ${ACCENT_DIET}25` }}
                    />
                    {/* Unit chips */}
                    <div className="flex gap-1">
                      {UNITS.map(u => (
                        <button key={u} type="button"
                          onClick={() => setItemQty(item.id, { unit: u })}
                          className="tap text-[9px] font-black px-1.5 py-1 rounded-md"
                          style={e.unit === u
                            ? { background: ACCENT_DIET, color: '#000' }
                            : { background: 'var(--s3)', color: 'var(--t-faint)' }}>
                          {u}
                        </button>
                      ))}
                    </div>
                    {/* Log button */}
                    <button
                      onClick={() => !isDone && !isLogging && setPending(item)}
                      disabled={isLogging || isDone}
                      className="tap ml-auto text-[11px] font-black px-3 py-1.5 rounded-lg"
                      style={{
                        background: isDone ? `${ACCENT_DIET}20` : ACCENT_DIET,
                        color: isDone ? ACCENT_DIET : '#000',
                        border: isDone ? `1px solid ${ACCENT_DIET}50` : 'none',
                        opacity: isLogging ? 0.6 : 1,
                        minWidth: 64,
                      }}>
                      {isDone ? '✓ DONE' : isLogging ? '...' : '+ LOG'}
                    </button>
                  </div>
                </div>
              );
            })}

            {results.length === 0 && !loading && query.trim() && (
              <p className="text-[11px] font-mono text-center py-2" style={{ color: 'var(--t-faint)', opacity: 0.5 }}>
                // no matches — try a different spelling
              </p>
            )}
            {results.length === 0 && !loading && !query.trim() && (
              <p className="text-[11px] font-mono text-center py-3" style={{ color: 'var(--t-faint)', opacity: 0.35 }}>
                // start typing — 430+ foods, typo-tolerant
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function getStoredGoal() {
  const v = localStorage.getItem('calorie_goal');
  return v ? parseInt(v, 10) : 2000;
}

function MacroPill({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-lg font-bold" style={{ color }}>{Math.round(value)}</span>
      <span className="text-xs" style={{ color: 'var(--t-dim)' }}>{unit} {label}</span>
    </div>
  );
}

// ── Add Entry Form (manual log) ────────────────────────────────────────────────
function AddEntryForm({
  onAdd, savedMeals, onClose, addError,
}: {
  onAdd: (entry: Omit<FoodLog, 'id' | 'date'>) => Promise<void>;
  savedMeals: SavedMeal[]; onClose: () => void; addError: string;
}) {
  const [name, setName]           = useState('');
  const [mealType, setMealType]   = useState<MealType>(defaultMealType());
  const [calories, setCalories]   = useState('');
  const [protein, setProtein]     = useState('');
  const [carbs, setCarbs]         = useState('');
  const [fat, setFat]             = useState('');
  const [selectedSaved, setSelectedSaved] = useState<number | null>(null);
  const [saving, setSaving]       = useState(false);

  function fillFromSaved(meal: SavedMeal) {
    setName(meal.name);
    setCalories(String(meal.calories));
    setProtein(String(meal.protein_g));
    setCarbs(String(meal.carbs_g));
    setFat(String(meal.fat_g));
    setSelectedSaved(meal.id);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onAdd({
        meal_type: mealType, name: name.trim(),
        calories: Number(calories) || 0, protein_g: Number(protein) || 0,
        carbs_g: Number(carbs) || 0, fat_g: Number(fat) || 0,
        saved_meal_id: selectedSaved,
      });
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="card px-4 py-4 space-y-3 scale-in">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-head">Add food manually</span>
        <button type="button" onClick={onClose} className="tap" style={{ color: 'var(--t-dim)' }}><X size={15} /></button>
      </div>

      {addError && (
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgb(239 68 68 / 0.1)', color: '#f87171' }}>
          <AlertCircle size={12} />{addError}
        </div>
      )}

      {/* Quick-fill from saved meals */}
      {savedMeals.length > 0 && (
        <div>
          <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--t-dim)' }}>QUICK-ADD FROM SAVED</p>
          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
            {savedMeals.map(m => (
              <button key={m.id} type="button" onClick={() => fillFromSaved(m)}
                className="text-xs px-2.5 py-1 rounded-full tap"
                style={{
                  background: selectedSaved === m.id ? `rgb(var(--accent-rgb) / 0.15)` : 'var(--s3)',
                  color: selectedSaved === m.id ? `rgb(var(--accent-rgb-light))` : 'var(--t-muted)',
                  border: `1px solid ${selectedSaved === m.id ? `rgb(var(--accent-rgb) / 0.4)` : 'transparent'}`,
                }}>
                {m.name} · {m.calories} kcal
              </button>
            ))}
          </div>
        </div>
      )}

      <input required value={name}
        onChange={e => { setName(e.target.value); setSelectedSaved(null); }}
        placeholder="Food name"
        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
        style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />

      {/* Meal type — inline compact chips */}
      <div className="flex gap-1.5 flex-wrap">
        {MEAL_TYPES.map(t => (
          <button key={t} type="button" onClick={() => setMealType(t)}
            className="tap flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold capitalize"
            style={{
              background: mealType === t ? `rgb(var(--accent-rgb) / 0.15)` : 'var(--s3)',
              color: mealType === t ? `rgb(var(--accent-rgb-light))` : 'var(--t-muted)',
              border: `1px solid ${mealType === t ? `rgb(var(--accent-rgb) / 0.3)` : 'transparent'}`,
            }}>
            {MEAL_EMOJI[t]} {t}
          </button>
        ))}
      </div>

      {/* Macros — g labels everywhere */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { val: calories, set: setCalories, label: 'kcal' },
          { val: protein,  set: setProtein,  label: 'protein (g)' },
          { val: carbs,    set: setCarbs,    label: 'carbs (g)' },
          { val: fat,      set: setFat,      label: 'fat (g)' },
        ].map(({ val, set, label }) => (
          <div key={label}>
            <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--t-dim)' }}>{label}</p>
            <input type="number" min={0} value={val} onChange={e => set(e.target.value)}
              className="w-full rounded-lg px-2 py-1.5 text-sm focus:outline-none"
              style={{ background: 'var(--s3)', color: 'var(--t-body)', border: '1px solid var(--b)' }} />
          </div>
        ))}
      </div>

      <button type="submit" disabled={!name.trim() || saving}
        className="w-full py-2 rounded-lg text-sm font-semibold tap disabled:opacity-50"
        style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
        {saving ? 'Adding...' : 'Add to log'}
      </button>
    </form>
  );
}

// ── Save Meal Modal ─────────────────────────────────────────────────────────────
function SaveMealModal({ onSave, onClose }: { onSave: (m: Omit<SavedMeal, 'id'>) => void; onClose: () => void }) {
  const [name, setName]       = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs]     = useState('');
  const [fat, setFat]         = useState('');
  const [notes, setNotes]     = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), calories: Number(calories)||0, protein_g: Number(protein)||0, carbs_g: Number(carbs)||0, fat_g: Number(fat)||0, notes });
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <form onSubmit={handleSubmit} className="card px-5 py-5 w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-head">Save meal template</h3>
          <button type="button" onClick={onClose} className="tap" style={{ color: 'var(--t-dim)' }}><X size={16} /></button>
        </div>
        <input required value={name} onChange={e => setName(e.target.value)} placeholder="Meal name (e.g. Protein shake)"
          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
          style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
        <div className="grid grid-cols-4 gap-2">
          {[
            { val: calories, set: setCalories, label: 'kcal' },
            { val: protein,  set: setProtein,  label: 'protein (g)' },
            { val: carbs,    set: setCarbs,    label: 'carbs (g)' },
            { val: fat,      set: setFat,      label: 'fat (g)' },
          ].map(({ val, set, label }) => (
            <div key={label}>
              <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--t-dim)' }}>{label}</p>
              <input type="number" min={0} value={val} onChange={e => set(e.target.value)}
                className="w-full rounded-lg px-2 py-1.5 text-sm focus:outline-none"
              style={{ background: 'var(--s3)', color: 'var(--t-body)', border: '1px solid var(--b)' }} />
            </div>
          ))}
        </div>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
          style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm font-medium tap"
            style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>Cancel</button>
          <button type="submit" disabled={!name.trim()}
            className="flex-1 py-2 rounded-lg text-sm font-semibold tap disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
            <Save size={14} /> Save meal
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Molecular bg decoration ───────────────────────────────────────────────────
function MolecularBg() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="absolute" style={{
          left: `${10 + i * 12}%`, top: `${20 + (i % 3) * 20}%`, opacity: 0.12,
        }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <polygon points="12,2 22,8 22,20 12,26 2,20 2,8" stroke="#34d399" strokeWidth="1" fill="none" />
          </svg>
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Diet() {
  const [date, setDate]               = useState(new Date().toISOString().slice(0, 10));
  const [log, setLog]                 = useState<FoodLog[]>([]);
  const [savedMeals, setSavedMeals]   = useState<SavedMeal[]>([]);
  const [showAdd, setShowAdd]         = useState(false);
  const [addError, setAddError]       = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [activeTab, setActiveTab]     = useState<'log' | 'meals'>('log');
  const [calorieGoal, setCalorieGoal] = useState<number>(getStoredGoal);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput]     = useState('');
  const addFormRef = useRef<HTMLDivElement>(null);

  // Scroll the manual-add form into view when it opens (avoids hunting for it)
  useEffect(() => {
    if (showAdd && addFormRef.current) {
      setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }, [showAdd]);

  const isToday = date === new Date().toISOString().slice(0, 10);

  const loadLog = useCallback(async (d: string) => {
    const res = await api.get<FoodLog[]>(`/diet/log?date=${d}`);
    setLog(res.data);
  }, []);

  const loadSavedMeals = useCallback(async () => {
    const res = await api.get<SavedMeal[]>('/diet/meals');
    setSavedMeals(res.data);
  }, []);

  useEffect(() => { loadLog(date); }, [date, loadLog]);
  useEffect(() => { loadSavedMeals(); }, [loadSavedMeals]);

  function saveGoal() {
    const val = parseInt(goalInput, 10);
    if (val > 0) { setCalorieGoal(val); localStorage.setItem('calorie_goal', String(val)); }
    setEditingGoal(false);
  }

  async function addEntry(entry: Omit<FoodLog, 'id' | 'date'>) {
    setAddError('');
    try {
      await api.post('/diet/log', { ...entry, date });
      await loadLog(date);
      setShowAdd(false);
    } catch (e: any) {
      setAddError(e?.response?.data?.error || e?.message || 'Failed to add entry.');
      throw e;
    }
  }

  async function deleteEntry(id: number) {
    await api.delete(`/diet/log/${id}`);
    setLog(prev => prev.filter(e => e.id !== id));
  }

  async function saveMeal(meal: Omit<SavedMeal, 'id'>) {
    await api.post('/diet/meals', meal);
    await loadSavedMeals();
    setShowSaveModal(false);
  }

  async function deleteSavedMeal(id: number) {
    await api.delete(`/diet/meals/${id}`);
    setSavedMeals(prev => prev.filter(m => m.id !== id));
  }

  const goDay = (delta: number) => {
    const d = new Date(date + 'T00:00:00');
    setDate((delta > 0 ? addDays : subDays)(d, Math.abs(delta)).toISOString().slice(0, 10));
  };

  // ── Quick-log ──────────────────────────────────────────────────────────────
  const [quickText, setQuickText]   = useState('');
  const [quickLogging, setQuickLogging] = useState(false);
  const [quickResult, setQuickResult] = useState<{
    logged: { meal_type: string; name: string; calories: number; protein_g: number; source?: string }[];
    unmatched: string[]; insertedIds: number[]; preview: string;
  } | null>(null);
  const [quickErr, setQuickErr]     = useState('');
  const [undoIds, setUndoIds]       = useState<number[]>([]);

  async function submitQuickLog() {
    if (!quickText.trim() || quickLogging) return;
    setQuickLogging(true); setQuickErr(''); setQuickResult(null);
    try {
      const r = await api.post('/diet/quick-log', { text: quickText.trim(), date });
      setQuickResult(r.data);
      setUndoIds(r.data.insertedIds || []);
      setQuickText('');
      await loadLog(date);
    } catch (e: any) {
      setQuickErr(e?.response?.data?.error || e?.message || 'Failed to log');
    } finally { setQuickLogging(false); }
  }

  async function undoQuickLog() {
    if (!undoIds.length) return;
    try {
      await api.post('/diet/quick-log/undo', { ids: undoIds });
      setQuickResult(null); setUndoIds([]);
      await loadLog(date);
    } catch {/* ignore */}
  }

  const totals = log.reduce(
    (acc, e) => ({ cal: acc.cal + e.calories, p: acc.p + e.protein_g, c: acc.c + e.carbs_g, f: acc.f + e.fat_g }),
    { cal: 0, p: 0, c: 0, f: 0 }
  );
  const calPct   = Math.min(100, Math.round((totals.cal / calorieGoal) * 100));
  const calColor = calPct > 110 ? '#f43f5e' : calPct > 85 ? '#22c55e' : '#f59e0b';

  const byMealType = MEAL_TYPES.reduce<Record<string, FoodLog[]>>((acc, t) => {
    acc[t] = log.filter(e => e.meal_type === t);
    return acc;
  }, {} as Record<string, FoodLog[]>);

  return (
    <div className="max-w-2xl mx-auto space-y-6 anim-page pb-16"
      style={{ '--accent-rgb': '52 211 153', '--accent-rgb-light': '#34d399' } as React.CSSProperties}>

      {/* Background grid */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(52,211,153,0.05) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* ── BIOLAB HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{ background: 'var(--hero-bg)', border: '1px solid #34d39925', minHeight: 100 }}>
        <MolecularBg />
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #34d39980, transparent)' }} />
        <div className="relative z-10 px-5 py-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: '#34d399', opacity: 0.6 }}>LAB://</span>
              <span className="cursor-blink font-mono" style={{ color: '#34d399', fontSize: 11 }}>▌</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white" style={{ textShadow: '0 0 30px #34d39940' }}>
              BIOLAB
            </h1>
            <p className="font-mono text-[10px] mt-0.5" style={{ color: '#34d399', opacity: 0.45 }}>
              // fuel optimization
            </p>
          </div>
          <Salad size={32} style={{ color: '#34d399', opacity: 0.25 }} />
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Controls row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => goDay(-1)}
              className="p-2 rounded-lg tap" style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>
              <ChevronLeft size={16} />
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-head">{format(parseISO(date), 'EEE, d MMM yyyy')}</p>
              {isToday && <span className="text-[10px]" style={{ color: 'rgb(var(--accent-rgb-light))' }}>Today</span>}
            </div>
            <button type="button" onClick={() => goDay(1)} disabled={isToday}
              className="p-2 rounded-lg tap disabled:opacity-30" style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>
              <ChevronRight size={16} />
            </button>
            {!isToday && (
              <button type="button" onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                className="text-xs px-2.5 py-1.5 rounded-lg tap font-semibold"
                style={{ background: `rgb(var(--accent-rgb) / 0.12)`, color: `rgb(var(--accent-rgb-light))` }}>
                Today
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowSaveModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold tap"
              style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>
              <BookMarked size={13} /> Save meal
            </button>
            <button type="button" onClick={() => setActiveTab(t => t === 'log' ? 'meals' : 'log')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold tap"
              style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>
              {activeTab === 'log' ? 'Saved' : 'Log'}
            </button>
          </div>
        </div>

        {activeTab === 'log' ? (
          <>
            {/* Daily summary */}
            <div className="card px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-2xl font-bold" style={{ color: calColor }}>{Math.round(totals.cal)}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {editingGoal ? (
                      <>
                        <span className="text-xs" style={{ color: 'var(--t-dim)' }}>/ </span>
                        <input type="number" value={goalInput}
                          onChange={e => setGoalInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditingGoal(false); }}
                          className="w-20 rounded px-1.5 py-0.5 text-xs border focus:outline-none" autoFocus />
                        <span className="text-xs" style={{ color: 'var(--t-dim)' }}>kcal</span>
                        <button type="button" onClick={saveGoal} className="tap" style={{ color: '#22c55e' }}><Check size={13} /></button>
                        <button type="button" onClick={() => setEditingGoal(false)} className="tap" style={{ color: 'var(--t-dim)' }}><X size={13} /></button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs" style={{ color: 'var(--t-dim)' }}>/ {calorieGoal} kcal</span>
                        <button type="button" onClick={() => { setGoalInput(String(calorieGoal)); setEditingGoal(true); }} className="tap" style={{ color: '#52525b' }}>
                          <Pencil size={11} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-5">
                  <MacroPill label="protein" value={totals.p} unit="g" color="#60a5fa" />
                  <MacroPill label="carbs"   value={totals.c} unit="g" color="#34d399" />
                  <MacroPill label="fat"     value={totals.f} unit="g" color="#fbbf24" />
                </div>
              </div>
              <div className="w-full rounded-full h-1.5" style={{ background: 'var(--s3)' }}>
                <div className="h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${calPct}%`, backgroundColor: calColor }} />
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--t-faint)' }}>{calPct}% of daily goal</p>
            </div>

            {/* Food Search */}
            <FoodSearchBar onLogged={() => loadLog(date)} />

            {/* Quick-log */}
            <div className="card px-4 py-4 space-y-3"
              style={{ borderColor: 'rgb(52 211 153 / 0.2)', background: 'linear-gradient(135deg, var(--s1) 0%, rgba(52,211,153,0.03) 100%)' }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black tracking-[0.2em]" style={{ color: '#34d399' }}>QUICK LOG</span>
                <span className="text-[10px] font-mono opacity-40 text-white">// natural language</span>
              </div>
              <textarea rows={2} value={quickText}
                onChange={e => { setQuickText(e.target.value); setQuickResult(null); setUndoIds([]); setQuickErr(''); }}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitQuickLog(); }}
                placeholder="e.g. oats and protein shake for breakfast, chicken rice for lunch"
                className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none"
                style={{ background: 'var(--s3)', color: 'var(--t-body)', border: '1px solid rgb(52 211 153 / 0.2)' }}
              />
              {quickErr && <p className="text-xs" style={{ color: '#f87171' }}>{quickErr}</p>}
              {quickResult && (
                <div className="rounded-xl px-3 py-3 space-y-1.5"
                  style={{ background: 'rgb(52 211 153 / 0.06)', border: '1px solid rgb(52 211 153 / 0.15)' }}>
                  <div className="flex flex-wrap gap-1">
                    {quickResult.logged.map((e, i) => (
                      <span key={i} className="text-[11px] font-mono" style={{ color: '#34d399' }}>
                        {e.name}
                        {e.source === 'db' && (
                          <span className="text-[9px] px-1 py-0.5 rounded font-black ml-1"
                            style={{ background: '#f59e0b20', color: '#f59e0b' }}>~avg</span>
                        )}
                        {i < quickResult.logged.length - 1 && <span style={{ color: 'var(--t-faint)' }}> · </span>}
                      </span>
                    ))}
                  </div>
                  {quickResult.unmatched.length > 0 && (
                    <p className="text-[11px]" style={{ color: '#f59e0b' }}>
                      Unrecognised: {quickResult.unmatched.join(', ')} — search above or add manually
                    </p>
                  )}
                  <button type="button" onClick={undoQuickLog} className="text-[11px] tap underline" style={{ color: 'var(--t-faint)' }}>
                    Undo
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => { setShowAdd(s => !s); setAddError(''); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold tap"
                  style={{ background: `rgb(var(--accent-rgb) / 0.08)`, color: `rgb(var(--accent-rgb-light))` }}>
                  <Plus size={13} /> Manual
                </button>
                <button type="button" onClick={submitQuickLog} disabled={!quickText.trim() || quickLogging}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold tap disabled:opacity-40"
                  style={{ background: 'rgb(52 211 153 / 0.9)', color: '#000' }}>
                  {quickLogging ? 'Logging...' : 'Log it'}
                </button>
              </div>
            </div>

            {showAdd && (
              <div ref={addFormRef}>
                <AddEntryForm
                  onAdd={addEntry} savedMeals={savedMeals}
                  onClose={() => { setShowAdd(false); setAddError(''); }} addError={addError}
                />
              </div>
            )}

            {/* Meal groups */}
            {MEAL_TYPES.map(mt => {
              const entries = byMealType[mt];
              if (entries.length === 0) return null;
              const subtotal = entries.reduce((s, e) => s + e.calories, 0);
              return (
                <div key={mt} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-base">{MEAL_EMOJI[mt]}</span>
                    <span className="text-sm font-bold text-head capitalize tracking-wide">{mt}</span>
                    <span className="text-xs ml-auto font-mono" style={{ color: 'var(--t-dim)' }}>{Math.round(subtotal)} kcal</span>
                  </div>
                  {entries.map(e => (
                    <div key={e.id} className="card flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-head leading-snug">{e.name}</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--t-dim)' }}>
                          <span style={{ color: '#f59e0b' }}>{e.calories} kcal</span>
                          {e.protein_g > 0 && <span style={{ color: '#60a5fa' }}> · {e.protein_g}g P</span>}
                          {e.carbs_g  > 0 && <span style={{ color: '#34d399' }}> · {e.carbs_g}g C</span>}
                          {e.fat_g    > 0 && <span style={{ color: '#fbbf24' }}> · {e.fat_g}g F</span>}
                        </p>
                      </div>
                      <button type="button" onClick={() => deleteEntry(e.id)} className="tap p-1.5 rounded-lg" style={{ color: 'var(--t-faint)', background: 'var(--s3)' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}

            {log.length === 0 && !showAdd && (
              <div className="card py-12 text-center">
                <Salad size={32} className="mx-auto mb-3" style={{ color: 'var(--t-faint)', opacity: 0.4 }} />
                <p className="text-sm font-medium" style={{ color: 'var(--t-dim)' }}>Nothing logged yet</p>
                <button type="button" onClick={() => setShowAdd(true)}
                  className="mt-3 text-xs font-semibold tap" style={{ color: `rgb(var(--accent-rgb-light))` }}>
                  + Add first meal
                </button>
              </div>
            )}
          </>
        ) : (
          /* Saved meals */
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--t-dim)' }}>
              Saved meals let you quickly prefill macros. Tap <span style={{ color: `rgb(var(--accent-rgb-light))` }}>Save meal</span> to add new ones.
            </p>
            {savedMeals.length === 0 && (
              <div className="card py-10 text-center">
                <BookMarked size={28} className="mx-auto mb-3" style={{ color: 'var(--t-faint)', opacity: 0.4 }} />
                <p className="text-sm" style={{ color: 'var(--t-dim)' }}>No saved meals yet</p>
              </div>
            )}
            {savedMeals.map(m => (
              <div key={m.id} className="card flex items-start gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-head">{m.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--t-dim)' }}>
                    {m.calories} kcal
                    {m.protein_g > 0 && ` · ${m.protein_g}g protein`}
                    {m.carbs_g > 0 && ` · ${m.carbs_g}g carbs`}
                    {m.fat_g > 0 && ` · ${m.fat_g}g fat`}
                  </p>
                  {m.notes && <p className="text-xs mt-1 italic" style={{ color: 'var(--t-faint)' }}>{m.notes}</p>}
                </div>
                <button type="button" onClick={() => deleteSavedMeal(m.id)} className="tap mt-0.5" style={{ color: 'var(--t-faint)' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {showSaveModal && <SaveMealModal onSave={saveMeal} onClose={() => setShowSaveModal(false)} />}

      </div>
    </div>
  );
}
