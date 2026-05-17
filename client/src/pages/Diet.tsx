import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, BookMarked, ChevronLeft, ChevronRight, X, Save, Pencil, Check, AlertCircle } from 'lucide-react';
import { format, parseISO, addDays, subDays } from 'date-fns';
import api from '../lib/api';

interface SavedMeal {
  id: number;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes: string;
}

interface FoodLog {
  id: number;
  date: string;
  meal_type: string;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  saved_meal_id: number | null;
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];

const MEAL_EMOJI: Record<MealType, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
};

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

function AddEntryForm({
  onAdd,
  savedMeals,
  onClose,
  addError,
}: {
  onAdd: (entry: Omit<FoodLog, 'id' | 'date'>) => Promise<void>;
  savedMeals: SavedMeal[];
  onClose: () => void;
  addError: string;
}) {
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<MealType>('snack');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [selectedSaved, setSelectedSaved] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

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
        meal_type: mealType,
        name: name.trim(),
        calories: Number(calories) || 0,
        protein_g: Number(protein) || 0,
        carbs_g: Number(carbs) || 0,
        fat_g: Number(fat) || 0,
        saved_meal_id: selectedSaved,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card px-4 py-4 space-y-3 scale-in">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-head">Add food</span>
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
                  color: selectedSaved === m.id ? `rgb(var(--accent-rgb-light))` : '#71717a',
                  border: `1px solid ${selectedSaved === m.id ? `rgb(var(--accent-rgb) / 0.4)` : 'transparent'}`,
                }}>
                {m.name} · {m.calories} kcal
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Meal type */}
      <div className="grid grid-cols-4 gap-1.5">
        {MEAL_TYPES.map(t => (
          <button key={t} type="button" onClick={() => setMealType(t)}
            className="py-1.5 text-xs rounded-lg capitalize tap"
            style={{
              background: mealType === t ? `rgb(var(--accent-rgb) / 0.15)` : 'var(--s3)',
              color: mealType === t ? `rgb(var(--accent-rgb-light))` : '#71717a',
              border: `1px solid ${mealType === t ? `rgb(var(--accent-rgb) / 0.3)` : 'transparent'}`,
            }}>
            {MEAL_EMOJI[t]} {t}
          </button>
        ))}
      </div>

      <input
        required
        value={name}
        onChange={e => { setName(e.target.value); setSelectedSaved(null); }}
        placeholder="Food name"
        className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none"
      />

      <div className="grid grid-cols-4 gap-2">
        {[
          { val: calories, set: setCalories, label: 'kcal' },
          { val: protein,  set: setProtein,  label: 'protein g' },
          { val: carbs,    set: setCarbs,    label: 'carbs g' },
          { val: fat,      set: setFat,      label: 'fat g' },
        ].map(({ val, set, label }) => (
          <div key={label}>
            <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--t-dim)' }}>{label}</p>
            <input type="number" min={0} value={val} onChange={e => set(e.target.value)}
              className="w-full rounded-lg px-2 py-1.5 text-sm border focus:outline-none" />
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

function SaveMealModal({ onSave, onClose }: { onSave: (m: Omit<SavedMeal, 'id'>) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [notes, setNotes] = useState('');

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
          className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none" />
        <div className="grid grid-cols-4 gap-2">
          {[
            { val: calories, set: setCalories, label: 'kcal' },
            { val: protein,  set: setProtein,  label: 'protein g' },
            { val: carbs,    set: setCarbs,    label: 'carbs g' },
            { val: fat,      set: setFat,      label: 'fat g' },
          ].map(({ val, set, label }) => (
            <div key={label}>
              <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--t-dim)' }}>{label}</p>
              <input type="number" min={0} value={val} onChange={e => set(e.target.value)}
                className="w-full rounded-lg px-2 py-1.5 text-sm border focus:outline-none" />
            </div>
          ))}
        </div>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
          className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none" />
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

function MolecularBg() {
  const hexPoints = '12,2 22,8 22,20 12,26 2,20 2,8';
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="absolute"
          style={{
            left: `${10 + i * 12}%`, top: `${20 + (i % 3) * 20}%`,
            animation: `hex-drift ${3 + (i % 3)}s ease-in-out ${i * 400}ms infinite`,
          }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <polygon points={hexPoints} stroke="#34d399" strokeWidth="1" fill="none" />
          </svg>
        </div>
      ))}
    </div>
  );
}

