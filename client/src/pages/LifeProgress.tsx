import { useEffect, useState, useCallback } from 'react';
import { Plus, Check, Trash2, ChevronDown, ChevronUp, X, Zap, Target, BookOpen, Activity, Star, Shield } from 'lucide-react';
import api from '../lib/api';

/* ── Types ─────────────────────────────────────────────────────── */
interface Milestone {
  id: number; area_id: number; title: string;
  completed: number; completed_at: string | null; target_date: string | null;
}
interface LifeArea {
  id: number; name: string; icon: string; color: string;
  vision: string | null; progress: number;
  displayScore: number; autoScore: number | null; msScore: number | null;
  taskStats: { total: number; done: number };
  journalMentions: number; milestones: Milestone[];
}
interface AreaTask {
  id: number; title: string; status: string; due_date: string | null; priority: string;
}
interface MeSummary {
  rank: string; rankColor: string; rankLabel: string; rankDesc: string;
  meritScore: number;
  meritBreakdown: { statScore: number; skillScore: number; claimScore: number; ptsScore: number };
  nextRank: { rank: string; min: number; color: string; label: string } | null;
  totalPoints: number;
  stats: { strength: number; vitality: number; discipline: number; focus: number; endurance: number; wealth: number };
}
interface LevelData {
  total: number; today: number; thisWeek: number;
  level: number; levelLabel: string; nextLevel: number | null; progressPct: number;
}

/* ── Constants ──────────────────────────────────────────────────── */
const PRESET_ICONS = ['💪','💼','❤️','💰','📚','🌱','🎮','🧘','🎯','✈️','🎨','🏠','🧠','🌍'];
const PRESET_COLORS = ['#22c55e','#0ea5e9','#f43f5e','#f59e0b','#a855f7','#14b8a6','#f97316','#8b5cf6','#6366f1','#ec4899'];

const STAT_META: Record<string, { label: string; icon: string; color: string; hint: string }> = {
  strength:   { label: 'STRENGTH',   icon: '⚔️',  color: '#ef4444', hint: 'Workouts this month' },
  vitality:   { label: 'VITALITY',   icon: '🛡️',  color: '#22c55e', hint: 'Avg sleep quality' },
  discipline: { label: 'DISCIPLINE', icon: '🔥',  color: '#f97316', hint: 'Habit rate this week' },
  focus:      { label: 'FOCUS',      icon: '🧠',  color: '#a855f7', hint: 'Task rate this month' },
  endurance:  { label: 'ENDURANCE',  icon: '💎',  color: '#0ea5e9', hint: 'Longest streak (days)' },
  wealth:     { label: 'WEALTH',     icon: '💰',  color: '#f59e0b', hint: 'Finance net this month' },
};

function scoreColor(v: number) {
  if (v >= 85) return '#00f5ff';
  if (v >= 60) return '#22c55e';
  if (v >= 30) return '#f59e0b';
  return '#ef4444';
}

function scoreGrade(v: number) {
  if (v >= 85) return 'S';
  if (v >= 70) return 'A';
  if (v >= 50) return 'B';
  if (v >= 30) return 'C';
  if (v >= 10) return 'D';
  return 'E';
}

