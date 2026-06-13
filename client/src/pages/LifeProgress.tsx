import { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, X, Check, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import api from '../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface Goal {
  id: number;
  title: string;
  description: string;
  type: 'long_term' | 'short_term';
  status: 'active' | 'done' | 'paused';
  color: string;
  sort_order: number;
  created_at: string;
}

type NoteSection = 'pros_cons' | 'scripts' | 'topics' | 'free';

// ── Constants ────────────────────────────────────────────────────────────────

const PALETTE = ['#d97757', '#d9a066', '#c2553d', '#cf8a3e', '#b5764f', '#e59a7f'];

const TABS: { id: NoteSection; label: string; hint: string }[] = [
  { id: 'pros_cons', label: 'Pros & Cons',  hint: 'Weigh it out. What plays for you, what plays against you.' },
  { id: 'scripts',   label: 'Scripts',      hint: 'Write it before you say it — reels, pitches, talks.' },
  { id: 'topics',    label: 'Topics',       hint: 'Things to research, explore, or dig into.' },
  { id: 'free',      label: 'Free notes',   hint: 'No format. Just write.' },
];

// ── Tiny helpers ─────────────────────────────────────────────────────────────

function ColorDot({ color, active, onClick }: { color: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap shrink-0 rounded-full transition-transform"
      style={{
        width: active ? 18 : 14,
        height: active ? 18 : 14,
        background: color,
        border: active ? `2px solid rgba(245,243,235,0.55)` : '2px solid transparent',
        boxShadow: active ? `0 0 6px ${color}80` : 'none',
      }}
    />
  );
}

// ── Goal Row ─────────────────────────────────────────────────────────────────

