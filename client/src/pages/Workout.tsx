import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, TrendingUp, AlertCircle, Pencil, X, Zap, FileText, Dumbbell, CheckCircle2, Circle, RotateCcw, ArrowLeftRight } from 'lucide-react';
import PaperBanner from '../components/PaperBanner';
import WorkoutAvatar from '../components/WorkoutAvatar';
import { format, parseISO } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';

const CATEGORIES = ['push', 'pull', 'legs', 'cardio', 'core', 'other'] as const;
type Category = typeof CATEGORIES[number];

// Ember palette per category — no cool hues anywhere
const CAT_HEX: Record<Category, string> = {
  push: '#d97757',   // terracotta
  pull: '#b5764f',   // sienna
  legs: '#cf8a3e',   // ochre
  cardio: '#b3372e', // brick
  core: '#d9a066',   // kraft gold
  other: '#a5a293',  // stone
};
const catChip = (cat: Category): React.CSSProperties => ({
  color: CAT_HEX[cat],
  background: `${CAT_HEX[cat]}16`,
  border: `1px solid ${CAT_HEX[cat]}35`,
});

// Warm ember palette for colour-coding plan days
const PLAN_COLORS = ['#d97757','#c2553d','#e08b4e','#d9a066','#cf8a3e','#b5764f','#b3372e','#e8a87c','#a97e5f','#a5a293'];

interface PlanExercise { id: number; day_id: number; name: string; sets: number; reps: string; weight: string; notes: string; }
interface PlanDay { id: number; name: string; icon: string; color: string; exercises: PlanExercise[]; }

interface ParsedExercise { name: string; sets: number; reps: string; weight: string; }
interface ParsedDay { name: string; icon: string; color: string; exercises: ParsedExercise[]; }

interface TodayExercise { id: number; name: string; sets: number; reps: string; weight: string; done: boolean; }
interface TodayDay { id: number; name: string; icon: string; color: string; exercises: TodayExercise[]; }
interface TodayData {
  hasPlan: boolean;
  sessionId: number | null;
  rotation?: { index: number; total: number };
  allDays?: { id: number; name: string; icon: string; color: string }[];
  day?: TodayDay;
}

interface Exercise { id: number; name: string; category: Category; }
interface WorkoutSet { id: number; session_id: number; exercise_id: number; exercise_name: string; category: Category; reps: number | null; weight: number | null; duration_seconds: number | null; }
interface Session { id: number; date: string; name: string | null; notes: string | null; exercise_count: number; set_count: number; }
interface ProgressPoint { date: string; max_weight: number; total_reps: number; }