export default function Diet() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [log, setLog] = useState<FoodLog[]>([]);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addError, setAddError] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'log' | 'meals'>('log');

  // Editable calorie goal
  const [calorieGoal, setCalorieGoal] = useState<number>(getStoredGoal);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

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

  function startEditGoal() {
    setGoalInput(String(calorieGoal));
    setEditingGoal(true);
  }

  function saveGoal() {
    const val = parseInt(goalInput, 10);
    if (val > 0) {
      setCalorieGoal(val);
      localStorage.setItem('calorie_goal', String(val));
    }
    setEditingGoal(false);
  }

  async function addEntry(entry: Omit<FoodLog, 'id' | 'date'>) {
    setAddError('');
    try {
      await api.post('/diet/log', { ...entry, date });
      await loadLog(date);
      setShowAdd(false);
    } catch (e: any) {
      setAddError(e?.response?.data?.error || e?.message || 'Failed to add entry. Check your connection.');
      throw e; // re-throw so AddEntryForm resets saving state
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

  const totals = log.reduce(
    (acc, e) => ({ cal: acc.cal + e.calories, p: acc.p + e.protein_g, c: acc.c + e.carbs_g, f: acc.f + e.fat_g }),
    { cal: 0, p: 0, c: 0, f: 0 }
  );
  const calPct = Math.min(100, Math.round((totals.cal / calorieGoal) * 100));
  const calColor = calPct > 110 ? '#f43f5e' : calPct > 85 ? '#22c55e' : '#f59e0b';

  const byMealType = MEAL_TYPES.reduce<Record<string, FoodLog[]>>((acc, t) => {
    acc[t] = log.filter(e => e.meal_type === t);
    return acc;
  }, {} as Record<string, FoodLog[]>);

  return (
    <div className="max-w-2xl mx-auto space-y-5 anim-page"
      style={{ '--accent-rgb': '52 211 153' } as React.CSSProperties}>

      {/* Cyberpunk body overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(52,211,153,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* ── BIOLAB HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl mb-4"
        style={{ background: 'var(--hero-bg)', border: '1px solid #34d39925', minHeight: 110 }}>
        <MolecularBg />
        <div className="absolute top-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #34d399', borderLeft: '1.5px solid #34d399', opacity: 0.7 }} />
        <div className="absolute top-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #34d399', borderRight: '1.5px solid #34d399', opacity: 0.7 }} />
        <div className="absolute bottom-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #34d399', borderLeft: '1.5px solid #34d399', opacity: 0.7 }} />
        <div className="absolute bottom-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #34d399', borderRight: '1.5px solid #34d399', opacity: 0.7 }} />
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #34d39980, transparent)', boxShadow: '0 0 8px #34d399' }} />
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: '#34d399', opacity: 0.6 }}>LAB://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">NUTRIENT_SYNTHESIS</span>
            <span className="cursor-blink font-mono" style={{ color: '#34d399', fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight leading-none text-white" style={{ textShadow: '0 0 30px #34d39940' }}>
            BIOLAB
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: '#34d399', opacity: 0.5 }}>
            // molecular nutrition analysis — fuel optimization protocol
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #34d39930, transparent)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgb(var(--accent-rgb))' }}>// Diet</h1>
        <div className="flex gap-2">
        <button type="button" onClick={() => setShowSaveModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold tap"
          style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>
          <BookMarked size={13} /> Save meal
        </button>
        <button type="button" onClick={() => setActiveTab(t => t === 'log' ? 'meals' : 'log')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold tap"
          style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>
          {activeTab === 'log' ? '📚 Saved' : '📋 Log'}
        </button>
        </div>
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => goDay(-1)}
          className="p-2 rounded-lg tap"
          style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-semibold text-head">{format(parseISO(date), 'EEE, d MMM yyyy')}</p>
          {isToday && <span className="text-xs" style={{ color: `rgb(var(--accent-rgb-light))` }}>Today</span>}
        </div>
        <button type="button" onClick={() => goDay(1)} disabled={isToday}
          className="p-2 rounded-lg tap disabled:opacity-30"
          style={{ background: 'var(--s3)', color: 'var(--t-dim)' }}>
          <ChevronRight size={16} />
        </button>
        {!isToday && (
          <button type="button" onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            className="text-xs px-3 py-1.5 rounded-lg tap font-semibold"
            style={{ background: `rgb(var(--accent-rgb) / 0.12)`, color: `rgb(var(--accent-rgb-light))` }}>
            Today
          </button>
        )}
      </div>

      {activeTab === 'log' ? (
        <>
          {/* Daily summary card */}
          <div className="card px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-2xl font-bold" style={{ color: calColor }}>{Math.round(totals.cal)}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {editingGoal ? (
                    <>
                      <span className="text-xs" style={{ color: 'var(--t-dim)' }}>/ </span>
                      <input
                        type="number"
                        value={goalInput}
                        onChange={e => setGoalInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditingGoal(false); }}
                        className="w-20 rounded px-1.5 py-0.5 text-xs border focus:outline-none"
                        autoFocus
                      />
                      <span className="text-xs" style={{ color: 'var(--t-dim)' }}>kcal</span>
                      <button type="button" onClick={saveGoal} className="tap" style={{ color: '#22c55e' }}>
                        <Check size={13} />
                      </button>
                      <button type="button" onClick={() => setEditingGoal(false)} className="tap" style={{ color: 'var(--t-dim)' }}>
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs" style={{ color: 'var(--t-dim)' }}>/ {calorieGoal} kcal goal</span>
                      <button type="button" onClick={startEditGoal} className="tap" style={{ color: '#52525b' }}>
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
              <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${calPct}%`, backgroundColor: calColor }} />
            </div>
            <p className="text-xs mt-1" style={{ color: '#52525b' }}>{calPct}% of daily goal</p>
          </div>

          {/* Add entry button */}
          <button type="button"
            onClick={() => { setShowAdd(s => !s); setAddError(''); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold tap"
            style={{ background: `rgb(var(--accent-rgb) / 0.12)`, color: `rgb(var(--accent-rgb-light))` }}>
            <Plus size={15} /> Add food
          </button>

          {showAdd && (
            <AddEntryForm
              onAdd={addEntry}
              savedMeals={savedMeals}
              onClose={() => { setShowAdd(false); setAddError(''); }}
              addError={addError}
            />
          )}

          {/* Meal groups */}
          {MEAL_TYPES.map(mt => {
            const entries = byMealType[mt];
            if (entries.length === 0) return null;
            const subtotal = entries.reduce((s, e) => s + e.calories, 0);
            return (
              <div key={mt} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{MEAL_EMOJI[mt]}</span>
                  <span className="text-sm font-semibold text-head capitalize">{mt}</span>
                  <span className="text-xs ml-auto" style={{ color: 'var(--t-dim)' }}>{Math.round(subtotal)} kcal</span>
                </div>
                {entries.map(e => (
                  <div key={e.id} className="card flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-head truncate">{e.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--t-dim)' }}>
                        {e.calories} kcal
                        {e.protein_g > 0 && ` · ${e.protein_g}g P`}
                        {e.carbs_g > 0 && ` · ${e.carbs_g}g C`}
                        {e.fat_g > 0 && ` · ${e.fat_g}g F`}
                      </p>
                    </div>
                    <button type="button" onClick={() => deleteEntry(e.id)} className="tap" style={{ color: '#52525b' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}

          {log.length === 0 && !showAdd && (
            <div className="card py-12 text-center">
              <p className="text-3xl mb-2">🥗</p>
              <p className="text-sm font-medium" style={{ color: 'var(--t-dim)' }}>Nothing logged yet for this day</p>
              <button type="button" onClick={() => setShowAdd(true)}
                className="mt-3 text-xs font-semibold tap"
                style={{ color: `rgb(var(--accent-rgb-light))` }}>
                + Add your first meal
              </button>
            </div>
          )}
        </>
      ) : (
        /* Saved meals library */
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--t-dim)' }}>
            Saved meals let you quickly add common foods. Tap <span style={{ color: `rgb(var(--accent-rgb-light))` }}>Save meal</span> to add new ones.
          </p>
          {savedMeals.length === 0 && (
            <div className="card py-10 text-center">
              <p className="text-3xl mb-2">📚</p>
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
                {m.notes && <p className="text-xs mt-1 italic" style={{ color: '#52525b' }}>{m.notes}</p>}
              </div>
              <button type="button" onClick={() => deleteSavedMeal(m.id)} className="tap mt-0.5" style={{ color: '#52525b' }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showSaveModal && <SaveMealModal onSave={saveMeal} onClose={() => setShowSaveModal(false)} />}

      </div>{/* end relative zIndex wrapper */}
    </div>
  );
}