function GoalRow({
  goal, onToggle, onDelete, onUpdate,
}: {
  goal: Goal;
  onToggle: (id: number, status: Goal['status']) => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, changes: Partial<Goal>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [desc, setDesc]   = useState(goal.description || '');
  const [color, setColor] = useState(goal.color);
  const [, setShowPalette] = useState(false);
  const done = goal.status === 'done';

  function saveEdit() {
    if (!title.trim()) return;
    onUpdate(goal.id, { title: title.trim(), description: desc.trim(), color });
    setEditing(false);
    setShowPalette(false);
  }

  if (editing) {
    return (
      <div className="px-4 py-3 space-y-2 paper-in"
        style={{ borderBottom: '1px solid var(--b)', background: 'var(--s2)' }}>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
          className="w-full rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none"
          style={{ background: 'var(--s3)', color: 'var(--t-head)', border: `1.5px solid ${color}55` }}
          placeholder="Goal title…"
        />
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          rows={2}
          className="w-full rounded-lg px-3 py-1.5 text-xs resize-none focus:outline-none"
          style={{ background: 'var(--s3)', color: 'var(--t-muted)', border: '1px solid var(--b)' }}
          placeholder="Add a description (optional)…"
        />
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 flex-1">
            {PALETTE.map(c => (
              <ColorDot key={c} color={c} active={color === c} onClick={() => setColor(c)} />
            ))}
          </div>
          <button onClick={saveEdit}
            className="tap text-[11px] font-bold px-3 py-1 rounded-lg text-white"
            style={{ background: color }}>
            <Check size={11} className="inline mr-1" />Save
          </button>
          <button onClick={() => setEditing(false)}
            className="tap text-[11px] px-2 py-1 rounded-lg"
            style={{ background: 'var(--s3)', color: 'var(--t-faint)' }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 px-4 py-3 paper-in"
      style={{ borderBottom: '1px solid var(--b)', opacity: done ? 0.65 : 1, transition: 'opacity 0.2s' }}>

      {/* Toggle done */}
      <button onClick={() => onToggle(goal.id, goal.status)} className="tap mt-0.5 shrink-0"
        title={done ? 'Mark active' : 'Mark done'}>
        <div className="w-4 h-4 rounded-full flex items-center justify-center"
          style={{
            background: done ? `${goal.color}22` : 'transparent',
            border: `2px solid ${goal.color}`,
            transition: 'all 0.18s',
          }}>
          {done && <div className="w-1.5 h-1.5 rounded-full" style={{ background: goal.color }} />}
        </div>
      </button>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold leading-snug"
          style={{
            color: done ? 'var(--t-faint)' : 'var(--t-head)',
            textDecoration: done ? 'line-through' : 'none',
          }}>
          {goal.title}
        </p>
        {goal.description && (
          <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--t-muted)' }}>
            {goal.description}
          </p>
        )}
      </div>

      {/* Controls — visible on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => setEditing(true)}
          className="tap w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: 'var(--s3)', color: 'var(--t-faint)' }} title="Edit">
          <Pencil size={9} />
        </button>
        <button onClick={() => onDelete(goal.id)}
          className="tap w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: 'var(--s3)', color: '#c2553d' }} title="Delete">
          <X size={9} />
        </button>
      </div>
    </div>
  );
}

// ── Goal Column ───────────────────────────────────────────────────────────────

function GoalColumn({
  type, label, subtitle, accent, goals, onToggle, onDelete, onUpdate, onCreate,
}: {
  type: 'long_term' | 'short_term';
  label: string;
  subtitle: string;
  accent: string;
  goals: Goal[];
  onToggle: (id: number, status: Goal['status']) => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, changes: Partial<Goal>) => void;
  onCreate: (title: string, description: string, type: 'long_term' | 'short_term', color: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc]   = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [showDone, setShowDone] = useState(false);

  const active = goals.filter(g => g.status !== 'done');
  const done   = goals.filter(g => g.status === 'done');

  function submit() {
    if (!newTitle.trim()) return;
    onCreate(newTitle.trim(), newDesc.trim(), type, newColor);
    setNewTitle(''); setNewDesc(''); setNewColor(PALETTE[0]); setAdding(false);
  }

  return (
    <div className="card-raised overflow-hidden paper-spine flex flex-col"
      style={{ border: `1.5px solid ${accent}35`, minHeight: 320 }}>

      {/* Column header */}
      <div className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: `2px solid ${accent}30`, background: `${accent}0a` }}>
        <div>
          <p className="text-[10px] font-black tracking-[0.22em] uppercase" style={{ color: accent }}>
            {label}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--t-faint)' }}>{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {active.length > 0 && (
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full"
              style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}35` }}>
              {active.length}
            </span>
          )}
          <button onClick={() => setAdding(!adding)}
            className="tap w-7 h-7 rounded-lg flex items-center justify-center text-white"
            style={{ background: adding ? 'var(--s3)' : accent }}
            title="Add goal">
            {adding ? <X size={12} /> : <Plus size={12} />}
          </button>
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div className="px-4 py-3 space-y-2 paper-in"
          style={{ borderBottom: `1px solid ${accent}25`, background: `${accent}07` }}>
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="What do you want to achieve?"
            className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--s2)', color: 'var(--t-head)', border: `1.5px solid ${accent}40` }}
          />
          <textarea
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            rows={2}
            placeholder="Why does this matter? (optional)"
            className="w-full rounded-xl px-3 py-2 text-xs resize-none focus:outline-none"
            style={{ background: 'var(--s2)', color: 'var(--t-muted)', border: '1px solid var(--b)' }}
          />
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5 flex-1">
              {PALETTE.map(c => (
                <ColorDot key={c} color={c} active={newColor === c} onClick={() => setNewColor(c)} />
              ))}
            </div>
            <button onClick={submit} disabled={!newTitle.trim()}
              className="tap text-[11px] font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-30"
              style={{ background: accent }}>
              Add
            </button>
          </div>
        </div>
      )}

      {/* Goals list */}
      <div className="flex-1 overflow-y-auto">
        {active.length === 0 && !adding && (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center mb-2"
              style={{ background: `${accent}12`, border: `1.5px dashed ${accent}40` }}>
              <Plus size={12} style={{ color: accent, opacity: 0.6 }} />
            </div>
            <p className="text-[12px] font-semibold" style={{ color: 'var(--t-faint)', fontFamily: "'Lora', serif", fontStyle: 'italic' }}>
              Nothing here yet
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--t-faint)' }}>
              Tap + to add your first {type === 'long_term' ? 'long-term' : 'short-term'} goal
            </p>
          </div>
        )}
        {active.map(g => (
          <GoalRow key={g.id} goal={g} onToggle={onToggle} onDelete={onDelete} onUpdate={onUpdate} />
        ))}
      </div>

      {/* Done section */}
      {done.length > 0 && (
        <div style={{ borderTop: `1px solid var(--b)` }}>
          <button onClick={() => setShowDone(!showDone)}
            className="tap w-full flex items-center justify-between px-4 py-2"
            style={{ background: 'var(--s2)' }}>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: 'var(--t-faint)' }}>
              Done · {done.length}
            </span>
            {showDone ? <ChevronUp size={12} style={{ color: 'var(--t-faint)' }} />
                      : <ChevronDown size={12} style={{ color: 'var(--t-faint)' }} />}
          </button>
          {showDone && done.map(g => (
            <GoalRow key={g.id} goal={g} onToggle={onToggle} onDelete={onDelete} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Scratchpad ────────────────────────────────────────────────────────────────

function Scratchpad() {
  const [activeTab, setActiveTab] = useState<NoteSection>('pros_cons');
  const [notes, setNotes] = useState<Record<NoteSection, string>>({
    pros_cons: '', scripts: '', topics: '', free: '',
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState<Set<NoteSection>>(new Set());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadTab(section: NoteSection) {
    if (loaded.has(section)) return;
    try {
      const r = await api.get<{ content: string }>(`/life/notes/${section}`);
      setNotes(prev => ({ ...prev, [section]: r.data.content || '' }));
      setLoaded(prev => new Set(prev).add(section));
    } catch (_) {
      setLoaded(prev => new Set(prev).add(section));
    }
  }

  useEffect(() => { void loadTab(activeTab); }, [activeTab]);

  function handleChange(val: string) {
    setNotes(prev => ({ ...prev, [activeTab]: val }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try { await api.put(`/life/notes/${activeTab}`, { content: val }); }
      catch (_) {}
      setSaving(false);
    }, 1400);
  }

  const wordCount = notes[activeTab].trim() ? notes[activeTab].trim().split(/\s+/).length : 0;
  const activeTabInfo = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="card-raised overflow-hidden fold-corner" style={{ border: '1.5px solid var(--gl-border-h)' }}>

      {/* Tab bar */}
      <div className="flex items-end gap-0 overflow-x-auto hide-scroll"
        style={{ borderBottom: '2px solid var(--b)', background: 'var(--s2)', paddingTop: 4 }}>
        {TABS.map(tab => {
          const active = tab.id === activeTab;
          return (
            <button key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="tap shrink-0 px-4 py-2.5 text-[11px] font-bold tracking-[0.1em] uppercase transition-colors relative"
              style={{
                color: active ? 'var(--accent)' : 'var(--t-faint)',
                background: active ? 'var(--s1)' : 'transparent',
                borderRadius: '10px 10px 0 0',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -2,
              }}>
              {tab.label}
            </button>
          );
        })}
        <div className="flex-1" />
        <div className="flex items-center gap-3 px-3 pb-2">
          {saving && <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>saving…</span>}
          {wordCount > 0 && <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>{wordCount}w</span>}
        </div>
      </div>

      {/* Hint */}
      <div className="px-5 pt-3 pb-0">
        <p className="text-[11px]" style={{ color: 'var(--t-faint)', fontFamily: "'Lora', serif", fontStyle: 'italic' }}>
          {activeTabInfo.hint}
        </p>
      </div>

      {/* Writing area */}
      <div className="relative paper-ruled mx-4 my-3 rounded-xl"
        style={{ background: 'var(--s1)', border: '1.5px solid var(--b)' }}>
        <textarea
          key={activeTab}
          value={notes[activeTab]}
          onChange={e => handleChange(e.target.value)}
          rows={14}
          placeholder={`Start writing here…`}
          className="w-full rounded-xl px-5 py-4 text-[14px] resize-none focus:outline-none"
          style={{
            background: 'transparent',
            color: 'var(--t-body)',
            border: 'none',
            boxShadow: 'none',
            fontFamily: "'Lora', Georgia, serif",
            lineHeight: '28px',
            caretColor: 'var(--accent)',
          }}
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LifeProgress() {
  const [goals, setGoals]   = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    try {
      const r = await api.get<Goal[]>('/life/goals');
      setGoals(r.data);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createGoal(title: string, description: string, type: 'long_term' | 'short_term', color: string) {
    try {
      const r = await api.post<Goal>('/life/goals', { title, description, type, color });
      setGoals(prev => [...prev, r.data]);
    } catch (_) {}
  }

  async function toggleGoal(id: number, current: Goal['status']) {
    const next: Goal['status'] = current === 'done' ? 'active' : 'done';
    setGoals(prev => prev.map(g => g.id === id ? { ...g, status: next } : g));
    try { await api.patch(`/life/goals/${id}`, { status: next }); }
    catch (_) { setGoals(prev => prev.map(g => g.id === id ? { ...g, status: current } : g)); }
  }

  async function deleteGoal(id: number) {
    setGoals(prev => prev.filter(g => g.id !== id));
    try { await api.delete(`/life/goals/${id}`); } catch (_) { void load(); }
  }

  async function updateGoal(id: number, changes: Partial<Goal>) {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...changes } : g));
    try { await api.patch(`/life/goals/${id}`, changes); }
    catch (_) { void load(); }
  }

  const longGoals  = goals.filter(g => g.type === 'long_term');
  const shortGoals = goals.filter(g => g.type === 'short_term');

  const totalActive = goals.filter(g => g.status !== 'done').length;
  const totalDone   = goals.filter(g => g.status === 'done').length;

  return (
    <div className="max-w-4xl mx-auto space-y-5 anim-page pb-10 px-1 sm:px-0">

      {/* ── HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl fold-corner"
        style={{ background: 'var(--hero-bg)', border: '1.5px solid var(--b)', minHeight: 110 }}>

        {/* Dot-grid texture */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(217,119,87,0.14) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

        {/* Corner brackets */}
        {([
          { top: 0,    left: 0,  borderTop: true,    borderLeft: true,   bottom: undefined, right: undefined,  borderBottom: false, borderRight: false },
          { top: 0,    right: 0, borderTop: true,    borderRight: true,  bottom: undefined, left: undefined,   borderBottom: false, borderLeft: false  },
          { bottom: 0, left: 0,  borderBottom: true, borderLeft: true,   top: undefined,    right: undefined,  borderTop: false,    borderRight: false },
          { bottom: 0, right: 0, borderBottom: true, borderRight: true,  top: undefined,    left: undefined,   borderTop: false,    borderLeft: false  },
        ] as Array<{ top?: number; bottom?: number; left?: number; right?: number; borderTop: boolean; borderBottom: boolean; borderLeft: boolean; borderRight: boolean }>).map((pos, i) => (
          <div key={i} className="absolute pointer-events-none"
            style={{
              width: 18, height: 18,
              top: pos.top, bottom: pos.bottom, left: pos.left, right: pos.right,
              borderTop:    pos.borderTop    ? '2px solid rgba(217,119,87,0.55)' : undefined,
              borderBottom: pos.borderBottom ? '2px solid rgba(217,119,87,0.55)' : undefined,
              borderLeft:   pos.borderLeft   ? '2px solid rgba(217,119,87,0.55)' : undefined,
              borderRight:  pos.borderRight  ? '2px solid rgba(217,119,87,0.55)' : undefined,
            }} />
        ))}

        <div className="relative z-10 px-6 py-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[9px] font-black tracking-[0.32em] uppercase mb-1.5"
              style={{ color: 'var(--accent)', opacity: 0.8 }}>Plot the journey</p>
            <h1 className="text-4xl font-bold leading-none" style={{ fontFamily: "'Lora', serif", color: 'var(--t-head)' }}>
              Life Path
            </h1>
            <p className="text-[11px] mt-2" style={{ color: 'var(--t-dim)' }}>
              Goals that pull you forward · a scratchpad for your thinking
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className="text-[10px] font-black tracking-widest px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(217,119,87,0.12)', color: 'var(--accent)', border: '1px solid rgba(217,119,87,0.28)' }}>
              {year}
            </span>
            {!loading && (totalActive + totalDone > 0) && (
              <div className="text-right">
                <p className="text-[11px] font-semibold" style={{ color: 'var(--t-muted)' }}>
                  {totalActive} active · {totalDone} done
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── GOALS ── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-black tracking-[0.22em] uppercase shrink-0"
            style={{ color: 'var(--t-muted)' }}>Goals</span>
          <div className="section-rule flex-1" />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <GoalColumn
            type="long_term"
            label="Long Term"
            subtitle="years · lifetime"
            accent="#d97757"
            goals={longGoals}
            onToggle={toggleGoal}
            onDelete={deleteGoal}
            onUpdate={updateGoal}
            onCreate={createGoal}
          />
          <GoalColumn
            type="short_term"
            label="Short Term"
            subtitle="weeks · months"
            accent="#d9a066"
            goals={shortGoals}
            onToggle={toggleGoal}
            onDelete={deleteGoal}
            onUpdate={updateGoal}
            onCreate={createGoal}
          />
        </div>
      </div>

      {/* ── SCRATCHPAD ── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-black tracking-[0.22em] uppercase shrink-0"
            style={{ color: 'var(--t-muted)' }}>Scratchpad</span>
          <div className="section-rule flex-1" />
          <span className="text-[10px]" style={{ color: 'var(--t-faint)', fontFamily: "'Lora', serif", fontStyle: 'italic' }}>
            auto-saves
          </span>
        </div>
        <Scratchpad />
      </div>
    </div>
  );
}
