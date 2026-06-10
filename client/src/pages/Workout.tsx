import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, TrendingUp, AlertCircle, Pencil, X, Zap, FileText } from 'lucide-react';
import WorkoutAvatar from '../components/WorkoutAvatar';
import { format, parseISO } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import api from '../lib/api';
import { useSync } from '../hooks/useSync';

const CATEGORIES = ['push', 'pull', 'legs', 'cardio', 'core', 'other'] as const;
type Category = typeof CATEGORIES[number];

const CAT_COLORS: Record<Category, string> = {
  push: 'text-orange-400 bg-orange-900/30',
  pull: 'text-blue-400 bg-blue-900/30',
  legs: 'text-green-400 bg-green-900/30',
  cardio: 'text-red-400 bg-red-900/30',
  core: 'text-yellow-400 bg-yellow-900/30',
  other: 'text-gray-400 bg-gray-800',
};

interface PlanExercise { id: number; day_id: number; name: string; sets: number; reps: string; weight: string; notes: string; }
interface PlanDay { id: number; name: string; icon: string; color: string; exercises: PlanExercise[]; }

interface ParsedExercise { name: string; sets: number; reps: string; weight: string; }
interface ParsedDay { name: string; icon: string; color: string; exercises: ParsedExercise[]; }

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
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">{exercise.name} — Progress</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-200 text-xl">×</button>
        </div>
        {data.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">No weight data yet</p>
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

export default function Workout() {
  const [tab, setTab] = useState<'log' | 'plan' | 'exercises' | 'stats'>('log');
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

  useEffect(() => { fetchSessions(); fetchExercises(); loadPlan(); }, [fetchSessions, fetchExercises, loadPlan]);
  useSync(fetchSessions, 60000);

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
      setAddSetExId(''); setAddSetReps(''); setAddSetWeight('');
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

  return (
    <div className="space-y-4"
      style={{ '--accent-rgb': '179 55 46' } as React.CSSProperties}>

      {/* Cyberpunk body overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(217,119,87,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* ── FORGE HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl mb-4"
        style={{ background: 'linear-gradient(180deg, #1a0800 0%, var(--hero-bg) 60%)', border: '1px solid #d9775730', minHeight: 120 }}>
        {/* Heat shimmer columns */}
        <div className="absolute inset-0 pointer-events-none flex gap-8 px-8" style={{ opacity: 0.15 }}>
          {[0,200,400,600,800,1000,1200,1400].map(d => (
            <div key={d} style={{
              width: 2, flex: '0 0 2px', background: '#d9775760',
              animation: `heat-shimmer 1.8s ease-in-out ${d}ms infinite`,
            }} />
          ))}
        </div>
        {/* Ember particles */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(6)].map((_,i) => (
            <div key={i} className="absolute rounded-full" style={{
              width: 3, height: 3,
              background: i % 2 === 0 ? '#d97757' : '#ff8c00',
              boxShadow: 'none',
              left: `${15 + i * 14}%`,
              bottom: 16,
              animation: `ember-float ${1.5 + i * 0.3}s ease-out ${i * 400}ms infinite`,
            }} />
          ))}
        </div>
        {/* HUD corners in orange */}
        <div className="absolute top-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #d97757', borderLeft: '1.5px solid #d97757', opacity: 0.7 }} />
        <div className="absolute top-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #d97757', borderRight: '1.5px solid #d97757', opacity: 0.7 }} />
        <div className="absolute bottom-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #d97757', borderLeft: '1.5px solid #d97757', opacity: 0.7 }} />
        <div className="absolute bottom-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #d97757', borderRight: '1.5px solid #d97757', opacity: 0.7 }} />
        {/* Top lava edge */}
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: '#d97757', boxShadow: 'none' }} />
        {/* Content */}
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: '#d97757', opacity: 0.7 }}>FORGE://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">IRON_PROTOCOL</span>
            <span className="cursor-blink font-mono" style={{ color: '#d97757', fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight leading-none" style={{ color: '#fff', textShadow: 'none' }}>
            THE FORGE
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: '#d97757', opacity: 0.5 }}>
            // STRENGTH PROTOCOL ACTIVE — forge your limits
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: '#d9775740' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      <div className="flex justify-end">
        {tab === 'log' && (
          <button type="button" onClick={() => { setShowNewSession(s => !s); setSessionErr(''); }}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> New session
          </button>
        )}
        {tab === 'exercises' && (
          <button type="button" onClick={() => { setShowNewExercise(s => !s); setExerciseErr(''); }}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Add exercise
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['log', 'plan', 'exercises', 'stats'] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            {t === 'log' ? 'Workout Log' : t === 'stats' ? 'Stats & PBs' : t === 'plan' ? 'My Plan' : 'Exercises'}
          </button>
        ))}
      </div>

      {/* ── LOG TAB ── */}
      {tab === 'log' && (
        <div className="space-y-3">
          {showNewSession && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Date</label>
                  <input type="date" value={newSessionDate} onChange={e => setNewSessionDate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Name (optional)</label>
                  <input placeholder="e.g. Push day" value={newSessionName} onChange={e => setNewSessionName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createSession()}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              {sessionErr && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgb(239 68 68 / 0.1)', color: '#e07b62' }}>
                  <AlertCircle size={13} />{sessionErr}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setShowNewSession(false); setSessionErr(''); }} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
                <button type="button" onClick={createSession} disabled={savingSession}
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium">
                  {savingSession ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          )}

          {/* Quick-log panel */}
          <div className="card px-4 py-4 space-y-3"
            style={{ borderColor: 'rgb(255 69 0 / 0.2)', background: 'linear-gradient(135deg, var(--s1) 0%, rgba(217,119,87,0.03) 100%)' }}>
            <div className="flex items-center gap-2">
              <Zap size={10} style={{ color: '#d97757' }} />
              <span className="text-[10px] font-black tracking-[0.2em]" style={{ color: '#d97757' }}>QUICK LOG</span>
              <span className="text-[10px] font-mono opacity-40 text-white">// speak your workout</span>
            </div>
            <textarea
              rows={2}
              value={quickText}
              onChange={e => { setQuickText(e.target.value); setQuickResult(null); setQuickErr(''); }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitQuickLog(); }}
              placeholder="e.g. chest day, bench 4x8 80kg, cable flies 3x12, 20 min cardio"
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none"
              style={{ background: 'var(--s3)', color: 'var(--t-body)', border: '1px solid rgb(255 69 0 / 0.2)' }}
            />
            {quickErr && (
              <p className="text-xs" style={{ color: '#e07b62' }}>{quickErr}</p>
            )}
            {quickResult && (
              <div className="rounded-xl px-3 py-3 space-y-2"
                style={{ background: 'rgb(255 69 0 / 0.06)', border: '1px solid rgb(255 69 0 / 0.15)' }}>
                <p className="text-xs font-semibold" style={{ color: '#ff6a00' }}>{quickResult.preview}</p>
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
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold tap disabled:opacity-40"
                style={{ background: 'rgb(255 69 0 / 0.9)', color: '#fff' }}>
                <Zap size={13} />{quickLogging ? 'Logging...' : 'Log it'}
              </button>
            </div>
          </div>

          {sessions.length === 0 && <p className="text-gray-500 text-sm py-8 text-center">No sessions yet. Add your first workout!</p>}

          {sessions.map(session => {
            const isExpanded = expandedSession === session.id;
            const sets = sessionSets[session.id] || [];
            return (
              <div key={session.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => expandSession(session.id)}>
                  <div className="flex-1">
                    <p className="font-medium text-white text-sm">{session.name || format(parseISO(session.date), 'EEEE, d MMM')}</p>
                    {session.name && <p className="text-xs text-gray-500">{format(parseISO(session.date), 'd MMM yyyy')}</p>}
                    <p className="text-xs text-gray-500 mt-0.5">{session.exercise_count} exercises · {session.set_count} sets</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={e => { e.stopPropagation(); deleteSession(session.id); }} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                      <Trash2 size={15} />
                    </button>
                    {isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-800 px-4 pb-4 pt-3 space-y-3">
                    {sets.length === 0 && <p className="text-xs text-gray-500">No sets logged yet.</p>}

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
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${CAT_COLORS[cat as Category]}`}>{cat}</span>
                            <span className="text-sm font-medium text-gray-200">{exName}</span>
                          </div>
                          <div className="space-y-1 pl-2">
                            {exSets.map((s, i) => (
                              <div key={s.id} className="flex items-center gap-3 text-xs text-gray-400">
                                <span className="text-gray-600 w-4">#{i + 1}</span>
                                {s.reps && <span>{s.reps} reps</span>}
                                {s.weight && <span className="text-brand-400 font-medium">{s.weight} kg</span>}
                                {s.duration_seconds && <span>{s.duration_seconds}s</span>}
                                <button type="button" onClick={() => deleteSet(session.id, s.id)} className="ml-auto text-gray-700 hover:text-red-400">×</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {/* Add set form */}
                    {addSetSession === session.id ? (
                      <div className="bg-gray-800 rounded-lg p-3 space-y-2 mt-2">
                        <select value={addSetExId} onChange={e => setAddSetExId(e.target.value)}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none">
                          <option value="">Select exercise</option>
                          {exercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name} ({ex.category})</option>)}
                        </select>
                        <div className="flex gap-2">
                          <input placeholder="Reps" type="number" value={addSetReps} onChange={e => setAddSetReps(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none" />
                          <input placeholder="Weight (kg)" type="number" step="0.5" value={addSetWeight} onChange={e => setAddSetWeight(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none" />
                        </div>
                        {setErr && (
                          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#e07b62' }}>
                            <AlertCircle size={12} />{setErr}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button type="button" onClick={() => { setAddSetSession(null); setSetErr(''); }} className="text-xs text-gray-400 hover:text-gray-200 px-2">Cancel</button>
                          <button type="button" onClick={() => addSet(session.id)} disabled={!addSetExId || savingSet}
                            className="flex-1 text-xs bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-1.5 rounded font-medium">
                            {savingSet ? 'Logging...' : 'Log set'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => { setAddSetSession(session.id); setSetErr(''); }}
                        className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors mt-1">
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
              <p className="text-xs font-bold tracking-wider" style={{ color: 'var(--t-muted)' }}>// UPLOAD WORKOUT PLAN PDF</p>

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
                <p className="text-xs animate-pulse font-mono" style={{ color: 'var(--t-faint)' }}>Parsing PDF...</p>
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
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{day.icon}</span>
                    <div>
                      <p className="text-sm font-bold text-head">{day.name}</p>
                      <p className="text-[11px]" style={{ color: 'var(--t-faint)' }}>{day.exercises.length} exercises</p>
                    </div>
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
                      ▶ LOG THIS
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

                {/* Exercise list */}
                <div className="space-y-1.5">
                  {day.exercises.map(ex => (
                    <div key={ex.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl group/ex"
                      style={{ background: 'var(--s3)' }}>
                      {editingDayId === day.id ? (
                        /* Edit row */
                        <div className="flex-1 grid grid-cols-4 gap-1.5">
                          <input defaultValue={ex.name} placeholder="Exercise"
                            className="col-span-2 rounded-lg px-2 py-1 text-xs focus:outline-none"
                            style={{ background: 'var(--s2)', color: 'var(--t-head)', border: '1px solid var(--b)' }}
                            onBlur={async e => { await api.patch(`/workout/plan/exercises/${ex.id}`, { name: e.target.value }); loadPlan(); }} />
                          <input defaultValue={String(ex.sets)} placeholder="Sets"
                            className="rounded-lg px-2 py-1 text-xs focus:outline-none"
                            style={{ background: 'var(--s2)', color: 'var(--t-head)', border: '1px solid var(--b)' }}
                            onBlur={async e => { await api.patch(`/workout/plan/exercises/${ex.id}`, { sets: Number(e.target.value) }); loadPlan(); }} />
                          <input defaultValue={ex.reps} placeholder="Reps"
                            className="rounded-lg px-2 py-1 text-xs focus:outline-none"
                            style={{ background: 'var(--s2)', color: 'var(--t-head)', border: '1px solid var(--b)' }}
                            onBlur={async e => { await api.patch(`/workout/plan/exercises/${ex.id}`, { reps: e.target.value }); loadPlan(); }} />
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
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <input autoFocus placeholder="Exercise name" value={newExName}
                onChange={e => setNewExName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createExercise()}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => (
                  <button key={c} type="button" onClick={() => setNewExCat(c)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${newExCat === c ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    {c}
                  </button>
                ))}
              </div>
              {exerciseErr && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgb(239 68 68 / 0.1)', color: '#e07b62' }}>
                  <AlertCircle size={13} />{exerciseErr}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setShowNewExercise(false); setExerciseErr(''); }} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
                <button type="button" onClick={createExercise} disabled={!newExName.trim() || savingExercise}
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium">
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
                <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${CAT_COLORS[cat].split(' ')[0]}`}>{cat}</p>
                <div className="space-y-1.5">
                  {exs.map(ex => (
                    <div key={ex.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5">
                      <span className="text-sm text-gray-200">{ex.name}</span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setProgressEx(ex)} className="p-1 text-gray-500 hover:text-brand-400 transition-colors" title="View progress">
                          <TrendingUp size={15} />
                        </button>
                        <button type="button" onClick={async () => {
                          try {
                            await api.delete(`/workout/exercises/${ex.id}`);
                            await fetchExercises();
                          } catch (e: any) {
                            alert(e?.response?.data?.error || 'Failed to delete exercise');
                          }
                        }} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {exercises.length === 0 && <p className="text-gray-500 text-sm py-8 text-center">No exercises yet. Add some to get started!</p>}
        </div>
      )}

      {/* ── STATS TAB ── */}
      {tab === 'stats' && stats && (
        <div className="space-y-5" style={{ position: 'relative', zIndex: 1 }}>
          <WorkoutAvatar stats={{
            weekly_sessions: stats.weekly[stats.weekly.length - 1]?.sessions ?? 0,
            total_sets: sessions.reduce((s, sess) => s + (sess.set_count || 0), 0),
            personal_bests: stats.pbs.length,
          }} />
          {stats.weekly.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-4">Sessions per week</h3>
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
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Personal Bests</h3>
              <div className="space-y-2">
                {stats.pbs.map(pb => (
                  <div key={pb.name} className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0">
                    <div>
                      <span className="text-sm text-gray-200">{pb.name}</span>
                      <span className={`ml-2 text-xs ${CAT_COLORS[pb.category as Category]?.split(' ')[0] || 'text-gray-500'}`}>{pb.category}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-right">
                      {pb.max_weight && <span className="text-brand-400 font-medium">{pb.max_weight} kg</span>}
                      {pb.max_reps && <span className="text-gray-400">{pb.max_reps} reps</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.pbs.length === 0 && <p className="text-gray-500 text-sm py-8 text-center">Log some workouts to see your personal bests!</p>}
        </div>
      )}

      {progressEx && <ExerciseProgress exercise={progressEx} onClose={() => setProgressEx(null)} />}

      </div>{/* end relative zIndex wrapper */}
    </div>
  );
}