function ExerciseProgress({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const [data, setData] = useState<ProgressPoint[]>([]);
  useEffect(() => {
    api.get<ProgressPoint[]>(`/workout/exercises/${exercise.id}/progress`).then(r => setData(r.data));
  }, [exercise.id]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="rounded-2xl p-5 w-full max-w-lg paper-in"
        style={{ background: 'var(--s2)', border: '1px solid var(--bh)', boxShadow: '0 24px 64px rgba(0,0,0,0.45)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-head">{exercise.name} — Progress</h3>
          <button type="button" onClick={onClose} className="text-xl tap" style={{ color: 'var(--t-faint)' }}>×</button>
        </div>
        {data.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: 'var(--t-faint)' }}>No weight data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3d3935" />
              <XAxis dataKey="date" tick={{ fill: '#84816f', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: '#84816f', fontSize: 11 }} unit=" kg" />
              <Tooltip contentStyle={{ backgroundColor: '#232120', border: '1px solid #3d3935', borderRadius: 8 }}
                formatter={(v) => [`${v} kg`, 'Max weight']} />
              <Line type="monotone" dataKey="max_weight" stroke="#d9a066" strokeWidth={2} dot={{ fill: '#d9a066', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── Exercise search combobox ──────────────────────────────────────────────────
// Works like the nutrition entry box: focus → browse the full gym catalog
// grouped by muscle; type → ranked search. Picking a catalog entry creates it
// in your library automatically.
interface SearchHit { id: number | null; name: string; category: Category; muscle: string; mine: boolean }

function ExerciseSearchBox({ onSelect, selectedName, onClear }: {
  onSelect: (ex: { id: number; name: string }) => void;
  selectedName: string | null;
  onClear: () => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.get<SearchHit[]>(`/workout/exercise-search?q=${encodeURIComponent(q)}`);
        setHits(r.data);
      } catch { setHits([]); }
    }, 160);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function pick(hit: SearchHit) {
    if (busy) return;
    if (hit.mine && hit.id != null) {
      onSelect({ id: hit.id, name: hit.name });
      setOpen(false); setQ('');
      return;
    }
    // Catalog pick → add to the user's library first
    setBusy(true);
    try {
      const r = await api.post('/workout/exercises', { name: hit.name, category: hit.category });
      onSelect({ id: r.data.id, name: r.data.name });
      setOpen(false); setQ('');
    } catch { /* leave the box open so they can retry */ }
    setBusy(false);
  }

  if (selectedName) {
    return (
      <div className="flex items-center gap-2 w-full rounded-xl px-2 py-1.5"
        style={{ background: 'var(--s1)', border: '1px solid rgb(var(--accent-rgb) / 0.35)' }}>
        <span className="text-sm flex-1 truncate" style={{ color: 'var(--t-body)' }}>{selectedName}</span>
        <button type="button" onClick={onClear} className="text-sm px-1 tap" style={{ color: 'var(--t-faint)' }}>×</button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Tap to browse all exercises, or type to search…"
        className="w-full rounded-xl px-2 py-1.5 text-sm focus:outline-none"
        style={{ background: 'var(--s1)', border: '1px solid var(--b)', color: 'var(--t-body)' }}
      />
      {open && hits.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg overflow-hidden max-h-72 overflow-y-auto"
          style={{ background: 'var(--s2)', border: '1px solid var(--bh)', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}>
          {hits.map((h, i) => {
            // Browse mode (no query): sticky muscle-group headers
            const newGroup = !q.trim() && (i === 0 || hits[i - 1].muscle !== h.muscle);
            return (
              <div key={`${h.name}-${i}`}>
                {newGroup && (
                  <p className="sticky top-0 px-3 py-1.5 text-[9px] font-black tracking-[0.18em] uppercase"
                    style={{ background: 'var(--s3)', color: 'var(--t-faint)', borderBottom: '1px solid var(--b)' }}>
                    {h.muscle}
                  </p>
                )}
                <button type="button" onClick={() => pick(h)} disabled={busy}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5 disabled:opacity-50"
                  style={{ color: 'var(--t-body)', borderTop: i && !newGroup ? '1px solid var(--b)' : 'none' }}>
                  <span className="flex-1 truncate">{h.name}</span>
                  <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full shrink-0"
                    style={{
                      color: h.mine ? '#cf8a3e' : 'var(--t-faint)',
                      background: h.mine ? '#cf8a3e14' : 'var(--s3)',
                      border: `1px solid ${h.mine ? '#cf8a3e30' : 'var(--b)'}`,
                    }}>
                    {h.mine ? 'yours' : h.muscle}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Swap picker ─────────────────────────────────────────────────────────────
// Replace a plan exercise with a variation from the built-in catalog (browse
// by muscle group, or search). Catalog only — never the user's ad-hoc list.
function SwapExercisePicker({ current, accent, onPick, onClose }: {
  current: string; accent: string; onPick: (name: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.get<SearchHit[]>(`/workout/exercise-search?catalogOnly=1&q=${encodeURIComponent(q)}`);
        setHits(r.data);
      } catch { setHits([]); }
    }, 140);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div className="rounded-t-2xl sm:rounded-2xl w-full max-w-lg paper-in flex flex-col"
        style={{ background: 'var(--s2)', border: '1px solid var(--bh)', boxShadow: '0 24px 64px rgba(0,0,0,0.45)', maxHeight: '82vh' }}
        onClick={e => e.stopPropagation()}>
        {/* Header + search */}
        <div className="px-4 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--b)' }}>
          <div className="flex items-start justify-between mb-2.5 gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.16em] uppercase" style={{ color: 'var(--t-faint)' }}>Swap exercise</p>
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--t-head)' }}>
                Replacing <span style={{ color: accent }}>{current}</span>
              </p>
            </div>
            <button onClick={onClose} className="tap p-1 shrink-0" style={{ color: 'var(--t-faint)' }}><X size={17} /></button>
          </div>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search the library, or browse by muscle…"
            className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--s1)', border: '1px solid var(--b)', color: 'var(--t-body)' }} />
        </div>
        {/* Results */}
        <div className="overflow-y-auto">
          {hits.map((h, i) => {
            const newGroup = !q.trim() && (i === 0 || hits[i - 1].muscle !== h.muscle);
            const isCurrent = h.name.toLowerCase() === current.toLowerCase();
            return (
              <div key={`${h.name}-${i}`}>
                {newGroup && (
                  <p className="sticky top-0 px-4 py-1.5 text-[9px] font-black tracking-[0.18em] uppercase"
                    style={{ background: 'var(--s3)', color: 'var(--t-faint)', borderBottom: '1px solid var(--b)' }}>
                    {h.muscle}
                  </p>
                )}
                <button onClick={() => onPick(h.name)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm tap"
                  style={{ color: 'var(--t-body)', borderTop: i && !newGroup ? '1px solid var(--b)' : 'none', background: isCurrent ? `${accent}12` : 'transparent' }}>
                  <span className="flex-1 truncate">{h.name}</span>
                  {isCurrent && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: `${accent}22`, color: accent }}>current</span>
                  )}
                  {q.trim() && <span className="text-[9px] uppercase tracking-wider shrink-0" style={{ color: 'var(--t-faint)' }}>{h.muscle}</span>}
                </button>
              </div>
            );
          })}
          {hits.length === 0 && (
            <p className="text-xs text-center py-10" style={{ color: 'var(--t-faint)' }}>No matches in the library</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Inline weight editor — type a new number, it carries forward to next time.
function WeightField({ value, color, onSave }: { value: string; color: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <div className="flex items-center gap-1 shrink-0">
      <input
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={() => { if (v.trim() !== (value || '').trim()) onSave(v.trim()); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        onClick={e => e.stopPropagation()}
        inputMode="decimal"
        placeholder="—"
        className="w-12 text-center rounded-lg px-1 py-1 text-sm font-semibold focus:outline-none focus:ring-1"
        style={{ background: 'var(--s2)', border: `1px solid ${color}33`, color: 'var(--t-head)' }}
      />
      <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>kg</span>
    </div>
  );
}

export default function Workout() {
  const [tab, setTab] = useState<'today' | 'log' | 'plan' | 'exercises' | 'stats'>('today');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [expandedSession, setExpandedSession] = useState<number | null>(null);
  const [sessionSets, setSessionSets] = useState<Record<number, WorkoutSet[]>>({});
  const [progressEx, setProgressEx] = useState<Exercise | null>(null);

  // New session form
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionDate, setNewSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [newSessionName, setNewSessionName] = useState('');
  const [sessionErr, setSessionErr] = useState('');
  const [savingSession, setSavingSession] = useState(false);

  // New exercise form
  const [showNewExercise, setShowNewExercise] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExCat, setNewExCat] = useState<Category>('other');
  const [exerciseErr, setExerciseErr] = useState('');
  const [savingExercise, setSavingExercise] = useState(false);

  // Add set form
  const [addSetSession, setAddSetSession] = useState<number | null>(null);
  const [addSetExId, setAddSetExId] = useState('');
  const [addSetExName, setAddSetExName] = useState<string | null>(null);
  const [addSetReps, setAddSetReps] = useState('');
  const [addSetWeight, setAddSetWeight] = useState('');
  const [setErr, setSetErr] = useState('');
  const [savingSet, setSavingSet] = useState(false);

  const [stats, setStats] = useState<{ weekly: { week: string; sessions: number }[]; pbs: { name: string; category: string; max_weight: number; max_reps: number }[] } | null>(null);

  // Plan state
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [editingDayId, setEditingDayId] = useState<number | null>(null);
  const [showAddDay, setShowAddDay] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [pdfText, setPdfText] = useState('');
  const [parsedPlan, setParsedPlan] = useState<ParsedDay[]>([]);
  const [showPdfImport, setShowPdfImport] = useState(false);
  const [showRawText, setShowRawText] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [planCreateMsg, setPlanCreateMsg] = useState('');

  const fetchSessions = useCallback(async () => {
    const r = await api.get<Session[]>('/workout/sessions');
    setSessions(r.data);
  }, []);

  const fetchExercises = useCallback(async () => {
    const r = await api.get<Exercise[]>('/workout/exercises');
    setExercises(r.data);
  }, []);

  const loadPlan = useCallback(async () => {
    const r = await api.get<PlanDay[]>('/workout/plan/days');
    setPlanDays(r.data);
  }, []);

  async function patchDay(dayId: number, fields: { name?: string; color?: string }) {
    setPlanDays(d => d.map(x => x.id === dayId ? { ...x, ...fields } : x)); // optimistic
    try { await api.patch(`/workout/plan/days/${dayId}`, fields); await loadToday(); }
    catch { await loadPlan(); }
  }

  // Swap a plan exercise for a catalog variation
  const [swapEx, setSwapEx] = useState<{ id: number; name: string; dayId: number; color: string } | null>(null);
  async function doSwap(name: string) {
    if (!swapEx) return;
    const { id, dayId } = swapEx;
    setPlanDays(d => d.map(dd => dd.id === dayId ? { ...dd, exercises: dd.exercises.map(e => e.id === id ? { ...e, name } : e) } : dd));
    setSwapEx(null);
    try { await api.patch(`/workout/plan/exercises/${id}`, { name }); await loadToday(); }
    catch { await loadPlan(); }
  }

  // Today's rotation
  const [today, setToday] = useState<TodayData | null>(null);
  const loadToday = useCallback(async () => {
    const r = await api.get<TodayData>('/workout/today');
    setToday(r.data);
  }, []);

  useEffect(() => { fetchSessions(); fetchExercises(); loadPlan(); loadToday(); }, [fetchSessions, fetchExercises, loadPlan, loadToday]);
  useSync(fetchSessions, 60000);

  async function toggleToday(ex: TodayExercise) {
    if (!today?.day) return;
    const newDone = !ex.done;
    // optimistic
    setToday(t => (t && t.day) ? { ...t, day: { ...t.day, exercises: t.day.exercises.map(e => e.id === ex.id ? { ...e, done: newDone } : e) } } : t);
    try {
      await api.post('/workout/today/toggle', { dayId: today.day.id, planExerciseId: ex.id, done: newDone });
      await Promise.all([loadToday(), fetchSessions()]);
    } catch {
      await loadToday();
    }
  }

  async function saveTodayWeight(ex: TodayExercise, weight: string) {
    setToday(t => (t && t.day) ? { ...t, day: { ...t.day, exercises: t.day.exercises.map(e => e.id === ex.id ? { ...e, weight } : e) } } : t);
    try { await api.patch('/workout/today/weight', { planExerciseId: ex.id, weight }); }
    catch { await loadToday(); }
  }

  async function switchTodayDay(dayId: number) {
    if (today?.day?.id === dayId) return;
    try { await api.post('/workout/today/set-day', { dayId }); await Promise.all([loadToday(), fetchSessions()]); }
    catch { await loadToday(); }
  }

  useEffect(() => {
    if (tab === 'stats') api.get('/workout/stats').then(r => setStats(r.data));
  }, [tab]);

  async function expandSession(id: number) {
    if (expandedSession === id) { setExpandedSession(null); return; }
    setExpandedSession(id);
    if (!sessionSets[id]) {
      try {
        const r = await api.get<WorkoutSet[]>(`/workout/sessions/${id}/sets`);
        setSessionSets(prev => ({ ...prev, [id]: r.data }));
      } catch {
        setSessionSets(prev => ({ ...prev, [id]: [] }));
      }
    }
  }

  async function createSession() {
    setSavingSession(true);
    setSessionErr('');
    try {
      await api.post('/workout/sessions', { date: newSessionDate, name: newSessionName || undefined });
      setShowNewSession(false);
      setNewSessionName('');
      await fetchSessions();
    } catch (e: any) {
      setSessionErr(e?.response?.data?.error || e?.message || 'Failed to create session');
    } finally {
      setSavingSession(false);
    }
  }

  async function deleteSession(id: number) {
    try {
      await api.delete(`/workout/sessions/${id}`);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to delete session');
    }
  }

  async function createExercise() {
    if (!newExName.trim()) return;
    setSavingExercise(true);
    setExerciseErr('');
    try {
      await api.post('/workout/exercises', { name: newExName, category: newExCat });
      setShowNewExercise(false);
      setNewExName('');
      await fetchExercises();
    } catch (e: any) {
      setExerciseErr(e?.response?.data?.error || e?.message || 'Failed to add exercise');
    } finally {
      setSavingExercise(false);
    }
  }

  async function addSet(sessionId: number) {
    if (!addSetExId) return;
    setSavingSet(true);
    setSetErr('');
    try {
      await api.post(`/workout/sessions/${sessionId}/sets`, {
        exercise_id: Number(addSetExId),
        reps: addSetReps ? Number(addSetReps) : undefined,
        weight: addSetWeight ? Number(addSetWeight) : undefined,
      });
      const r = await api.get<WorkoutSet[]>(`/workout/sessions/${sessionId}/sets`);
      setSessionSets(prev => ({ ...prev, [sessionId]: r.data }));
      setAddSetExId(''); setAddSetExName(null); setAddSetReps(''); setAddSetWeight('');
      await fetchSessions();
    } catch (e: any) {
      setSetErr(e?.response?.data?.error || e?.message || 'Failed to log set');
    } finally {
      setSavingSet(false);
    }
  }

  async function deleteSet(sessionId: number, setId: number) {
    try {
      await api.delete(`/workout/sets/${setId}`);
      setSessionSets(prev => ({ ...prev, [sessionId]: prev[sessionId].filter(s => s.id !== setId) }));
    } catch {
      // silently ignore — set list will be stale but not user-blocking
    }
  }

  // ── Quick-log ────────────────────────────────────────────────────────────
  const [quickText, setQuickText] = useState('');
  const [quickLogging, setQuickLogging] = useState(false);
  const [quickResult, setQuickResult] = useState<{ preview: string; exercises: { name: string; sets: number; reps: string; weight: number | null }[]; cardioMinutes: number } | null>(null);
  const [quickErr, setQuickErr] = useState('');

  async function submitQuickLog() {
    if (!quickText.trim() || quickLogging) return;
    setQuickLogging(true);
    setQuickErr('');
    setQuickResult(null);
    try {
      const r = await api.post('/workout/quick-log', { text: quickText.trim() });
      setQuickResult(r.data);
      setQuickText('');
      await fetchSessions();
    } catch (e: any) {
      setQuickErr(e?.response?.data?.error || e?.message || 'Failed to log');
    } finally {
      setQuickLogging(false);
    }
  }

  const lastSession = sessions[0];
  const headerSubtitle = sessions.length === 0
    ? 'No sessions yet — log your first one below'
    : `${sessions.length} session${sessions.length > 1 ? 's' : ''} logged${lastSession ? ` · last on ${format(parseISO(lastSession.date), 'd MMM')}` : ''}`;

  return (
    <div className="max-w-3xl mx-auto space-y-7 paper-in"
      style={{ '--accent-rgb': '179 55 46' } as React.CSSProperties}>

      <PaperBanner
        title="Training"
        label="Strength Log"
        accent="#b3372e"
        subtitle={headerSubtitle}
        icon={Dumbbell}
      />

      <div>

      <div className="flex justify-end">
        {tab === 'log' && (
          <button type="button" onClick={() => { setShowNewSession(s => !s); setSessionErr(''); }}
            className="flex items-center gap-2 text-white px-3 py-2 rounded-xl text-sm font-bold tap"
            style={{ background: 'rgb(var(--accent-rgb))' }}>
            <Plus size={16} /> New session
          </button>
        )}
        {tab === 'exercises' && (
          <button type="button" onClick={() => { setShowNewExercise(s => !s); setExerciseErr(''); }}
            className="flex items-center gap-2 text-white px-3 py-2 rounded-xl text-sm font-bold tap"
            style={{ background: 'rgb(var(--accent-rgb))' }}>
            <Plus size={16} /> Add exercise
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['today', 'log', 'plan', 'exercises', 'stats'] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-xl text-sm font-medium tap capitalize"
            style={tab === t
              ? { background: 'rgb(var(--accent-rgb))', color: '#fff' }
              : { background: 'var(--s2)', color: 'var(--t-faint)', border: '1px solid var(--b)' }}>
            {t === 'today' ? 'Today' : t === 'log' ? 'History' : t === 'stats' ? 'Stats & PBs' : t === 'plan' ? 'My Plan' : 'Exercises'}
          </button>
        ))}
      </div>

      {/* ── TODAY TAB ── */}
      {tab === 'today' && (
        <div className="space-y-4">
          {!today && (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--t-faint)' }}>Loading today…</p>
          )}

          {today && !today.hasPlan && (
            <div className="card px-5 py-10 text-center space-y-3">
              <Dumbbell size={28} className="mx-auto" style={{ color: 'var(--t-faint)', opacity: 0.4 }} />
              <p className="text-sm font-semibold text-head">No plan set up yet</p>
              <p className="text-xs max-w-xs mx-auto" style={{ color: 'var(--t-faint)' }}>
                Build your split once (e.g. Push / Pull / Legs) and it'll cycle here automatically — just tick exercises off each day.
              </p>
              <button onClick={() => setTab('plan')}
                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold tap text-white"
                style={{ background: 'rgb(var(--accent-rgb))' }}>
                <Plus size={14} /> Set up my plan
              </button>
            </div>
          )}

          {today?.hasPlan && today.day && (() => {
            const day = today.day;
            const doneCount = day.exercises.filter(e => e.done).length;
            const total = day.exercises.length;
            const pct = total ? Math.round((doneCount / total) * 100) : 0;
            const allDone = total > 0 && doneCount === total;
            return (
              <div className="space-y-4">
                {/* Rotation switcher — manual override if the auto-pick is wrong */}
                {today.allDays && today.allDays.length > 1 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold tracking-[0.12em] uppercase" style={{ color: 'var(--t-faint)' }}>
                      Not your day? Tap to switch
                    </p>
                    <div className="flex gap-1.5 flex-wrap items-center">
                      {today.allDays.map(d => (
                        <button key={d.id} onClick={() => switchTodayDay(d.id)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold tap transition-all"
                          style={d.id === day.id
                            ? { background: `${d.color}22`, color: d.color, border: `1px solid ${d.color}55` }
                            : { background: 'var(--s2)', color: 'var(--t-faint)', border: '1px solid var(--b)' }}>
                          {d.icon} {d.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Today's day card */}
                <div className="card overflow-hidden" style={{ borderLeft: `3px solid ${day.color}` }}>
                  {/* Header */}
                  <div className="px-4 pt-4 pb-3" style={{ background: `${day.color}0c` }}>
                    <div className="flex items-center gap-3">
                      <span className="text-3xl leading-none">{day.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black tracking-[0.18em] uppercase" style={{ color: day.color }}>
                            Today's session
                          </span>
                          {today.rotation && today.rotation.total > 1 && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                              style={{ background: 'var(--s3)', color: 'var(--t-faint)' }}>
                              {today.rotation.index + 1}/{today.rotation.total}
                            </span>
                          )}
                        </div>
                        <h3 className="text-xl font-bold leading-tight" style={{ color: 'var(--t-head)', fontFamily: "'Lora', Georgia, serif" }}>
                          {day.name}
                        </h3>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-black leading-none" style={{ color: allDone ? '#cf8a3e' : day.color }}>{doneCount}<span className="text-sm" style={{ color: 'var(--t-faint)' }}>/{total}</span></p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--t-faint)' }}>done</p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-3 h-1.5 rounded-full" style={{ background: 'var(--s3)' }}>
                      <div className="h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: allDone ? '#cf8a3e' : day.color }} />
                    </div>
                  </div>

                  {/* Exercise checklist */}
                  <div className="divide-y" style={{ borderColor: 'var(--b)' }}>
                    {day.exercises.length === 0 && (
                      <p className="text-xs px-4 py-6 text-center" style={{ color: 'var(--t-faint)' }}>
                        No exercises on this day yet — add them in My Plan.
                      </p>
                    )}
                    {day.exercises.map(ex => (
                      <div key={ex.id} className="flex items-center gap-3 px-4 py-3 tap"
                        onClick={() => toggleToday(ex)}
                        style={{ opacity: ex.done ? 0.65 : 1, transition: 'opacity 0.2s' }}>
                        {ex.done
                          ? <CheckCircle2 size={22} className="shrink-0" style={{ color: '#cf8a3e' }} />
                          : <Circle size={22} className="shrink-0" style={{ color: 'var(--t-faint)' }} />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate"
                            style={{ color: 'var(--t-head)', textDecoration: ex.done ? 'line-through' : 'none' }}>
                            {ex.name}
                          </p>
                          <p className="text-[11px]" style={{ color: 'var(--t-faint)' }}>
                            {ex.sets} sets × {ex.reps} reps
                          </p>
                        </div>
                        <WeightField value={ex.weight || ''} color={day.color} onSave={w => saveTodayWeight(ex, w)} />
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  {allDone && (
                    <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#cf8a3e10', borderTop: '1px solid #cf8a3e2a' }}>
                      <CheckCircle2 size={15} style={{ color: '#cf8a3e' }} />
                      <span className="text-xs font-semibold" style={{ color: '#cf8a3e' }}>
                        Session complete — logged & saved. Tomorrow rolls to the next day.
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-center flex items-center justify-center gap-1.5" style={{ color: 'var(--t-faint)' }}>
                  <RotateCcw size={11} /> Bump a weight to carry it forward next time
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── LOG TAB ── */}
      {tab === 'log' && (
        <div className="space-y-3">
          {showNewSession && (
            <div className="rounded-2xl p-4 space-y-3 paper-in"
              style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--t-faint)' }}>Date</label>
                  <input type="date" value={newSessionDate} onChange={e => setNewSessionDate(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                    style={{ background: 'var(--s2)', border: '1px solid var(--b)', color: 'var(--t-body)' }} />
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--t-faint)' }}>Name (optional)</label>
                  <input placeholder="e.g. Push day" value={newSessionName} onChange={e => setNewSessionName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createSession()}
                    className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                    style={{ background: 'var(--s2)', border: '1px solid var(--b)', color: 'var(--t-body)' }} />
                </div>
              </div>
              {sessionErr && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgb(239 68 68 / 0.1)', color: '#e07b62' }}>
                  <AlertCircle size={13} />{sessionErr}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setShowNewSession(false); setSessionErr(''); }}
                  className="px-3 py-1.5 text-sm tap" style={{ color: 'var(--t-faint)' }}>Cancel</button>
                <button type="button" onClick={createSession} disabled={savingSession}
                  className="px-4 py-1.5 disabled:opacity-50 text-white text-sm rounded-xl font-bold tap"
                  style={{ background: 'rgb(var(--accent-rgb))' }}>
                  {savingSession ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          )}

          {/* Quick-log panel */}
          <div className="card px-4 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <Zap size={11} style={{ color: '#cf8a3e' }} />
              <span className="text-[10px] font-bold tracking-[0.16em] uppercase" style={{ color: 'var(--t-faint)' }}>Quick log</span>
              <span className="text-[11px]" style={{ color: 'var(--t-faint)', opacity: 0.7 }}>— describe it, I'll sort the sets</span>
            </div>
            <textarea
              rows={2}
              value={quickText}
              onChange={e => { setQuickText(e.target.value); setQuickResult(null); setQuickErr(''); }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitQuickLog(); }}
              placeholder="e.g. chest day, bench 4x8 80kg, cable flies 3x12, 20 min cardio"
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none"
              style={{ background: 'var(--s2)', color: 'var(--t-body)', border: '1px solid var(--b)' }}
            />
            {quickErr && (
              <p className="text-xs" style={{ color: '#e07b62' }}>{quickErr}</p>
            )}
            {quickResult && (
              <div className="rounded-xl px-3 py-3 space-y-2 paper-in"
                style={{ background: '#cf8a3e10', border: '1px solid #cf8a3e2a' }}>
                <p className="text-xs font-semibold" style={{ color: '#cf8a3e' }}>{quickResult.preview}</p>
                <div className="flex flex-wrap gap-1.5">
                  {quickResult.exercises.map((ex, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>
                      {ex.name} {ex.sets}×{ex.reps}{ex.weight ? ` @ ${ex.weight}kg` : ''}
                    </span>
                  ))}
                  {quickResult.cardioMinutes > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--s3)', color: '#cd5240' }}>
                      {quickResult.cardioMinutes}min cardio
                    </span>
                  )}
                </div>
                <p className="text-[10px]" style={{ color: 'var(--t-faint)' }}>Session logged ✓ — scroll down to see it</p>
              </div>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={submitQuickLog} disabled={!quickText.trim() || quickLogging}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold tap disabled:opacity-40 text-white"
                style={{ background: 'rgb(var(--accent-rgb))' }}>
                <Zap size={13} />{quickLogging ? 'Logging...' : 'Log it'}
              </button>
            </div>
          </div>

          {sessions.length === 0 && <p className="text-sm py-8 text-center" style={{ color: 'var(--t-faint)' }}>No sessions yet. Add your first workout!</p>}

          {sessions.map(session => {
            const isExpanded = expandedSession === session.id;
            const sets = sessionSets[session.id] || [];
            return (
              <div key={session.id} className="card rounded-2xl overflow-hidden"
                style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => expandSession(session.id)}>
                  <div className="flex-1">
                    <p className="font-medium text-head text-sm">{session.name || format(parseISO(session.date), 'EEEE, d MMM')}</p>
                    {session.name && <p className="text-xs" style={{ color: 'var(--t-faint)' }}>{format(parseISO(session.date), 'd MMM yyyy')}</p>}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--t-faint)' }}>{session.exercise_count} exercises · {session.set_count} sets</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={e => { e.stopPropagation(); deleteSession(session.id); }}
                      className="p-1 tap" style={{ color: 'var(--t-faint)' }}>
                      <Trash2 size={15} />
                    </button>
                    {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--t-faint)' }} /> : <ChevronDown size={16} style={{ color: 'var(--t-faint)' }} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-3 space-y-3" style={{ borderTop: '1px solid var(--b)' }}>
                    {sets.length === 0 && <p className="text-xs" style={{ color: 'var(--t-faint)' }}>No sets logged yet.</p>}

                    {/* Group sets by exercise */}
                    {Object.entries(sets.reduce((acc, s) => {
                      const k = `${s.exercise_id}__${s.exercise_name}__${s.category}`;
                      if (!acc[k]) acc[k] = [];
                      acc[k].push(s);
                      return acc;
                    }, {} as Record<string, WorkoutSet[]>)).map(([key, exSets]) => {
                      const [, exName, cat] = key.split('__');
                      return (
                        <div key={key}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={catChip(cat as Category)}>{cat}</span>
                            <span className="text-sm font-medium" style={{ color: 'var(--t-body)' }}>{exName}</span>
                          </div>
                          <div className="space-y-1 pl-2">
                            {exSets.map((s, i) => (
                              <div key={s.id} className="flex items-center gap-3 text-xs" style={{ color: 'var(--t-muted)' }}>
                                <span className="w-4" style={{ color: 'var(--t-faint)' }}>#{i + 1}</span>
                                {s.reps && <span>{s.reps} reps</span>}
                                {s.weight && <span className="font-medium" style={{ color: '#cf8a3e' }}>{s.weight} kg</span>}
                                {s.duration_seconds && <span>{s.duration_seconds}s</span>}
                                <button type="button" onClick={() => deleteSet(session.id, s.id)} className="ml-auto tap" style={{ color: 'var(--t-faint)' }}>×</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {/* Add set form */}
                    {addSetSession === session.id ? (
                      <div className="rounded-xl p-3 space-y-2 mt-2 paper-in"
                        style={{ background: 'var(--s2)', border: '1px solid var(--b)' }}>
                        <ExerciseSearchBox
                          selectedName={addSetExName}
                          onClear={() => { setAddSetExId(''); setAddSetExName(null); }}
                          onSelect={ex => { setAddSetExId(String(ex.id)); setAddSetExName(ex.name); void fetchExercises(); }}
                        />
                        <div className="flex gap-2">
                          <input placeholder="Reps" type="number" value={addSetReps} onChange={e => setAddSetReps(e.target.value)}
                            className="w-full rounded-xl px-2 py-1.5 text-sm focus:outline-none"
                            style={{ background: 'var(--s1)', border: '1px solid var(--b)', color: 'var(--t-body)' }} />
                          <input placeholder="Weight (kg)" type="number" step="0.5" value={addSetWeight} onChange={e => setAddSetWeight(e.target.value)}
                            className="w-full rounded-xl px-2 py-1.5 text-sm focus:outline-none"
                            style={{ background: 'var(--s1)', border: '1px solid var(--b)', color: 'var(--t-body)' }} />
                        </div>
                        {setErr && (
                          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#e07b62' }}>
                            <AlertCircle size={12} />{setErr}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button type="button" onClick={() => { setAddSetSession(null); setSetErr(''); }}
                            className="text-xs px-2 tap" style={{ color: 'var(--t-faint)' }}>Cancel</button>
                          <button type="button" onClick={() => addSet(session.id)} disabled={!addSetExId || savingSet}
                            className="flex-1 text-xs disabled:opacity-50 text-white py-1.5 rounded-xl font-bold tap"
                            style={{ background: 'rgb(var(--accent-rgb))' }}>
                            {savingSet ? 'Logging...' : 'Log set'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => { setAddSetSession(session.id); setSetErr(''); }}
                        className="flex items-center gap-1.5 text-xs tap mt-1" style={{ color: '#cf8a3e' }}>
                        <Plus size={13} /> Add set
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── PLAN TAB ── */}
      {tab === 'plan' && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowAddDay(s => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold tap"
              style={{ background: 'rgb(var(--accent-rgb)/0.12)', color: 'rgb(var(--accent-rgb-light))' }}>
              <Plus size={12} /> Add day
            </button>
            <button onClick={() => setShowPdfImport(s => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold tap"
              style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>
              <FileText size={12} /> Import PDF
            </button>
          </div>

          {/* PDF import panel */}
          {showPdfImport && (
            <div className="glass rounded-2xl px-4 py-4 space-y-3 scale-in">
              <p className="text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--t-faint)' }}>Upload workout plan (PDF)</p>

              <input type="file" accept=".pdf"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setPlanLoading(true);
                  setParsedPlan([]);
                  setPdfText('');
                  setPlanCreateMsg('');
                  setShowRawText(false);
                  const fd = new FormData();
                  fd.append('pdf', file);
                  try {
                    const r = await api.post<{ text: string; plan: ParsedDay[] }>(
                      '/workout/plan/parse-pdf', fd,
                      { headers: { 'Content-Type': 'multipart/form-data' } }
                    );
                    setPdfText(r.data.text || '');
                    setParsedPlan(r.data.plan || []);
                  } catch {
                    setPdfText('Failed to parse PDF.');
                  }
                  setPlanLoading(false);
                }}
                className="w-full text-xs" style={{ color: 'var(--t-muted)' }} />

              {planLoading && (
                <p className="text-xs animate-pulse" style={{ color: 'var(--t-faint)' }}>Reading the plan…</p>
              )}

              {/* Parsed plan preview */}
              {parsedPlan.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold" style={{ color: 'var(--t-muted)' }}>
                      ✓ Found {parsedPlan.length} training day{parsedPlan.length !== 1 ? 's' : ''}
                    </p>
                    {planCreateMsg && (
                      <span className="text-[11px] font-semibold" style={{ color: '#cf8a3e' }}>{planCreateMsg}</span>
                    )}
                  </div>

                  {/* Day preview cards */}
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {parsedPlan.map((day, i) => (
                      <div key={i} className="rounded-xl px-3 py-2.5"
                        style={{ background: 'var(--s3)', borderLeft: `3px solid ${day.color}` }}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span>{day.icon}</span>
                          <span className="text-sm font-bold" style={{ color: 'var(--t-head)' }}>{day.name}</span>
                          <span className="text-[10px] ml-auto" style={{ color: 'var(--t-faint)' }}>
                            {day.exercises.length} exercises
                          </span>
                        </div>
                        <div className="space-y-0.5 pl-1">
                          {day.exercises.map((ex, j) => (
                            <div key={j} className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--t-muted)' }}>
                              <span className="flex-1">{ex.name}</span>
                              <span className="font-mono px-1 rounded"
                                style={{ background: `${day.color}18`, color: day.color }}>
                                {ex.sets}×{ex.reps}
                              </span>
                              {ex.weight && <span style={{ color: 'var(--t-faint)' }}>{ex.weight}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Create plan button */}
                  <button
                    onClick={async () => {
                      setCreatingPlan(true);
                      setPlanCreateMsg('');
                      try {
                        for (const day of parsedPlan) {
                          const dr = await api.post<PlanDay>('/workout/plan/days', {
                            name: day.name, icon: day.icon, color: day.color,
                          });
                          const dayId = dr.data.id;
                          for (const ex of day.exercises) {
                            await api.post(`/workout/plan/days/${dayId}/exercises`, {
                              name: ex.name,
                              sets: ex.sets,
                              reps: ex.reps,
                              weight: ex.weight || '',
                            });
                          }
                        }
                        setPlanCreateMsg(`✓ Plan created (${parsedPlan.length} days)`);
                        await loadPlan();
                        setTimeout(() => {
                          setShowPdfImport(false);
                          setParsedPlan([]);
                          setPdfText('');
                          setPlanCreateMsg('');
                        }, 1800);
                      } catch {
                        setPlanCreateMsg('✗ Error creating plan');
                      }
                      setCreatingPlan(false);
                    }}
                    disabled={creatingPlan}
                    className="w-full py-2.5 rounded-xl text-sm font-bold tap text-white disabled:opacity-50"
                    style={{ background: 'rgb(var(--accent-rgb))' }}>
                    {creatingPlan ? 'Creating plan...' : `Create this plan (${parsedPlan.length} days)`}
                  </button>

                  {/* Raw text toggle */}
                  {pdfText && (
                    <button onClick={() => setShowRawText(s => !s)}
                      className="text-[11px] tap" style={{ color: 'var(--t-faint)' }}>
                      {showRawText ? '▲ Hide raw text' : '▼ Show raw text'}
                    </button>
                  )}
                  {showRawText && (
                    <textarea value={pdfText} onChange={e => setPdfText(e.target.value)}
                      rows={8} className="w-full rounded-xl px-3 py-2 text-xs font-mono resize-y"
                      style={{ background: 'var(--s1)', border: '1px solid var(--b)', color: 'var(--t-body)' }} />
                  )}
                </div>
              )}

              {/* No days parsed but text available */}
              {!planLoading && parsedPlan.length === 0 && pdfText && (
                <div className="space-y-2">
                  <p className="text-[11px]" style={{ color: '#e07b62' }}>
                    ⚠ Couldn't auto-detect training days. Review the text below and add days manually.
                  </p>
                  <textarea value={pdfText} onChange={e => setPdfText(e.target.value)}
                    rows={10} className="w-full rounded-xl px-3 py-2 text-xs font-mono resize-y"
                    style={{ background: 'var(--s1)', border: '1px solid var(--b)', color: 'var(--t-body)' }} />
                </div>
              )}

              <button onClick={() => { setShowPdfImport(false); setParsedPlan([]); setPdfText(''); setPlanCreateMsg(''); }}
                className="text-xs tap" style={{ color: 'var(--t-faint)' }}>Close</button>
            </div>
          )}

          {/* Add day form */}
          {showAddDay && (
            <form onSubmit={async e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const r = await api.post<PlanDay>('/workout/plan/days', { name: fd.get('name'), icon: '', color: fd.get('color') || '#d97757' });
              setPlanDays(d => [...d, r.data]);
              (e.target as HTMLFormElement).reset();
              setShowAddDay(false);
            }} className="glass rounded-2xl px-4 py-3 space-y-2 scale-in">
              <div className="flex gap-2">
                <input name="name" required placeholder="Day name (e.g. Back Day)"
                  className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
                  style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px]" style={{ color: 'var(--t-faint)' }}>Color:</label>
                <input name="color" type="color" defaultValue="#d97757" className="w-8 h-7 rounded cursor-pointer border-0" />
                <button type="submit" className="ml-auto px-3 py-1.5 rounded-xl text-xs font-semibold tap text-white"
                  style={{ background: 'rgb(var(--accent-rgb))' }}>Add</button>
                <button type="button" onClick={() => setShowAddDay(false)}
                  className="px-3 py-1.5 rounded-xl text-xs tap" style={{ color: 'var(--t-faint)' }}>Cancel</button>
              </div>
            </form>
          )}

          {planDays.length === 0 && !showAddDay && (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--t-faint)' }}>No plan yet — add your first training day</p>
          )}

          {/* Day cards */}
          {planDays.map(day => (
            <div key={day.id} className="glass glow-card rounded-2xl overflow-hidden group"
              style={{ borderLeft: `3px solid ${day.color}`, '--gc': `${day.color}55` } as React.CSSProperties}>
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-2xl">{day.icon}</span>
                    {editingDayId === day.id ? (
                      <input defaultValue={day.name} placeholder="Day name"
                        className="flex-1 min-w-0 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:ring-1"
                        style={{ background: 'var(--s3)', color: 'var(--t-head)', border: `1px solid ${day.color}44` }}
                        onBlur={e => { if (e.target.value.trim() && e.target.value !== day.name) patchDay(day.id, { name: e.target.value.trim() }); }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                    ) : (
                      <div>
                        <p className="text-sm font-bold text-head">{day.name}</p>
                        <p className="text-[11px]" style={{ color: 'var(--t-faint)' }}>{day.exercises.length} exercises</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {/* LOG THIS button */}
                    <button onClick={async () => {
                      try {
                        await api.post(`/workout/plan/log/${day.id}`);
                        alert(`${day.name} session started! Check the Log tab.`);
                      } catch { alert('Failed to log session'); }
                    }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold tap"
                      style={{ background: `${day.color}18`, color: day.color, border: `1px solid ${day.color}40` }}>
                      Log this day
                    </button>
                    <button onClick={() => setEditingDayId(editingDayId === day.id ? null : day.id)}
                      className="w-9 h-9 rounded-lg flex items-center justify-center tap opacity-25 group-hover:opacity-100"
                      style={{ background: 'var(--s3)' }}>
                      <Pencil size={13} style={{ color: 'var(--t-muted)' }} />
                    </button>
                    <button onClick={async () => {
                      await api.delete(`/workout/plan/days/${day.id}`);
                      setPlanDays(d => d.filter(x => x.id !== day.id));
                    }}
                      className="w-9 h-9 rounded-lg flex items-center justify-center tap opacity-25 group-hover:opacity-100"
                      style={{ background: 'var(--s3)' }}>
                      <Trash2 size={13} style={{ color: '#cd5240' }} />
                    </button>
                  </div>
                </div>

                {/* Colour picker — edit mode */}
                {editingDayId === day.id && (
                  <div className="flex items-center gap-2 mb-3 px-1 flex-wrap">
                    <span className="text-[10px] font-bold tracking-[0.1em] uppercase" style={{ color: 'var(--t-faint)' }}>Colour</span>
                    {PLAN_COLORS.map(c => (
                      <button key={c} onClick={() => patchDay(day.id, { color: c })}
                        className="w-5 h-5 rounded-full tap transition-transform"
                        style={{
                          background: c,
                          transform: day.color === c ? 'scale(1.25)' : undefined,
                          boxShadow: day.color === c ? `0 0 0 2px var(--s1), 0 0 0 3.5px ${c}` : undefined,
                        }} />
                    ))}
                  </div>
                )}

                {/* Exercise list */}
                <div className="space-y-1.5">
                  {day.exercises.map(ex => (
                    <div key={ex.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl group/ex"
                      style={{ background: 'var(--s3)' }}>
                      {editingDayId === day.id ? (
                        /* Edit row — tap the name to swap for a catalog variation */
                        <div className="flex-1 space-y-1.5">
                          <button type="button"
                            onClick={() => setSwapEx({ id: ex.id, name: ex.name, dayId: day.id, color: day.color })}
                            className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium tap"
                            style={{ background: 'var(--s2)', color: 'var(--t-head)', border: `1px solid ${day.color}40` }}>
                            <ArrowLeftRight size={12} style={{ color: day.color }} className="shrink-0" />
                            <span className="flex-1 text-left truncate">{ex.name}</span>
                            <span className="text-[9px] font-bold uppercase tracking-wider shrink-0" style={{ color: day.color }}>swap</span>
                          </button>
                          <div className="grid grid-cols-2 gap-1.5">
                            <input defaultValue={String(ex.sets)} placeholder="Sets" inputMode="numeric"
                              className="rounded-lg px-2 py-1 text-xs focus:outline-none"
                              style={{ background: 'var(--s2)', color: 'var(--t-head)', border: '1px solid var(--b)' }}
                              onBlur={async e => { await api.patch(`/workout/plan/exercises/${ex.id}`, { sets: Number(e.target.value) }); loadPlan(); }} />
                            <input defaultValue={ex.reps} placeholder="Reps"
                              className="rounded-lg px-2 py-1 text-xs focus:outline-none"
                              style={{ background: 'var(--s2)', color: 'var(--t-head)', border: '1px solid var(--b)' }}
                              onBlur={async e => { await api.patch(`/workout/plan/exercises/${ex.id}`, { reps: e.target.value }); loadPlan(); }} />
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center gap-2">
                          <span className="text-xs font-medium text-head flex-1">{ex.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{ background: `${day.color}15`, color: day.color }}>
                            {ex.sets}×{ex.reps}
                          </span>
                          {ex.weight && <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>{ex.weight}</span>}
                        </div>
                      )}
                      <button onClick={async () => {
                        await api.delete(`/workout/plan/exercises/${ex.id}`);
                        setPlanDays(d => d.map(dd => dd.id === day.id ? { ...dd, exercises: dd.exercises.filter(e => e.id !== ex.id) } : dd));
                      }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg opacity-20 group-hover/ex:opacity-100 tap"
                        style={{ color: 'var(--t-faint)' }}>
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add exercise inline */}
                {editingDayId === day.id && (
                  <form className="mt-2" onSubmit={async e => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const r = await api.post<PlanExercise>(`/workout/plan/days/${day.id}/exercises`, {
                      name: fd.get('name'), sets: Number(fd.get('sets')) || 3, reps: fd.get('reps') || '8-12', weight: fd.get('weight') || '',
                    });
                    setPlanDays(d => d.map(dd => dd.id === day.id ? { ...dd, exercises: [...dd.exercises, r.data] } : dd));
                    (e.target as HTMLFormElement).reset();
                  }}>
                    <div className="grid grid-cols-4 gap-1.5">
                      <input name="name" required placeholder="Exercise name"
                        className="col-span-2 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgb(var(--accent-rgb)/0.3)' }} />
                      <input name="sets" type="number" min={1} defaultValue={3} placeholder="Sets"
                        className="rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                      <input name="reps" defaultValue="8-12" placeholder="Reps"
                        className="rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                    </div>
                    <div className="flex gap-2 mt-1.5">
                      <input name="weight" placeholder="Weight (optional, e.g. 60kg)"
                        className="flex-1 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                      <button type="submit" className="px-3 py-1.5 rounded-xl text-xs font-semibold tap text-white"
                        style={{ background: 'rgb(var(--accent-rgb))' }}>+ Add</button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── EXERCISES TAB ── */}
      {tab === 'exercises' && (
        <div className="space-y-3">
          {showNewExercise && (
            <div className="rounded-2xl p-4 space-y-3 paper-in"
              style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
              <input autoFocus placeholder="Exercise name" value={newExName}
                onChange={e => setNewExName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createExercise()}
                className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--s2)', border: '1px solid var(--b)', color: 'var(--t-body)' }} />
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => (
                  <button key={c} type="button" onClick={() => setNewExCat(c)}
                    className="px-3 py-1 rounded-full text-xs font-medium tap"
                    style={newExCat === c
                      ? catChip(c)
                      : { background: 'var(--s2)', color: 'var(--t-faint)', border: '1px solid var(--b)' }}>
                    {c}
                  </button>
                ))}
              </div>
              {exerciseErr && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: '#b3372e14', color: '#e07b62' }}>
                  <AlertCircle size={13} />{exerciseErr}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setShowNewExercise(false); setExerciseErr(''); }}
                  className="px-3 py-1.5 text-sm tap" style={{ color: 'var(--t-faint)' }}>Cancel</button>
                <button type="button" onClick={createExercise} disabled={!newExName.trim() || savingExercise}
                  className="px-4 py-1.5 disabled:opacity-50 text-white text-sm rounded-xl font-bold tap"
                  style={{ background: 'rgb(var(--accent-rgb))' }}>
                  {savingExercise ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          )}

          {CATEGORIES.map(cat => {
            const exs = exercises.filter(e => e.category === cat);
            if (exs.length === 0) return null;
            return (
              <div key={cat}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: CAT_HEX[cat] }}>{cat}</p>
                <div className="space-y-1.5">
                  {exs.map(ex => (
                    <div key={ex.id} className="flex items-center justify-between rounded-xl px-4 py-2.5"
                      style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
                      <span className="text-sm" style={{ color: 'var(--t-body)' }}>{ex.name}</span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setProgressEx(ex)} className="p-1 tap" title="View progress"
                          style={{ color: '#cf8a3e' }}>
                          <TrendingUp size={15} />
                        </button>
                        <button type="button" onClick={async () => {
                          try {
                            await api.delete(`/workout/exercises/${ex.id}`);
                            await fetchExercises();
                          } catch (e: any) {
                            alert(e?.response?.data?.error || 'Failed to delete exercise');
                          }
                        }} className="p-1 tap" style={{ color: 'var(--t-faint)' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {exercises.length === 0 && <p className="text-sm py-8 text-center" style={{ color: 'var(--t-faint)' }}>No exercises yet. Add some to get started!</p>}
        </div>
      )}

      {/* ── STATS TAB ── */}
      {tab === 'stats' && stats && (
        <div className="space-y-5">
          <WorkoutAvatar stats={{
            weekly_sessions: stats.weekly[stats.weekly.length - 1]?.sessions ?? 0,
            total_sets: sessions.reduce((s, sess) => s + (sess.set_count || 0), 0),
            personal_bests: stats.pbs.length,
          }} />
          {stats.weekly.length > 0 && (
            <div className="card rounded-2xl p-4" style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
              <h3 className="text-sm font-semibold text-head mb-4">Sessions per week</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={stats.weekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3d3935" />
                  <XAxis dataKey="week" tick={{ fill: '#84816f', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#84816f', fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#232120', border: '1px solid #3d3935', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="sessions" stroke="#d97757" strokeWidth={2} dot={{ fill: '#d97757', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {stats.pbs.length > 0 && (
            <div className="card rounded-2xl p-4" style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
              <h3 className="text-sm font-semibold text-head mb-3">Personal Bests</h3>
              <div className="space-y-2">
                {stats.pbs.map(pb => (
                  <div key={pb.name} className="flex items-center justify-between py-1.5"
                    style={{ borderBottom: '1px solid var(--b)' }}>
                    <div>
                      <span className="text-sm" style={{ color: 'var(--t-body)' }}>{pb.name}</span>
                      <span className="ml-2 text-xs" style={{ color: CAT_HEX[pb.category as Category] || 'var(--t-faint)' }}>{pb.category}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-right">
                      {pb.max_weight && <span className="font-medium" style={{ color: '#cf8a3e' }}>{pb.max_weight} kg</span>}
                      {pb.max_reps && <span style={{ color: 'var(--t-muted)' }}>{pb.max_reps} reps</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.pbs.length === 0 && <p className="text-sm py-8 text-center" style={{ color: 'var(--t-faint)' }}>Log some workouts to see your personal bests!</p>}
        </div>
      )}

      {progressEx && <ExerciseProgress exercise={progressEx} onClose={() => setProgressEx(null)} />}

      {swapEx && (
        <SwapExercisePicker
          current={swapEx.name}
          accent={swapEx.color}
          onPick={doSwap}
          onClose={() => setSwapEx(null)}
        />
      )}

      </div>{/* end relative zIndex wrapper */}
    </div>
  );
}
