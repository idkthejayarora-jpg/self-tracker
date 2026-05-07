import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, BookMarked, ChevronLeft, ChevronRight, X, Save } from 'lucide-react';
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

const CALORIE_GOAL = 2000;

function MacroPill({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-lg font-bold" style={{ color }}>{Math.round(value)}</span>
      <span className="text-xs text-gray-500">{unit} {label}</span>
    </div>
  );
}

function AddEntryForm({
  onAdd,
  savedMeals,
  onClose,
}: {
  onAdd: (entry: Omit<FoodLog, 'id' | 'date'>) => void;
  savedMeals: SavedMeal[];
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<MealType>('snack');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [selectedSaved, setSelectedSaved] = useState<number | null>(null);

  function fillFromSaved(meal: SavedMeal) {
    setName(meal.name);
    setCalories(String(meal.calories));
    setProtein(String(meal.protein_g));
    setCarbs(String(meal.carbs_g));
    setFat(String(meal.fat_g));
    setSelectedSaved(meal.id);
  }

  function submit() {
    if (!name.trim()) return;
    onAdd({
      meal_type: mealType,
      name: name.trim(),
      calories: Number(calories) || 0,
      protein_g: Number(protein) || 0,
      carbs_g: Number(carbs) || 0,
      fat_g: Number(fat) || 0,
      saved_meal_id: selectedSaved,
    });
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Add food</span>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={15} /></button>
      </div>

      {/* Quick-fill from saved meals */}
      {savedMeals.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Quick-add from saved meals</p>
          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
            {savedMeals.map(m => (
              <button key={m.id} onClick={() => fillFromSaved(m)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selectedSaved === m.id ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-700 text-gray-300 hover:border-brand-500'}`}>
                {m.name} · {m.calories} kcal
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5">
        {MEAL_TYPES.map(t => (
          <button key={t} onClick={() => setMealType(t)}
            className={`py-1.5 text-xs rounded-lg border capitalize transition-colors ${mealType === t ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}>
            {MEAL_EMOJI[t]} {t}
          </button>
        ))}
      </div>

      <input value={name} onChange={e => { setName(e.target.value); setSelectedSaved(null); }}
        placeholder="Food name"
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500" />

      <div className="grid grid-cols-4 gap-2">
        {[
          { val: calories, set: setCalories, label: 'kcal' },
          { val: protein,  set: setProtein,  label: 'protein g' },
          { val: carbs,    set: setCarbs,    label: 'carbs g' },
          { val: fat,      set: setFat,      label: 'fat g' },
        ].map(({ val, set, label }) => (
          <div key={label}>
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <input type="number" min={0} value={val} onChange={e => set(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        ))}
      </div>

      <button onClick={submit} disabled={!name.trim()}
        className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors">
        Add to log
      </button>
    </div>
  );
}

function SaveMealModal({ onSave, onClose }: { onSave: (m: Omit<SavedMeal, 'id'>) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">Save meal template</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Meal name (e.g. Protein shake)"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <div className="grid grid-cols-4 gap-2">
          {[
            { val: calories, set: setCalories, label: 'kcal' },
            { val: protein,  set: setProtein,  label: 'protein g' },
            { val: carbs,    set: setCarbs,    label: 'carbs g' },
            { val: fat,      set: setFat,      label: 'fat g' },
          ].map(({ val, set, label }) => (
            <div key={label}>
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <input type="number" min={0} value={val} onChange={e => set(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          ))}
        </div>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <button onClick={() => { if (name.trim()) onSave({ name: name.trim(), calories: Number(calories)||0, protein_g: Number(protein)||0, carbs_g: Number(carbs)||0, fat_g: Number(fat)||0, notes }); }}
          disabled={!name.trim()}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
          <Save size={14} /> Save meal
        </button>
      </div>
    </div>
  );
}

export default function Diet() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [log, setLog] = useState<FoodLog[]>([]);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'log' | 'meals'>('log');

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

  async function addEntry(entry: Omit<FoodLog, 'id' | 'date'>) {
    await api.post('/diet/log', { ...entry, date });
    loadLog(date);
    setShowAdd(false);
  }

  async function deleteEntry(id: number) {
    await api.delete(`/diet/log/${id}`);
    setLog(prev => prev.filter(e => e.id !== id));
  }

  async function saveMeal(meal: Omit<SavedMeal, 'id'>) {
    await api.post('/diet/meals', meal);
    loadSavedMeals();
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
  const calPct = Math.min(100, Math.round((totals.cal / CALORIE_GOAL) * 100));
  const calColor = calPct > 110 ? '#f43f5e' : calPct > 85 ? '#22c55e' : '#f59e0b';

  const byMealType = MEAL_TYPES.reduce<Record<string, FoodLog[]>>((acc, t) => {
    acc[t] = log.filter(e => e.meal_type === t);
    return acc;
  }, {} as Record<string, FoodLog[]>);

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Diet</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors">
            <BookMarked size={13} /> Save meal
          </button>
          <button onClick={() => setActiveTab(t => t === 'log' ? 'meals' : 'log')}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors">
            {activeTab === 'log' ? '📚 Saved meals' : '📋 Daily log'}
          </button>
        </div>
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-3">
        <button onClick={() => goDay(-1)} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <p className="text-white font-medium">{format(parseISO(date), 'EEE, d MMM yyyy')}</p>
          {isToday && <span className="text-xs text-brand-400">Today</span>}
        </div>
        <button onClick={() => goDay(1)} disabled={isToday}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-300 transition-colors">
          <ChevronRight size={18} />
        </button>
        {!isToday && (
          <button onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            className="text-xs text-brand-400 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors">
            Today
          </button>
        )}
      </div>

      {activeTab === 'log' ? (
        <>
          {/* Daily summary card */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-2xl font-bold" style={{ color: calColor }}>{Math.round(totals.cal)}</p>
                <p className="text-xs text-gray-500">/ {CALORIE_GOAL} kcal goal</p>
              </div>
              <div className="flex gap-5">
                <MacroPill label="protein" value={totals.p} unit="g" color="#60a5fa" />
                <MacroPill label="carbs"   value={totals.c} unit="g" color="#34d399" />
                <MacroPill label="fat"     value={totals.f} unit="g" color="#fbbf24" />
              </div>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${calPct}%`, backgroundColor: calColor }} />
            </div>
            <p className="text-xs text-gray-600 mt-1">{calPct}% of daily goal</p>
          </div>

          {/* Add entry */}
          <button onClick={() => setShowAdd(s => !s)}
            className="flex items-center gap-2 text-sm bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
            <Plus size={15} /> Add food
          </button>

          {showAdd && (
            <AddEntryForm onAdd={addEntry} savedMeals={savedMeals} onClose={() => setShowAdd(false)} />
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
                  <span className="text-sm font-semibold text-gray-300 capitalize">{mt}</span>
                  <span className="text-xs text-gray-500 ml-auto">{Math.round(subtotal)} kcal</span>
                </div>
                {entries.map(e => (
                  <div key={e.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{e.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {e.calories} kcal
                        {e.protein_g > 0 && ` · ${e.protein_g}g P`}
                        {e.carbs_g > 0 && ` · ${e.carbs_g}g C`}
                        {e.fat_g > 0 && ` · ${e.fat_g}g F`}
                      </p>
                    </div>
                    <button onClick={() => deleteEntry(e.id)} className="text-gray-700 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}

          {log.length === 0 && !showAdd && (
            <div className="text-center py-12 text-gray-600">
              <p className="text-3xl mb-2">🥗</p>
              <p className="text-sm">Nothing logged yet for this day</p>
              <button onClick={() => setShowAdd(true)} className="mt-3 text-xs text-brand-400 hover:text-brand-300">
                + Add your first meal
              </button>
            </div>
          )}
        </>
      ) : (
        /* Saved meals library */
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Saved meals let you quickly add common foods. Use the
            <span className="text-brand-400"> Save meal</span> button to add new ones.
          </p>
          {savedMeals.length === 0 && (
            <div className="text-center py-10 text-gray-600">
              <p className="text-3xl mb-2">📚</p>
              <p className="text-sm">No saved meals yet</p>
            </div>
          )}
          {savedMeals.map(m => (
            <div key={m.id} className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{m.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {m.calories} kcal
                  {m.protein_g > 0 && ` · ${m.protein_g}g protein`}
                  {m.carbs_g > 0 && ` · ${m.carbs_g}g carbs`}
                  {m.fat_g > 0 && ` · ${m.fat_g}g fat`}
                </p>
                {m.notes && <p className="text-xs text-gray-600 mt-1 italic">{m.notes}</p>}
              </div>
              <button onClick={() => deleteSavedMeal(m.id)} className="text-gray-700 hover:text-red-400 transition-colors mt-0.5">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showSaveModal && <SaveMealModal onSave={saveMeal} onClose={() => setShowSaveModal(false)} />}
    </div>
  );
}