/* ── Area Card ──────────────────────────────────────────────────── */
function AreaCard({ area, onUpdate, onDelete }: {
  area: LifeArea;
  onUpdate: (id: number, u: Partial<LifeArea>) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [vision, setVision] = useState(area.vision || '');
  const [progress, setProgress] = useState(area.progress);
  const [editing, setEditing] = useState(false);
  const [newMilestone, setNewMilestone] = useState('');
  const [milestones, setMilestones] = useState<Milestone[]>(area.milestones);
  const [areaTasks, setAreaTasks] = useState<AreaTask[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [newTask, setNewTask] = useState('');

  const score = area.progress > 0 ? area.progress : (area.autoScore ?? 0);
  const isAuto = area.progress === 0 && area.autoScore !== null;
  const sc = scoreColor(score);
  const grade = scoreGrade(score);
  const taskPct = area.taskStats.total > 0 ? Math.round((area.taskStats.done / area.taskStats.total) * 100) : 0;
  const msDone = milestones.filter(m => m.completed).length;

  async function loadTasks() {
    if (tasksLoaded) return;
    try {
      const r = await api.get<AreaTask[]>(`/life/areas/${area.id}/tasks`);
      setAreaTasks(r.data); setTasksLoaded(true);
    } catch { /**/ }
  }
  function toggleExpand() { setExpanded(e => !e); if (!expanded) loadTasks(); }

  async function save() {
    await api.patch(`/life/areas/${area.id}`, { vision, progress });
    onUpdate(area.id, { vision, progress }); setEditing(false);
  }
  async function addMs() {
    if (!newMilestone.trim()) return;
    const r = await api.post<Milestone>(`/life/areas/${area.id}/milestones`, { title: newMilestone });
    setMilestones(p => [...p, r.data]); setNewMilestone('');
  }
  async function toggleMs(m: Milestone) {
    const done = m.completed === 0;
    await api.patch(`/life/milestones/${m.id}`, { completed: done });
    setMilestones(p => p.map(x => x.id === m.id ? { ...x, completed: done ? 1 : 0 } : x));
  }
  async function deleteMs(id: number) {
    await api.delete(`/life/milestones/${id}`);
    setMilestones(p => p.filter(m => m.id !== id));
  }
  async function addTask() {
    if (!newTask.trim()) return;
    const r = await api.post<AreaTask>('/tasks', { title: newTask.trim(), life_area_id: area.id, tags: [] });
    setAreaTasks(p => [r.data, ...p]); setNewTask('');
  }

  return (
    <div className="relative overflow-hidden rounded-xl transition-all duration-200"
      style={{ background: 'var(--s1)', border: `1px solid ${area.color}25`, borderLeft: `4px solid ${area.color}` }}>

      {/* Faint area color wash */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(135deg, ${area.color}06 0%, transparent 60%)` }} />

      {/* ── Main row ── */}
      <div className="relative flex items-center gap-3 px-4 py-4 cursor-pointer" onClick={toggleExpand}>

        {/* BIG score */}
        <div className="shrink-0 text-center w-14">
          <div className="text-3xl font-black font-mono leading-none tabular-nums" style={{ color: sc }}>{score}</div>
          <div className="text-[9px] font-black tracking-widest mt-0.5" style={{ color: area.color, opacity: 0.7 }}>
            {grade}-RANK
          </div>
        </div>

        {/* Divider */}
        <div className="shrink-0 w-px h-10 opacity-30" style={{ background: area.color }} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-base leading-none">{area.icon}</span>
            <span className="font-bold text-sm leading-none" style={{ color: 'var(--t-head)' }}>{area.name}</span>
            {isAuto && (
              <span className="text-[8px] font-black tracking-widest px-1 py-0.5 rounded"
                style={{ background: '#00f5ff15', color: '#00f5ff', border: '1px solid #00f5ff30' }}>AUTO</span>
            )}
          </div>

          {/* Mini stat row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {area.taskStats.total > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-14 h-1 rounded-full" style={{ background: 'var(--s4)' }}>
                  <div className="h-1 rounded-full transition-all" style={{ width: `${taskPct}%`, background: area.color }} />
                </div>
                <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--t-dim)' }}>
                  {area.taskStats.done}/{area.taskStats.total} tasks
                </span>
              </div>
            )}
            {area.journalMentions > 0 && (
              <span className="text-[10px]" style={{ color: '#a855f7' }}>📓 ×{area.journalMentions}</span>
            )}
            {milestones.length > 0 && (
              <span className="text-[10px]" style={{ color: 'var(--t-dim)' }}>🏁 {msDone}/{milestones.length}</span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => setEditing(e => !e)}
            className="p-1.5 rounded tap"
            style={{ color: editing ? area.color : 'var(--t-faint)' }}>
            <Target size={13} />
          </button>
          <button onClick={() => onDelete(area.id)}
            className="p-1.5 rounded tap hover:text-red-400"
            style={{ color: 'var(--t-faint)' }}>
            <Trash2 size={13} />
          </button>
          <button className="p-1.5 rounded tap" style={{ color: 'var(--t-faint)' }}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* ── Edit panel ── */}
      {editing && (
        <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: `${area.color}20`, background: 'var(--s2)' }}>
          <div>
            <label className="text-[9px] font-black tracking-widest block mb-1.5" style={{ color: 'var(--t-faint)' }}>
              MANUAL OVERRIDE — {progress}% (0 = use auto-score)
            </label>
            <input type="range" min={0} max={100} value={progress}
              onChange={e => setProgress(Number(e.target.value))} className="w-full" />
          </div>
          <textarea value={vision} onChange={e => setVision(e.target.value)} rows={2}
            placeholder="Your vision for this life domain..."
            className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none resize-none"
            style={{ background: 'var(--s3)', border: `1px solid ${area.color}25`, color: 'var(--t-head)' }} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs" style={{ color: 'var(--t-muted)' }}>Cancel</button>
            <button onClick={save} className="px-4 py-1 text-xs rounded-lg font-bold"
              style={{ background: area.color, color: '#000' }}>Save</button>
          </div>
        </div>
      )}

      {/* ── Expanded panel ── */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4" style={{ borderColor: `${area.color}15` }}>
          {area.vision && !editing && (
            <p className="text-xs italic border-l-2 pl-3"
              style={{ borderColor: `${area.color}60`, color: 'var(--t-muted)' }}>{area.vision}</p>
          )}

          {/* Tasks */}
          <div>
            <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: area.color, opacity: 0.7 }}>// LINKED TASKS</p>
            {areaTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 py-0.5">
                <span className="text-xs">{t.status === 'completed' ? '✅' : '⬜'}</span>
                <span className="text-xs flex-1 truncate"
                  style={{ color: t.status === 'completed' ? 'var(--t-faint)' : 'var(--t-head)',
                    textDecoration: t.status === 'completed' ? 'line-through' : 'none' }}>
                  {t.title}
                </span>
              </div>
            ))}
            {tasksLoaded && areaTasks.length === 0 && (
              <p className="text-[10px]" style={{ color: 'var(--t-faint)' }}>No tasks linked yet.</p>
            )}
            <div className="flex gap-2 mt-2">
              <input placeholder="Add task..." value={newTask}
                onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                className="flex-1 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                style={{ background: 'var(--s3)', border: `1px solid ${area.color}20`, color: 'var(--t-head)' }} />
              <button onClick={addTask} disabled={!newTask.trim()} className="px-2.5 py-1.5 rounded-lg text-xs disabled:opacity-40"
                style={{ background: `${area.color}20`, color: area.color }}>
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* Milestones */}
          <div>
            <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: area.color, opacity: 0.7 }}>// MILESTONES</p>
            <div className="space-y-1.5 mb-2">
              {milestones.map(m => (
                <div key={m.id} className="flex items-center gap-2">
                  <button onClick={() => toggleMs(m)}
                    className="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                    style={{ background: m.completed ? area.color : 'transparent', borderColor: m.completed ? area.color : 'var(--b)' }}>
                    {m.completed === 1 && <Check size={9} color="#000" />}
                  </button>
                  <span className="text-xs flex-1"
                    style={{ color: m.completed ? 'var(--t-faint)' : 'var(--t-head)',
                      textDecoration: m.completed ? 'line-through' : 'none' }}>{m.title}</span>
                  <button onClick={() => deleteMs(m.id)} className="tap hover:text-red-400" style={{ color: 'var(--t-faint)' }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input placeholder="Add milestone..." value={newMilestone}
                onChange={e => setNewMilestone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addMs()}
                className="flex-1 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                style={{ background: 'var(--s3)', border: `1px solid ${area.color}20`, color: 'var(--t-head)' }} />
              <button onClick={addMs} disabled={!newMilestone.trim()} className="px-2.5 py-1.5 rounded-lg text-xs disabled:opacity-40"
                style={{ background: `${area.color}20`, color: area.color }}>
                <Plus size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stat Bar ───────────────────────────────────────────────────── */
function StatBar({ statKey, value }: { statKey: string; value: number }) {
  const m = STAT_META[statKey];
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">{m.icon}</span>
          <span className="text-[9px] font-black tracking-widest" style={{ color: 'var(--t-dim)' }}>{m.label}</span>
        </div>
        <span className="text-xs font-black font-mono tabular-nums" style={{ color: m.color }}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--s4)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: `linear-gradient(90deg, ${m.color}aa, ${m.color})` }} />
      </div>
    </div>
  );
}

/* ── Rank Hex Badge ─────────────────────────────────────────────── */
function RankBadge({ rank, color, size = 64 }: { rank: string; color: string; size?: number }) {
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 64 64" className="absolute inset-0">
        <polygon points="32,2 58,17 58,47 32,62 6,47 6,17"
          fill="none" stroke={color} strokeWidth="2" opacity="0.6" />
        <polygon points="32,8 54,20 54,44 32,56 10,44 10,20"
          fill={`${color}12`} stroke={color} strokeWidth="1" opacity="0.4" />
      </svg>
      <span className="relative font-black text-lg" style={{ color, textShadow: `0 0 16px ${color}` }}>{rank}</span>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────── */
export default function LifeProgress() {
  const [areas, setAreas] = useState<LifeArea[]>([]);
  const [me, setMe] = useState<MeSummary | null>(null);
  const [lvl, setLvl] = useState<LevelData | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('🎯');
  const [newColor, setNewColor] = useState('#6366f1');

  const fetchAll = useCallback(async () => {
    // Use allSettled so one failing endpoint never blocks the others
    const [areasRes, meRes, lvlRes] = await Promise.allSettled([
      api.get<LifeArea[]>('/life/areas'),
      api.get<MeSummary>('/me/summary'),
      api.get<LevelData>('/points'),
    ]);
    if (areasRes.status === 'fulfilled') setAreas(areasRes.value.data);
    if (meRes.status   === 'fulfilled') setMe(meRes.value.data);
    if (lvlRes.status  === 'fulfilled') setLvl(lvlRes.value.data);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function updateAreaLocal(id: number, u: Partial<LifeArea>) {
    setAreas(p => p.map(a => a.id === id ? { ...a, ...u } : a));
  }
  async function deleteArea(id: number) {
    await api.delete(`/life/areas/${id}`);
    setAreas(p => p.filter(a => a.id !== id));
  }
  async function addArea() {
    if (!newName.trim()) return;
    const r = await api.post<LifeArea>('/life/areas', { name: newName, icon: newIcon, color: newColor });
    setAreas(p => [...p, { ...r.data, milestones: [], autoScore: null, msScore: null, displayScore: 0, taskStats: { total: 0, done: 0 }, journalMentions: 0 }]);
    setShowAdd(false); setNewName(''); setNewIcon('🎯'); setNewColor('#6366f1');
  }

  const avgScore = areas.length
    ? Math.round(areas.reduce((s, a) => s + a.displayScore, 0) / areas.length) : 0;
  const totalMilestones = areas.reduce((s, a) => s + a.milestones.length, 0);
  const doneMilestones = areas.reduce((s, a) => s + a.milestones.filter(m => m.completed).length, 0);
  const areasWithTasks = areas.filter(a => a.taskStats.total > 0).length;

  const gold = '#e2c97e';

  return (
    <div style={{ '--accent-rgb': '226 201 126' } as React.CSSProperties}>

      {/* Dot grid */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(226,201,126,0.05) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }} />
      </div>

      <div className="relative space-y-4" style={{ zIndex: 1 }}>

        {/* ── HERO ── */}
        <div className="relative overflow-hidden rounded-2xl"
          style={{ background: 'var(--hero-bg)', border: `1px solid ${gold}20`, minHeight: 120 }}>
          {/* Diagonal slash accent */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div style={{
              position: 'absolute', top: -20, right: 60, width: 2, height: 200,
              background: `linear-gradient(180deg, transparent, ${gold}40, transparent)`,
              transform: 'rotate(20deg)',
            }} />
            <div style={{
              position: 'absolute', top: -20, right: 90, width: 1, height: 200,
              background: `linear-gradient(180deg, transparent, ${gold}20, transparent)`,
              transform: 'rotate(20deg)',
            }} />
          </div>
          {/* Corner marks */}
          {(['tl','tr','bl','br'] as const).map(c => (
            <div key={c} className="absolute pointer-events-none" style={{
              top: c.startsWith('t') ? 0 : 'auto', bottom: c.startsWith('b') ? 0 : 'auto',
              left: c.endsWith('l') ? 0 : 'auto', right: c.endsWith('r') ? 0 : 'auto',
              width: 12, height: 12,
              borderTop: c.startsWith('t') ? `1.5px solid ${gold}` : 'none',
              borderBottom: c.startsWith('b') ? `1.5px solid ${gold}` : 'none',
              borderLeft: c.endsWith('l') ? `1.5px solid ${gold}` : 'none',
              borderRight: c.endsWith('r') ? `1.5px solid ${gold}` : 'none',
              opacity: 0.6,
            }} />
          ))}
          <div className="absolute top-0 inset-x-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${gold}60, transparent)` }} />

          <div className="relative z-10 px-5 py-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: gold, opacity: 0.6 }}>SYS://</span>
              <span className="text-[9px] font-mono tracking-widest" style={{ color: 'var(--t-faint)' }}>LIFE_PATH.ARSENAL</span>
              <span className="font-mono animate-pulse" style={{ color: gold, fontSize: 11 }}>▌</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight leading-none"
              style={{ color: '#fff', textShadow: `0 0 30px ${gold}50` }}>
              LIFE PATH
            </h1>
            <p className="font-mono text-[10px] mt-1" style={{ color: '#a78bfa', opacity: 0.7 }}>
              // tracking tasks · habits · rank · domains
            </p>
          </div>
          <div className="absolute bottom-0 inset-x-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${gold}30, transparent)` }} />
        </div>

        {/* ── COMMAND STRIP (rank + level + score + points) ── */}
        {(me || lvl) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

            {/* Rank */}
            {me && (
              <div className="col-span-2 sm:col-span-1 rounded-xl px-4 py-3 flex items-center gap-3"
                style={{ background: 'var(--s1)', border: `1px solid ${me.rankColor}30` }}>
                <RankBadge rank={me.rank} color={me.rankColor} size={52} />
                <div>
                  <div className="text-[9px] font-black tracking-widest" style={{ color: 'var(--t-faint)' }}>HUNTER RANK</div>
                  <div className="font-bold text-sm leading-tight mt-0.5" style={{ color: me.rankColor }}>{me.rankLabel}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--t-dim)' }}>{me.rankDesc}</div>
                </div>
              </div>
            )}

            {/* Merit Score */}
            {me && (
              <div className="rounded-xl px-4 py-3 flex flex-col justify-center"
                style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
                <div className="text-[9px] font-black tracking-widest mb-1" style={{ color: 'var(--t-faint)' }}>MERIT SCORE</div>
                <div className="text-2xl font-black font-mono tabular-nums" style={{ color: me.rankColor }}>{me.meritScore}</div>
                <div className="text-[9px] mt-0.5" style={{ color: 'var(--t-faint)' }}>/100</div>
                {me.nextRank && (
                  <div className="mt-2">
                    <div className="h-1 rounded-full" style={{ background: 'var(--s4)' }}>
                      <div className="h-1 rounded-full transition-all duration-700"
                        style={{ width: `${(me.meritScore / me.nextRank.min) * 100}%`, background: me.rankColor }} />
                    </div>
                    <div className="text-[8px] mt-0.5" style={{ color: 'var(--t-faint)' }}>
                      → {me.nextRank.rank} at {me.nextRank.min}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Level */}
            {lvl && (
              <div className="rounded-xl px-4 py-3 flex flex-col justify-center"
                style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
                <div className="text-[9px] font-black tracking-widest mb-1" style={{ color: 'var(--t-faint)' }}>LEVEL</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black font-mono" style={{ color: gold }}>{lvl.level}</span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--t-muted)' }}>{lvl.levelLabel}</span>
                </div>
                <div className="mt-2">
                  <div className="h-1 rounded-full" style={{ background: 'var(--s4)' }}>
                    <div className="h-1 rounded-full transition-all duration-700"
                      style={{ width: `${lvl.progressPct}%`, background: `linear-gradient(90deg, ${gold}88, ${gold})` }} />
                  </div>
                  <div className="text-[8px] mt-0.5" style={{ color: 'var(--t-faint)' }}>
                    {lvl.progressPct}% to lv.{lvl.level + 1}
                    {lvl.nextLevel !== null && ` · ${lvl.nextLevel} pts needed`}
                  </div>
                </div>
              </div>
            )}

            {/* Points */}
            {lvl && (
              <div className="rounded-xl px-4 py-3 flex flex-col justify-center"
                style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
                <div className="text-[9px] font-black tracking-widest mb-1" style={{ color: 'var(--t-faint)' }}>TOTAL XP</div>
                <div className="text-2xl font-black font-mono tabular-nums" style={{ color: gold }}>{lvl.total.toLocaleString()}</div>
                <div className="flex gap-3 mt-1.5">
                  <div>
                    <div className="text-[8px]" style={{ color: 'var(--t-faint)' }}>TODAY</div>
                    <div className="text-xs font-bold font-mono" style={{ color: '#22c55e' }}>+{lvl.today}</div>
                  </div>
                  <div>
                    <div className="text-[8px]" style={{ color: 'var(--t-faint)' }}>THIS WEEK</div>
                    <div className="text-xs font-bold font-mono" style={{ color: '#22c55e' }}>+{lvl.thisWeek}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MAIN LAYOUT: left (areas) + right (sidebar) ── */}
        <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-4 space-y-4 lg:space-y-0">

          {/* ════════ LEFT: Area Arsenal ════════ */}
          <div className="space-y-4">

            {/* Overall life score banner */}
            <div className="rounded-xl px-4 py-3"
              style={{ background: 'var(--s1)', border: `1px solid ${scoreColor(avgScore)}25` }}>
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-[9px] font-black tracking-widest" style={{ color: 'var(--t-faint)' }}>OVERALL LIFE SCORE</div>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-4xl font-black font-mono tabular-nums leading-none"
                      style={{ color: scoreColor(avgScore) }}>{avgScore}</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--t-dim)' }}>/ 100</span>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--s4)' }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${avgScore}%`, background: `linear-gradient(90deg, ${scoreColor(avgScore)}88, ${scoreColor(avgScore)})` }} />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    {[
                      { label: 'DOMAINS', v: areas.length },
                      { label: 'ACTIVE', v: areasWithTasks },
                      { label: 'MILESTONES', v: `${doneMilestones}/${totalMilestones}` },
                    ].map(s => (
                      <div key={s.label} className="text-center">
                        <div className="text-sm font-black font-mono" style={{ color: gold }}>{s.v}</div>
                        <div className="text-[8px] tracking-wider" style={{ color: 'var(--t-faint)' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Area mini bars */}
              {areas.length > 0 && (
                <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: 'var(--b)' }}>
                  {areas.map(a => (
                    <div key={a.id} className="flex items-center gap-2">
                      <span className="text-sm w-5 shrink-0">{a.icon}</span>
                      <span className="text-[10px] w-24 truncate shrink-0" style={{ color: 'var(--t-muted)' }}>{a.name}</span>
                      <div className="flex-1 h-1 rounded-full" style={{ background: 'var(--s4)' }}>
                        <div className="h-1 rounded-full transition-all duration-500"
                          style={{ width: `${a.displayScore}%`, background: a.color }} />
                      </div>
                      <span className="text-[10px] font-mono tabular-nums w-7 text-right shrink-0"
                        style={{ color: scoreColor(a.displayScore) }}>{a.displayScore}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add area */}
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black tracking-widest" style={{ color: gold, opacity: 0.7 }}>// DOMAIN ARSENAL</span>
              <button onClick={() => setShowAdd(s => !s)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold tap"
                style={{ background: `${gold}15`, color: gold, border: `1px solid ${gold}30` }}>
                <Plus size={12} /> Add Domain
              </button>
            </div>

            {showAdd && (
              <div className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--s1)', border: `1px solid ${gold}25` }}>
                <input autoFocus placeholder="Domain name (e.g. Mental Health)" value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: 'var(--s3)', border: `1px solid ${gold}20`, color: 'var(--t-head)' }} />
                <div>
                  <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: 'var(--t-faint)' }}>ICON</p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_ICONS.map(i => (
                      <button key={i} onClick={() => setNewIcon(i)}
                        className="text-xl p-1 rounded-lg transition-all tap"
                        style={{ background: newIcon === i ? 'var(--s3)' : 'transparent',
                          outline: newIcon === i ? `2px solid ${gold}` : 'none' }}>{i}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: 'var(--t-faint)' }}>COLOR</p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map(c => (
                      <button key={c} onClick={() => setNewColor(c)}
                        className="w-6 h-6 rounded-full transition-all tap"
                        style={{ background: c, outline: newColor === c ? '2px solid #fff' : 'none', outlineOffset: 2 }} />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm" style={{ color: 'var(--t-muted)' }}>Cancel</button>
                  <button onClick={addArea} disabled={!newName.trim()}
                    className="px-4 py-1.5 text-sm rounded-lg font-bold disabled:opacity-50"
                    style={{ background: gold, color: '#000' }}>Add</button>
                </div>
              </div>
            )}

            {/* Area cards */}
            <div className="space-y-3">
              {areas.map(area => (
                <AreaCard key={area.id} area={area} onUpdate={updateAreaLocal} onDelete={deleteArea} />
              ))}
              {areas.length === 0 && (
                <div className="rounded-xl py-12 text-center" style={{ border: '1px dashed var(--b)' }}>
                  <div className="text-3xl mb-2">🎯</div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--t-muted)' }}>No domains yet</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--t-faint)' }}>Add a life domain to start tracking</p>
                </div>
              )}
            </div>
          </div>

          {/* ════════ RIGHT SIDEBAR ════════ */}
          <div className="space-y-4">

            {/* STAT GRID */}
            {me && (
              <div className="rounded-xl p-4"
                style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={13} style={{ color: gold }} />
                  <span className="text-[9px] font-black tracking-widest" style={{ color: gold, opacity: 0.8 }}>LIVE STATS</span>
                  <span className="text-[8px] font-mono ml-auto" style={{ color: 'var(--t-faint)' }}>auto-tracked</span>
                </div>
                <div className="space-y-3">
                  {Object.entries(me.stats).map(([k, v]) => (
                    <StatBar key={k} statKey={k} value={v} />
                  ))}
                </div>
                <p className="text-[8px] font-mono mt-3 text-center" style={{ color: 'var(--t-faint)' }}>
                  updates as you log workouts · sleep · habits · tasks
                </p>
              </div>
            )}

            {/* MERIT BREAKDOWN */}
            {me && (
              <div className="rounded-xl p-4"
                style={{ background: 'var(--s1)', border: `1px solid ${me.rankColor}20` }}>
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={13} style={{ color: me.rankColor }} />
                  <span className="text-[9px] font-black tracking-widest" style={{ color: me.rankColor, opacity: 0.9 }}>MERIT BREAKDOWN</span>
                </div>
                <div className="space-y-2.5">
                  {[
                    { label: 'STATS SCORE', val: me.meritBreakdown.statScore, max: 60, color: '#a855f7' },
                    { label: 'SKILLS SCORE', val: me.meritBreakdown.skillScore, max: 20, color: '#0ea5e9' },
                    { label: 'CLAIMS SCORE', val: me.meritBreakdown.claimScore, max: 10, color: '#22c55e' },
                    { label: 'POINTS SCORE', val: me.meritBreakdown.ptsScore, max: 10, color: gold },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[9px] font-bold" style={{ color: 'var(--t-dim)' }}>{item.label}</span>
                        <span className="text-[9px] font-mono font-black" style={{ color: item.color }}>
                          {item.val}<span style={{ color: 'var(--t-faint)' }}>/{item.max}</span>
                        </span>
                      </div>
                      <div className="h-1 rounded-full" style={{ background: 'var(--s4)' }}>
                        <div className="h-1 rounded-full transition-all duration-700"
                          style={{ width: `${(item.val / item.max) * 100}%`, background: item.color }} />
                      </div>
                    </div>
                  ))}
                </div>
                {me.nextRank && (
                  <div className="mt-3 pt-3 border-t text-center" style={{ borderColor: 'var(--b)' }}>
                    <p className="text-[9px]" style={{ color: 'var(--t-faint)' }}>
                      Need <span style={{ color: me.nextRank.color, fontWeight: 700 }}>{me.nextRank.min - me.meritScore} more pts</span> for{' '}
                      <span style={{ color: me.nextRank.color, fontWeight: 700 }}>{me.nextRank.rank}-Rank</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* PULSE: habit + task summary */}
            {me && (
              <div className="rounded-xl p-4"
                style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={13} style={{ color: '#f97316' }} />
                  <span className="text-[9px] font-black tracking-widest" style={{ color: '#f97316', opacity: 0.9 }}>ACTIVITY PULSE</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'DISCIPLINE', value: me.stats.discipline, unit: '%', hint: 'habits/week', color: '#f97316' },
                    { label: 'FOCUS', value: me.stats.focus, unit: '%', hint: 'tasks/month', color: '#a855f7' },
                    { label: 'STRENGTH', value: me.stats.strength, unit: '%', hint: 'workouts', color: '#ef4444' },
                    { label: 'VITALITY', value: me.stats.vitality, unit: '%', hint: 'sleep quality', color: '#22c55e' },
                  ].map(item => (
                    <div key={item.label} className="rounded-lg px-3 py-2.5 text-center"
                      style={{ background: `${item.color}10`, border: `1px solid ${item.color}20` }}>
                      <div className="text-xl font-black font-mono tabular-nums" style={{ color: item.color }}>{item.value}</div>
                      <div className="text-[8px] font-black tracking-wider mt-0.5" style={{ color: 'var(--t-dim)' }}>{item.label}</div>
                      <div className="text-[8px]" style={{ color: 'var(--t-faint)' }}>{item.hint}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* JOURNAL activity */}
            {areas.some(a => a.journalMentions > 0) && (
              <div className="rounded-xl p-4"
                style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen size={13} style={{ color: '#a855f7' }} />
                  <span className="text-[9px] font-black tracking-widest" style={{ color: '#a855f7', opacity: 0.9 }}>JOURNAL SIGNAL</span>
                </div>
                <div className="space-y-1.5">
                  {areas.filter(a => a.journalMentions > 0).sort((a, b) => b.journalMentions - a.journalMentions).map(a => (
                    <div key={a.id} className="flex items-center gap-2">
                      <span className="text-xs">{a.icon}</span>
                      <span className="text-xs flex-1 truncate" style={{ color: 'var(--t-muted)' }}>{a.name}</span>
                      <div className="w-16 h-1 rounded-full" style={{ background: 'var(--s4)' }}>
                        <div className="h-1 rounded-full" style={{ width: `${Math.min(100, a.journalMentions * 10)}%`, background: '#a855f7' }} />
                      </div>
                      <span className="text-[10px] font-mono w-4 text-right" style={{ color: '#a855f7' }}>×{a.journalMentions}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[8px] font-mono mt-2" style={{ color: 'var(--t-faint)' }}>mentions in last 30 days of journal</p>
              </div>
            )}

            {/* MILESTONES quick view */}
            {totalMilestones > 0 && (
              <div className="rounded-xl p-4"
                style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Star size={13} style={{ color: gold }} />
                  <span className="text-[9px] font-black tracking-widest" style={{ color: gold, opacity: 0.9 }}>MILESTONE STATUS</span>
                  <span className="ml-auto font-mono text-xs font-black" style={{ color: gold }}>
                    {doneMilestones}/{totalMilestones}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'var(--s4)' }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${totalMilestones > 0 ? Math.round((doneMilestones / totalMilestones) * 100) : 0}%`,
                      background: `linear-gradient(90deg, ${gold}88, ${gold})` }} />
                </div>
                <p className="text-[9px] text-center" style={{ color: 'var(--t-faint)' }}>
                  {Math.round((doneMilestones / totalMilestones) * 100)}% complete across all domains
                </p>
              </div>
            )}

          </div>{/* end sidebar */}
        </div>{/* end main layout */}

      </div>{/* end zIndex wrapper */}
    </div>
  );
}
