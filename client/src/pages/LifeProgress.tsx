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
  progress: number;
  milestones: Milestone[];
}

const PRESET_ICONS = ['💪', '💼', '❤️', '💰', '📚', '🌱', '🎮', '🧘', '🎯', '✈️', '🎨', '🏠', '🧠', '🌍'];
const PRESET_COLORS = ['#22c55e', '#0ea5e9', '#f43f5e', '#f59e0b', '#a855f7', '#14b8a6', '#f97316', '#8b5cf6', '#6366f1', '#ec4899'];

function ProgressRing({ value, color, size = 56 }: { value: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#374151" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.5s ease' }} />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize={size < 50 ? 10 : 12} fontWeight="600">
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

  const done = milestones.filter(m => m.completed).length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <ProgressRing value={progress} color={area.color} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{area.icon}</span>
            <span className="font-semibold text-white text-sm">{area.name}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {milestones.length > 0 ? `${done}/${milestones.length} milestones` : 'No milestones yet'}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setEditing(e => !e)} className="p-1.5 text-gray-500 hover:text-brand-400 transition-colors">
            <Edit3 size={14} />
          </button>
          <button onClick={() => onDelete(area.id)} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors">
            <Trash2 size={14} />
          </button>
          <button onClick={() => setExpanded(e => !e)} className="p-1 text-gray-500">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {editing && (
        <div className="border-t border-gray-800 px-4 py-3 space-y-3 bg-gray-800/40">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Progress ({progress}%)</label>
            <input type="range" min={0} max={100} value={progress} onChange={e => setProgress(Number(e.target.value))}
              className="w-full accent-brand-500" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Vision — what does success look like?</label>
            <textarea value={vision} onChange={e => setVision(e.target.value)} rows={3} placeholder="Describe your vision for this area..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button onClick={saveVisionProgress} className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg font-medium">Save</button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="border-t border-gray-800 px-4 pb-4 pt-3 space-y-3">
          {area.vision && !editing && (
            <p className="text-xs text-gray-400 italic border-l-2 border-gray-700 pl-3">{area.vision}</p>
          )}

          {milestones.length > 0 && (
            <div className="space-y-1.5">
              {milestones.map(m => (
                <div key={m.id} className="flex items-center gap-3">
                  <button onClick={() => toggleMilestone(m)}
                    className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${m.completed ? 'bg-green-600 border-green-600' : 'border-gray-600 hover:border-green-500'}`}>
                    {m.completed === 1 && <Check size={10} className="text-white" />}
                  </button>
                  <span className={`text-sm flex-1 ${m.completed ? 'line-through text-gray-500' : 'text-gray-200'}`}>{m.title}</span>
                  {m.target_date && <span className="text-xs text-gray-500 shrink-0">{m.target_date}</span>}
                  <button onClick={() => deleteMilestone(m.id)} className="shrink-0 text-gray-700 hover:text-red-400 transition-colors"><X size={13} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input placeholder="Add milestone..." value={newMilestone}
              onChange={e => setNewMilestone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addMilestone()}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <button onClick={addMilestone} disabled={!newMilestone.trim()}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-sm rounded-lg transition-colors">
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LifeProgress() {
  const [areas, setAreas] = useState<LifeArea[]>([]);
  const [score, setScore] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('🎯');
  const [newColor, setNewColor] = useState('#6366f1');

  const fetchAreas = useCallback(async () => {
    const [areasRes, scoreRes] = await Promise.all([
      api.get<LifeArea[]>('/life/areas'),
      api.get<{ score: number }>('/life/score'),
    ]);
    setAreas(areasRes.data);
    setScore(scoreRes.data.score);
  }, []);

  useEffect(() => { fetchAreas(); }, [fetchAreas]);

  function updateAreaLocal(id: number, updates: Partial<LifeArea>) {
    setAreas(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    // Recalc score
    setAreas(prev => {
      const avg = Math.round(prev.reduce((s, a) => s + a.progress, 0) / prev.length);
      setScore(avg);
      return prev;
    });
  }

  async function deleteArea(id: number) {
    await api.delete(`/life/areas/${id}`);
    setAreas(prev => prev.filter(a => a.id !== id));
  }

  async function addArea() {
    if (!newName.trim()) return;
    const r = await api.post<LifeArea>('/life/areas', { name: newName, icon: newIcon, color: newColor });
    setAreas(prev => [...prev, { ...r.data, milestones: [] }]);
    setShowAdd(false); setNewName(''); setNewIcon('🎯'); setNewColor('#6366f1');
  }

  const overallColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="space-y-5">

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

      <h1 className="text-2xl font-bold text-white">Life Progress</h1>

      {/* Overall life score */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-5">
        <ProgressRing value={score} color={overallColor} size={80} />
        <div>
          <p className="text-lg font-bold text-white">Overall Life Score</p>
          <p className="text-sm text-gray-400 mt-0.5">Average across {areas.length} life areas</p>
          <p className="text-xs mt-2" style={{ color: overallColor }}>
            {score >= 70 ? 'Thriving — keep the momentum!' : score >= 40 ? 'Making progress — push further.' : 'Time to focus — choose one area to level up.'}
          </p>
        </div>
      </div>

      {/* Radar-style bar overview */}
      {areas.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2.5">
          {areas.map(a => (
            <div key={a.id} className="flex items-center gap-3">
              <span className="w-5 text-base shrink-0">{a.icon}</span>
              <span className="text-xs text-gray-300 w-28 shrink-0 truncate">{a.name}</span>
              <div className="flex-1 bg-gray-800 rounded-full h-2">
                <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${a.progress}%`, backgroundColor: a.color }} />
              </div>
              <span className="text-xs text-gray-400 w-8 text-right shrink-0">{a.progress}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Add area form */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">Life Areas</h2>
        <button onClick={() => setShowAdd(s => !s)}
          className="flex items-center gap-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
          <Plus size={13} /> Add area
        </button>
      </div>

      {showAdd && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <input autoFocus placeholder="Area name (e.g. Mental Health)" value={newName} onChange={e => setNewName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <div>
            <p className="text-xs text-gray-400 mb-2">Icon</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_ICONS.map(i => (
                <button key={i} onClick={() => setNewIcon(i)}
                  className={`text-xl p-1 rounded-lg transition-all ${newIcon === i ? 'bg-gray-700 ring-2 ring-brand-500 scale-110' : 'hover:bg-gray-800'}`}>{i}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-2">Color</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  className={`w-6 h-6 rounded-full transition-all ${newColor === c ? 'ring-2 ring-white scale-110' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button onClick={addArea} disabled={!newName.trim()}
              className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium">Add</button>
          </div>
        </div>
      )}

      {/* Area cards */}
      <div className="space-y-3">
        {areas.map(area => (
          <AreaCard key={area.id} area={area} onUpdate={updateAreaLocal} onDelete={deleteArea} />
        ))}
      </div>
    </div>
  );
}
