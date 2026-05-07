import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Dumbbell, TrendingUp } from 'lucide-react';
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
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-xl">×</button>
        </div>
        {data.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">No weight data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} unit=" kg" />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v) => [`${v} kg`, 'Max weight']} />
              <Line type="monotone" dataKey="max_weight" stroke="#0ea5e9" strokeWidth={2} dot={{ fill: '#0ea5e9', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function Workout() {
  const [tab, setTab] = useState<'log' | 'exercises' | 'stats'>('log');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [expandedSession, setExpandedSession] = useState<number | null>(null);
  const [sessionSets, setSessionSets] = useState<Record<number, WorkoutSet[]>>({});
  const [progressEx, setProgressEx] = useState<Exercise | null>(null);

  // New session form
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionDate, setNewSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [newSessionName, setNewSessionName] = useState('');

  // New exercise form
  const [showNewExercise, setShowNewExercise] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExCat, setNewExCat] = useState<Category>('other');

  // Add set form
  const [addSetSession, setAddSetSession] = useState<number | null>(null);
  const [addSetExId, setAddSetExId] = useState('');
  const [addSetReps, setAddSetReps] = useState('');
  const [addSetWeight, setAddSetWeight] = useState('');

  const [stats, setStats] = useState<{ weekly: { week: string; sessions: number }[]; pbs: { name: string; category: string; max_weight: number; max_reps: number }[] } | null>(null);

  const fetchSessions = useCallback(async () => {
    const r = await api.get<Session[]>('/workout/sessions');
    setSessions(r.data);
  }, []);

  const fetchExercises = useCallback(async () => {
    const r = await api.get<Exercise[]>('/workout/exercises');
    setExercises(r.data);
  }, []);

  useEffect(() => { fetchSessions(); fetchExercises(); }, [fetchSessions, fetchExercises]);
  useSync(fetchSessions, 60000);

  useEffect(() => {
    if (tab === 'stats') api.get('/workout/stats').then(r => setStats(r.data));
  }, [tab]);

  async function expandSession(id: number) {
    if (expandedSession === id) { setExpandedSession(null); return; }
    setExpandedSession(id);
    if (!sessionSets[id]) {
      const r = await api.get<WorkoutSet[]>(`/workout/sessions/${id}/sets`);
      setSessionSets(prev => ({ ...prev, [id]: r.data }));
    }
  }

  async function createSession() {
    await api.post('/workout/sessions', { date: newSessionDate, name: newSessionName || undefined });
    setShowNewSession(false); setNewSessionName('');
    fetchSessions();
  }

  async function deleteSession(id: number) {
    await api.delete(`/workout/sessions/${id}`);
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  async function createExercise() {
    if (!newExName.trim()) return;
    await api.post('/workout/exercises', { name: newExName, category: newExCat });
    setShowNewExercise(false); setNewExName('');
    fetchExercises();
  }

  async function addSet(sessionId: number) {
    if (!addSetExId) return;
    await api.post(`/workout/sessions/${sessionId}/sets`, {
      exercise_id: Number(addSetExId),
      reps: addSetReps ? Number(addSetReps) : undefined,
      weight: addSetWeight ? Number(addSetWeight) : undefined,
    });
    const r = await api.get<WorkoutSet[]>(`/workout/sessions/${sessionId}/sets`);
    setSessionSets(prev => ({ ...prev, [sessionId]: r.data }));
    setAddSetExId(''); setAddSetReps(''); setAddSetWeight('');
    fetchSessions();
  }

  async function deleteSet(sessionId: number, setId: number) {
    await api.delete(`/workout/sets/${setId}`);
    setSessionSets(prev => ({ ...prev, [sessionId]: prev[sessionId].filter(s => s.id !== setId) }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Dumbbell size={22} className="text-orange-400" /> Workout</h1>
        {tab === 'log' && (
          <button onClick={() => setShowNewSession(s => !s)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> New session
          </button>
        )}
        {tab === 'exercises' && (
          <button onClick={() => setShowNewExercise(s => !s)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Add exercise
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['log', 'exercises', 'stats'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            {t === 'log' ? 'Workout Log' : t === 'stats' ? 'Stats & PBs' : 'Exercises'}
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
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowNewSession(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
                <button onClick={createSession} className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg font-medium">Create</button>
              </div>
            </div>
          )}

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
                    <button onClick={e => { e.stopPropagation(); deleteSession(session.id); }} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
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
                                <button onClick={() => deleteSet(session.id, s.id)} className="ml-auto text-gray-700 hover:text-red-400">×</button>
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
                        <div className="flex gap-2">
                          <button onClick={() => setAddSetSession(null)} className="text-xs text-gray-400 hover:text-gray-200 px-2">Cancel</button>
                          <button onClick={() => addSet(session.id)} disabled={!addSetExId}
                            className="flex-1 text-xs bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-1.5 rounded font-medium">Log set</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAddSetSession(session.id)}
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

      {/* ── EXERCISES TAB ── */}
      {tab === 'exercises' && (
        <div className="space-y-3">
          {showNewExercise && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <input autoFocus placeholder="Exercise name" value={newExName} onChange={e => setNewExName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setNewExCat(c)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${newExCat === c ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowNewExercise(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
                <button onClick={createExercise} disabled={!newExName.trim()}
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium">Add</button>
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
                        <button onClick={() => setProgressEx(ex)} className="p-1 text-gray-500 hover:text-brand-400 transition-colors" title="View progress">
                          <TrendingUp size={15} />
                        </button>
                        <button onClick={async () => { await api.delete(`/workout/exercises/${ex.id}`); fetchExercises(); }}
                          className="p-1 text-gray-600 hover:text-red-400 transition-colors">
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
        <div className="space-y-5">
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="sessions" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 4 }} />
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
    </div>
  );
}
