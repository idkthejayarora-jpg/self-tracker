import { useEffect, useState, useCallback } from 'react';
import { Plus, Check, Trash2, ChevronDown, ChevronUp, Edit3, X } from 'lucide-react';
import api from '../lib/api';

interface Milestone {
  id: number;
  area_id: number;
  title: string;
  completed: number;
  completed_at: string | null;
  target_date: string | null;
}

interface LifeArea {
  id: number;
  name: string;
  icon: string;
  color: string;
  vision: string | null;
  progress: number;       // manual override
  displayScore: number;   // what to show
  autoScore: number | null;
  msScore: number | null;
  taskStats: { total: number; done: number };
  journalMentions: number;
  milestones: Milestone[];
}

interface AreaTask {
  id: number;
  title: string;
  status: string;
  due_date: string | null;
  priority: string;
}

const PRESET_ICONS = ['💪', '💼', '❤️', '💰', '📚', '🌱', '🎮', '🧘', '🎯', '✈️', '🎨', '🏠', '🧠', '🌍'];
const PRESET_COLORS = ['#22c55e', '#0ea5e9', '#f43f5e', '#f59e0b', '#a855f7', '#14b8a6', '#f97316', '#8b5cf6', '#6366f1', '#ec4899'];

function scoreColor(v: number): string {
  if (v >= 85) return 'var(--cyan, #06b6d4)';
  if (v >= 60) return '#22c55e';
  if (v >= 30) return '#f59e0b';
  return '#ef4444';
}

function ProgressRing({ value, color, size = 56 }: { value: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width={size} height={size} className="shrink-0" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#374151" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
        fill="white" fontSize={size < 50 ? 10 : 12} fontWeight="600"
        style={{ transform: 'rotate(90deg)', transformOrigin: '50% 50%' }}>
        {value}%
      </text>
    </svg>
  );
}

function AreaCard({ area, onUpdate, onDelete }: {
  area: LifeArea;
  onUpdate: (id: number, updates: Partial<LifeArea>) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [vision, setVision] = useState(area.vision || '');
  const [progress, setProgress] = useState(area.progress);
  const [newMilestone, setNewMilestone] = useState('');
  const [milestones, setMilestones] = useState<Milestone[]>(area.milestones);
  const [areaTasks, setAreaTasks] = useState<AreaTask[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  const displayScore = area.progress > 0 ? area.progress : (area.autoScore ?? 0);
  const isAuto = area.progress === 0 && area.autoScore !== null;
  const sc = scoreColor(displayScore);

  async function loadAreaTasks() {
    if (tasksLoaded) return;
    try {
      const res = await api.get<AreaTask[]>(`/life/areas/${area.id}/tasks`);
      setAreaTasks(res.data);
      setTasksLoaded(true);
    } catch { /* ignore */ }
  }

  function handleExpand() {
    setExpanded(e => !e);
    if (!expanded) loadAreaTasks();
  }

  async function saveVisionProgress() {
    await api.patch(`/life/areas/${area.id}`, { vision, progress });
    onUpdate(area.id, { vision, progress });
    setEditing(false);
  }

  async function addMilestone() {
    if (!newMilestone.trim()) return;
    const r = await api.post<Milestone>(`/life/areas/${area.id}/milestones`, { title: newMilestone });
    setMilestones(prev => [...prev, r.data]);
    setNewMilestone('');
  }

  async function toggleMilestone(m: Milestone) {
    const completed = m.completed === 0;
    await api.patch(`/life/milestones/${m.id}`, { completed });
    setMilestones(prev => prev.map(x => x.id === m.id ? { ...x, completed: completed ? 1 : 0 } : x));
  }

  async function deleteMilestone(id: number) {
    await api.delete(`/life/milestones/${id}`);
    setMilestones(prev => prev.filter(m => m.id !== id));
  }

  async function addQuickTask() {
    if (!newTaskTitle.trim()) return;
    setAddingTask(true);
    try {
      const res = await api.post<AreaTask>('/tasks', {
        title: newTaskTitle.trim(),
        life_area_id: area.id,
        tags: [],
      });
      setAreaTasks(prev => [res.data, ...prev]);
      setNewTaskTitle('');
    } catch { /* ignore */ } finally {
      setAddingTask(false);
    }
  }

  const done = milestones.filter(m => m.completed).length;
  const tasksDone = area.taskStats.done;
  const tasksTotal = area.taskStats.total;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--s1, #111)',
        border: `1px solid ${area.color}30`,
        borderLeft: `3px solid ${area.color}`,
      }}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <ProgressRing value={displayScore} color={sc} size={52} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg">{area.icon}</span>
            <span className="font-semibold text-sm" style={{ color: 'var(--t-head, #fff)' }}>{area.name}</span>
            {isAuto && (
              <span className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded"
                style={{ background: '#06b6d420', color: '#06b6d4', border: '1px solid #06b6d440' }}>AUTO</span>
            )}
            {area.progress > 0 && (
              <span className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded"
                style={{ background: '#a855f720', color: '#a855f7', border: '1px solid #a855f740' }}>MANUAL</span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {/* Task progress bar */}
            {tasksTotal > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-16 h-1.5 rounded-full" style={{ background: 'var(--s3, #222)' }}>
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0}%`, background: area.color }} />
                </div>
                <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--t-faint, #555)' }}>{tasksDone}/{tasksTotal} tasks</span>
              </div>
            )}

            {/* Journal chip */}
            {area.journalMentions > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: '#a855f715', color: '#a855f7', border: '1px solid #a855f730' }}>
                📓 {area.journalMentions}
              </span>
            )}

            {/* Milestones */}
            {milestones.length > 0 && (
              <span className="text-[10px]" style={{ color: 'var(--t-faint, #555)' }}>
                {done}/{milestones.length} milestones
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setEditing(e => !e)}
            className="p-1.5 transition-colors"
            style={{ color: editing ? area.color : 'var(--t-faint, #555)' }}>
            <Edit3 size={14} />
          </button>
          <button onClick={() => onDelete(area.id)}
            className="p-1.5 transition-colors hover:text-red-400"
            style={{ color: 'var(--t-faint, #555)' }}>
            <Trash2 size={14} />
          </button>
          <button onClick={handleExpand}
            className="p-1 transition-colors"
            style={{ color: 'var(--t-faint, #555)' }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Edit panel */}
      {editing && (
        <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: `${area.color}20`, background: 'var(--s2, #0a0a0a)' }}>
          <div>
            <label className="text-[10px] font-bold tracking-wider block mb-1" style={{ color: 'var(--t-faint, #555)' }}>
              MANUAL PROGRESS ({progress}%) — overrides auto-score
            </label>
            <input type="range" min={0} max={100} value={progress}
              onChange={e => setProgress(Number(e.target.value))}
              className="w-full" />
          </div>
          <div>
            <label className="text-[10px] font-bold tracking-wider block mb-1" style={{ color: 'var(--t-faint, #555)' }}>VISION</label>
            <textarea value={vision} onChange={e => setVision(e.target.value)} rows={3}
              placeholder="Describe your vision for this area..."
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              style={{ background: 'var(--s3, #1a1a1a)', border: '1px solid var(--b, #222)', color: 'var(--t-head, #fff)' }} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-sm"
              style={{ color: 'var(--t-muted, #888)' }}>Cancel</button>
            <button onClick={saveVisionProgress}
              className="px-4 py-1.5 text-sm rounded-lg font-semibold"
              style={{ background: area.color, color: '#000' }}>Save</button>
          </div>
        </div>
      )}

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4" style={{ borderColor: `${area.color}20` }}>
          {area.vision && !editing && (
            <p className="text-xs italic border-l-2 pl-3"
              style={{ borderColor: area.color + '60', color: 'var(--t-muted, #888)' }}>{area.vision}</p>
          )}

          {/* Linked tasks */}
          <div>
            <p className="text-[10px] font-bold tracking-wider mb-2" style={{ color: 'var(--t-faint, #555)' }}>LINKED TASKS</p>
            {areaTasks.length === 0 && tasksLoaded && (
              <p className="text-xs" style={{ color: 'var(--t-faint, #555)' }}>No tasks linked yet.</p>
            )}
            {areaTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 py-1">
                <span className="text-sm">{t.status === 'completed' ? '✅' : '⬜'}</span>
                <span className="text-xs flex-1"
                  style={{ color: t.status === 'completed' ? 'var(--t-faint, #555)' : 'var(--t-head, #fff)',
                    textDecoration: t.status === 'completed' ? 'line-through' : 'none' }}>
                  {t.title}
                </span>
                {t.due_date && (
                  <span className="text-[10px] shrink-0" style={{ color: 'var(--t-faint, #555)' }}>{t.due_date}</span>
                )}
              </div>
            ))}
            {/* Quick add task */}
            <div className="flex gap-2 mt-2">
              <input
                placeholder="Add task to this area..."
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addQuickTask()}
                className="flex-1 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                style={{ background: 'var(--s3, #1a1a1a)', border: '1px solid var(--b, #222)', color: 'var(--t-head, #fff)' }} />
              <button onClick={addQuickTask} disabled={!newTaskTitle.trim() || addingTask}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
                style={{ background: `${area.color}20`, color: area.color, border: `1px solid ${area.color}40` }}>
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* Milestones */}
          <div>
            <p className="text-[10px] font-bold tracking-wider mb-2" style={{ color: 'var(--t-faint, #555)' }}>MILESTONES</p>
            {milestones.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {milestones.map(m => (
                  <div key={m.id} className="flex items-center gap-3">
                    <button onClick={() => toggleMilestone(m)}
                      className="shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors"
                      style={{
                        background: m.completed ? area.color : 'transparent',
                        borderColor: m.completed ? area.color : 'var(--b, #333)',
                      }}>
                      {m.completed === 1 && <Check size={10} color="#000" />}
                    </button>
                    <span className="text-xs flex-1"
                      style={{ color: m.completed ? 'var(--t-faint, #555)' : 'var(--t-head, #fff)',
                        textDecoration: m.completed ? 'line-through' : 'none' }}>
                      {m.title}
                    </span>
                    {m.target_date && (
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--t-faint, #555)' }}>{m.target_date}</span>
                    )}
                    <button onClick={() => deleteMilestone(m.id)}
                      className="shrink-0 transition-colors hover:text-red-400"
                      style={{ color: 'var(--t-faint, #555)' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input placeholder="Add milestone..."
                value={newMilestone}
                onChange={e => setNewMilestone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addMilestone()}
                className="flex-1 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                style={{ background: 'var(--s3, #1a1a1a)', border: '1px solid var(--b, #222)', color: 'var(--t-head, #fff)' }} />
              <button onClick={addMilestone} disabled={!newMilestone.trim()}
                className="px-3 py-1.5 rounded-lg text-xs disabled:opacity-40 transition-opacity"
                style={{ background: 'var(--s3, #1a1a1a)', border: '1px solid var(--b, #222)', color: 'var(--t-muted, #888)' }}>
                <Plus size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LifeProgress() {
  const [areas, setAreas] = useState<LifeArea[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('🎯');
  const [newColor, setNewColor] = useState('#6366f1');

  const fetchAreas = useCallback(async () => {
    const res = await api.get<LifeArea[]>('/life/areas');
    setAreas(res.data);
  }, []);

  useEffect(() => { fetchAreas(); }, [fetchAreas]);

  function updateAreaLocal(id: number, updates: Partial<LifeArea>) {
    setAreas(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  }

  async function deleteArea(id: number) {
    await api.delete(`/life/areas/${id}`);
    setAreas(prev => prev.filter(a => a.id !== id));
  }

  async function addArea() {
    if (!newName.trim()) return;
    const r = await api.post<LifeArea>('/life/areas', { name: newName, icon: newIcon, color: newColor });
    setAreas(prev => [...prev, {
      ...r.data,
      milestones: [],
      autoScore: null,
      msScore: null,
      displayScore: 0,
      taskStats: { total: 0, done: 0 },
      journalMentions: 0,
    }]);
    setShowAdd(false); setNewName(''); setNewIcon('🎯'); setNewColor('#6366f1');
  }

  // Overall score = average of displayScores
  const avgScore = areas.length
    ? Math.round(areas.reduce((s, a) => s + a.displayScore, 0) / areas.length)
    : 0;
  const overallColor = scoreColor(avgScore);

  // Mini stats
  const areasWithTasks = areas.filter(a => a.taskStats.total > 0).length;
  const areasWithJournal = areas.filter(a => a.journalMentions > 0).length;
  const totalMilestones = areas.reduce((s, a) => s + a.milestones.length, 0);
  const doneMilestones = areas.reduce((s, a) => s + a.milestones.filter(m => m.completed).length, 0);
  const autoAreas = areas.filter(a => a.autoScore !== null && a.progress === 0).length;

  return (
    <div className="space-y-5"
      style={{ '--accent-rgb': '226 201 126' } as React.CSSProperties}>

      {/* Cyberpunk body overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(226,201,126,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* ── SACRED NEXUS HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl mb-4"
        style={{ background: '#000', border: '1px solid #fbbf2420', minHeight: 120 }}>
        {/* Sacred geometry in corner */}
        <div className="absolute pointer-events-none" style={{ top: '50%', right: 30, transform: 'translateY(-50%)', width: 90, height: 90 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid #fbbf2430', animation: 'sacred-spin 12s linear infinite' }}>
            <div style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', width: 6, height: 6, borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 8px #fbbf24' }} />
          </div>
          <div style={{ position: 'absolute', inset: 15, borderRadius: '50%', border: '1px solid #a78bfa25', animation: 'sacred-spin-rev 8s linear infinite' }}>
            <div style={{ position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)', width: 5, height: 5, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 6px #a78bfa' }} />
          </div>
          <div style={{ position: 'absolute', inset: 30, borderRadius: '50%', border: '1px solid #fbbf2418', animation: 'sacred-spin 6s linear infinite' }} />
          <div style={{ position: 'absolute', inset: '50%', transform: 'translate(-50%,-50%)', width: 10, height: 10, borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 14px #fbbf24, 0 0 28px #a78bfa' }} />
        </div>
        <div className="absolute top-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #fbbf24', borderLeft: '1.5px solid #fbbf24', opacity: 0.7 }} />
        <div className="absolute top-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderTop: '1.5px solid #fbbf24', borderRight: '1.5px solid #fbbf24', opacity: 0.7 }} />
        <div className="absolute bottom-0 left-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #fbbf24', borderLeft: '1.5px solid #fbbf24', opacity: 0.7 }} />
        <div className="absolute bottom-0 right-0 pointer-events-none" style={{ width: 14, height: 14, borderBottom: '1.5px solid #fbbf24', borderRight: '1.5px solid #fbbf24', opacity: 0.7 }} />
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #fbbf2470, transparent)', boxShadow: '0 0 8px #fbbf24' }} />
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: '#fbbf24', opacity: 0.6 }}>NEXUS://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">LIFE_PATH.QUEST</span>
            <span className="cursor-blink font-mono" style={{ color: '#fbbf24', fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight leading-none text-white" style={{ textShadow: '0 0 30px #fbbf2450' }}>
            SACRED NEXUS
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: '#a78bfa', opacity: 0.6 }}>
            // life path initialized — domain mastery in progress
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #fbbf2430, transparent)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      {/* ── Overall Score Card ── */}
      <div className="rounded-2xl p-5"
        style={{ background: 'var(--s1, #111)', border: '1px solid var(--b, #222)' }}>
        <div className="flex items-center gap-5">
          <ProgressRing value={avgScore} color={overallColor} size={80} />
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold" style={{ color: 'var(--t-head, #fff)' }}>Overall Life Score</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--t-muted, #888)' }}>
              Average across {areas.length} life areas
            </p>
            <p className="text-xs mt-1.5 font-semibold" style={{ color: overallColor }}>
              {avgScore >= 85 ? 'Transcendent — you are in flow.' :
               avgScore >= 60 ? 'Thriving — keep the momentum!' :
               avgScore >= 30 ? 'Making progress — push further.' :
               'Time to focus — choose one area to level up.'}
            </p>
          </div>
        </div>

        {/* Mini stats row */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {[
            { label: 'Areas Tracked', value: areas.length },
            { label: 'With Tasks', value: areasWithTasks },
            { label: 'Journal Active', value: areasWithJournal },
            { label: 'Milestones', value: `${doneMilestones}/${totalMilestones}` },
          ].map(s => (
            <div key={s.label} className="text-center rounded-xl py-2"
              style={{ background: 'var(--s2, #0a0a0a)' }}>
              <p className="text-base font-black font-mono tabular-nums" style={{ color: 'rgb(var(--accent-rgb))' }}>{s.value}</p>
              <p className="text-[9px] tracking-wider mt-0.5" style={{ color: 'var(--t-faint, #555)' }}>{s.label.toUpperCase()}</p>
            </div>
          ))}
        </div>

        {autoAreas > 0 && (
          <p className="text-[10px] mt-3 text-center"
            style={{ color: '#06b6d4' }}>
            ⚡ {autoAreas} area{autoAreas !== 1 ? 's' : ''} auto-scored from tasks &amp; journal
          </p>
        )}
      </div>

      {/* ── Area bar overview ── */}
      {areas.length > 0 && (
        <div className="rounded-xl p-4 space-y-2.5"
          style={{ background: 'var(--s1, #111)', border: '1px solid var(--b, #222)' }}>
          <p className="text-[10px] font-bold tracking-widest mb-3" style={{ color: 'var(--t-faint, #555)' }}>// AREA OVERVIEW</p>
          {areas.map(a => (
            <div key={a.id} className="flex items-center gap-3">
              <span className="w-5 text-base shrink-0">{a.icon}</span>
              <span className="text-xs w-28 shrink-0 truncate" style={{ color: 'var(--t-muted, #888)' }}>{a.name}</span>
              <div className="flex-1 rounded-full h-1.5" style={{ background: 'var(--s3, #1a1a1a)' }}>
                <div className="h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${a.displayScore}%`, backgroundColor: a.color }} />
              </div>
              <span className="text-[10px] font-mono tabular-nums w-8 text-right shrink-0"
                style={{ color: scoreColor(a.displayScore) }}>{a.displayScore}%</span>
              {a.autoScore !== null && a.progress === 0 && (
                <span className="text-[8px] font-bold shrink-0" style={{ color: '#06b6d4' }}>AUTO</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Add area button ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: 'rgb(var(--accent-rgb))' }}>// Life Areas</h2>
        <button onClick={() => setShowAdd(s => !s)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
          style={{ background: 'rgb(var(--accent-rgb) / 0.12)', color: 'rgb(var(--accent-rgb))' }}>
          <Plus size={13} /> Add area
        </button>
      </div>

      {/* Add area form */}
      {showAdd && (
        <div className="rounded-xl p-4 space-y-3"
          style={{ background: 'var(--s1, #111)', border: '1px solid var(--b, #222)' }}>
          <input autoFocus placeholder="Area name (e.g. Mental Health)" value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--s3, #1a1a1a)', border: '1px solid var(--b, #222)', color: 'var(--t-head, #fff)' }} />
          <div>
            <p className="text-[10px] font-bold tracking-wider mb-2" style={{ color: 'var(--t-faint, #555)' }}>ICON</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_ICONS.map(i => (
                <button key={i} onClick={() => setNewIcon(i)}
                  className="text-xl p-1 rounded-lg transition-all"
                  style={{ background: newIcon === i ? 'var(--s3, #222)' : 'transparent',
                    outline: newIcon === i ? `2px solid rgb(var(--accent-rgb))` : 'none' }}>
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-wider mb-2" style={{ color: 'var(--t-faint, #555)' }}>COLOR</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  className="w-6 h-6 rounded-full transition-all"
                  style={{ backgroundColor: c, outline: newColor === c ? '2px solid #fff' : 'none', outlineOffset: 2 }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-sm"
              style={{ color: 'var(--t-muted, #888)' }}>Cancel</button>
            <button onClick={addArea} disabled={!newName.trim()}
              className="px-4 py-1.5 text-sm rounded-lg font-semibold disabled:opacity-50"
              style={{ background: 'rgb(var(--accent-rgb))', color: '#000' }}>Add</button>
          </div>
        </div>
      )}

      {/* ── Area cards (2-col on desktop) ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        {areas.map(area => (
          <AreaCard key={area.id} area={area} onUpdate={updateAreaLocal} onDelete={deleteArea} />
        ))}
      </div>

      </div>{/* end relative zIndex wrapper */}
    </div>
  );
}
