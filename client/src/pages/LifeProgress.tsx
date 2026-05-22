import { useEffect, useRef, useState, useCallback } from 'react';
import { Send, Plus, X, Check, Settings2, Sparkles } from 'lucide-react';
import api from '../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface Recommendation {
  title: string;
  due_date: string;
  priority: 'low' | 'medium' | 'high';
  life_area_id: number | null;
  rationale: string;
}

interface ChatMessage {
  role: 'user' | 'manager';
  content: string;
  ts: string;
  recommendations?: Recommendation[];
}

interface Sector {
  id: number;
  name: string;
  icon: string;
  color: string;
  fillPct: number;
  total: number;
  done: number;
}

// ── Fill animation hook ───────────────────────────────────────────────────────

function useFillAnimate(sectors: Sector[]) {
  const [fills, setFills] = useState<Record<number, number>>({});
  useEffect(() => {
    if (!sectors.length) return;
    const zeros: Record<number, number> = {};
    sectors.forEach(s => { zeros[s.id] = 0; });
    setFills(zeros);
    sectors.forEach((s, i) => {
      setTimeout(() => {
        setFills(prev => ({ ...prev, [s.id]: s.fillPct }));
      }, 80 + i * 60);
    });
  }, [sectors]);
  return fills;
}

// ── Priority badge ────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  low:    '#6366f1',
  medium: '#f59e0b',
  high:   '#ef4444',
};

function PriorityBadge({ p }: { p: string }) {
  return (
    <span className="text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded-full"
      style={{
        background: `${PRIORITY_COLORS[p] ?? '#6366f1'}20`,
        color: PRIORITY_COLORS[p] ?? '#6366f1',
        border: `1px solid ${PRIORITY_COLORS[p] ?? '#6366f1'}40`,
      }}>
      {p}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LifeProgress() {
  const [history, setHistory]       = useState<ChatMessage[]>([]);
  const [sectors, setSectors]       = useState<Sector[]>([]);
  const [input, setInput]           = useState('');
  const [sending, setSending]       = useState(false);
  const [loaded, setLoaded]         = useState(false);
  const [accepted, setAccepted]     = useState<Set<string>>(new Set());
  const [skipped, setSkipped]       = useState<Set<string>>(new Set());

  // Inline add-task on sector card
  const [addingTo, setAddingTo]     = useState<Sector | null>(null);
  const [taskTitle, setTaskTitle]   = useState('');
  const [savingTask, setSavingTask] = useState(false);

  // Edit sector
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [editName, setEditName]     = useState('');
  const [editIcon, setEditIcon]     = useState('');
  const [editProgress, setEditProgress] = useState<number | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const fills      = useFillAnimate(sectors);

  // ── Load on mount ──────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    try {
      const r = await api.get<{ history: ChatMessage[]; sectors: Sector[] }>('/life/chat/history');
      setHistory(r.data.history);
      setSectors(r.data.sectors);
    } catch (_) {}
    setLoaded(true);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // ── Send message ───────────────────────────────────────────────────────────

  async function send() {
    const msg = input.trim();
    if (!msg || sending) return;
    setSending(true);
    setInput('');

    // Optimistic user bubble
    const optimistic: ChatMessage = { role: 'user', content: msg, ts: new Date().toISOString() };
    setHistory(prev => [...prev, optimistic]);

    try {
      const r = await api.post<{
        reply: string;
        recommendations: Recommendation[];
        sectors: Sector[];
        history: ChatMessage[];
      }>('/life/chat', { message: msg });
      setHistory(r.data.history);
      setSectors(r.data.sectors);
    } catch (_) {
      setHistory(prev => prev.filter(m => m !== optimistic));
      setInput(msg);
    }
    setSending(false);
    inputRef.current?.focus();
  }

  // ── Accept recommendation ──────────────────────────────────────────────────

  async function acceptRec(rec: Recommendation, key: string) {
    setAccepted(prev => new Set(prev).add(key));
    try {
      await api.post('/tasks', {
        title:        rec.title,
        due_date:     rec.due_date,
        priority:     rec.priority,
        life_area_id: rec.life_area_id,
      });
      const r = await api.get<{ history: ChatMessage[]; sectors: Sector[] }>('/life/chat/history');
      setSectors(r.data.sectors);
    } catch (_) {
      setAccepted(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }

  // ── Inline add task ────────────────────────────────────────────────────────

  async function addTask() {
    if (!addingTo || !taskTitle.trim()) return;
    setSavingTask(true);
    try {
      await api.post('/tasks', { title: taskTitle.trim(), priority: 'medium', life_area_id: addingTo.id });
      setTaskTitle('');
      setAddingTo(null);
      const r = await api.get<{ history: ChatMessage[]; sectors: Sector[] }>('/life/chat/history');
      setSectors(r.data.sectors);
    } catch (_) {}
    setSavingTask(false);
  }

  // ── Edit / delete sector ───────────────────────────────────────────────────

  function startEdit(s: Sector) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditIcon(s.icon);
    setEditProgress(null); // null = use auto-computed
  }

  async function saveEdit(id: number) {
    if (!editName.trim()) return;
    setSavingEdit(true);
    try {
      // progress: null clears manual override (auto mode); 0 also resets
      const progressVal = editProgress !== null ? editProgress : null;
      await api.patch(`/life/areas/${id}`, {
        name: editName.trim(),
        icon: editIcon.trim() || undefined,
        progress: progressVal,
      });
      setSectors(prev => prev.map(s =>
        s.id === id
          ? { ...s, name: editName.trim(), icon: editIcon.trim() || s.icon,
              fillPct: progressVal !== null ? progressVal : s.fillPct }
          : s
      ));
      setEditingId(null);
    } catch (_) {}
    setSavingEdit(false);
  }

  async function deleteSector(id: number) {
    setDeletingId(id);
    try {
      await api.delete(`/life/areas/${id}`);
      setTimeout(() => { setSectors(prev => prev.filter(s => s.id !== id)); setDeletingId(null); }, 350);
    } catch (_) { setDeletingId(null); }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function recKey(msgTs: string, recTitle: string) { return `${msgTs}::${recTitle}`; }

  function fillOpacity(pct: number) {
    return pct === 0 ? 0.06 : 0.12 + (pct / 100) * 0.52;
  }

  function glowStyle(pct: number, color: string) {
    if (pct < 5) return 'none';
    const alpha = Math.round((pct / 100) * 55).toString(16).padStart(2, '0');
    return `0 0 ${10 + pct / 6}px ${color}${alpha}`;
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  const hasSectors = sectors.length > 0;
  const hasHistory = history.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-6 anim-page pb-10">

      <div className="page-header flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex items-center justify-center rounded-2xl"
            style={{ width: 44, height: 44, background: '#a855f715', border: '1px solid #a855f725' }}>
            <Sparkles size={22} style={{ color: '#a855f7' }} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-head tracking-tight">Life Path</h1>
            <p className="text-xs text-muted mt-0.5">Goals · AXIS life manager</p>
          </div>
        </div>
      </div>

      {/* ── SPLIT: chat (left) + sectors (right) ── */}
      <div className="flex flex-col lg:flex-row gap-5" style={{ alignItems: 'flex-start' }}>

        {/* ── CHAT PANEL ── */}
        <div className="flex flex-col rounded-2xl overflow-hidden flex-1 min-w-0"
          style={{ background: 'var(--s1)', border: '1px solid var(--b)', minHeight: 520 }}>

          {/* Chat header bar */}
          <div className="px-4 py-3 flex items-center gap-2"
            style={{ borderBottom: '1px solid var(--b)', background: 'var(--s2)' }}>
            <span className="text-sm font-black" style={{ color: '#a855f7' }}>AXIS</span>
            <span className="text-xs ml-auto" style={{ color: 'var(--t-faint)' }}>your life manager</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ maxHeight: 440 }}>

            {loaded && !hasHistory && !sending && (
              <div className="flex flex-col items-center justify-center text-center py-12 space-y-3">
                <p className="text-4xl" style={{ opacity: 0.2 }}>⚡</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--t-muted)' }}>Tell AXIS what you're working toward</p>
                <p className="text-xs max-w-xs leading-relaxed" style={{ color: 'var(--t-faint)' }}>
                  Write freely — goals, plans, struggles. AXIS reads your data and queues tasks that actually move things forward.
                </p>
              </div>
            )}

            {history.map((msg, i) => {
              const isManager = msg.role === 'manager';
              return (
                <div key={i} className={`flex ${isManager ? 'justify-start' : 'justify-end'}`}>
                  <div style={{ maxWidth: '84%' }}>

                    {/* Bubble */}
                    <div className="rounded-2xl px-4 py-3 leading-relaxed"
                      style={{
                        background: isManager ? 'var(--s2)' : 'var(--s3)',
                        borderLeft: isManager ? '2px solid #a855f760' : 'none',
                        color: 'var(--t-body)',
                        fontFamily: isManager ? 'monospace' : 'inherit',
                        fontSize: isManager ? 12 : 13,
                      }}>
                      {isManager && (
                        <span className="text-[9px] font-black tracking-widest block mb-1.5" style={{ color: '#a855f7', opacity: 0.7 }}>
                          AXIS //
                        </span>
                      )}
                      {msg.content}
                    </div>

                    {/* Recommendations */}
                    {isManager && msg.recommendations && msg.recommendations.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {msg.recommendations.map(rec => {
                          const key     = recKey(msg.ts, rec.title);
                          const isDone  = accepted.has(key);
                          const isSkip  = skipped.has(key);
                          if (isSkip) return null;
                          return (
                            <div key={key}
                              className="rounded-xl px-3 py-2.5 flex items-start gap-2"
                              style={{
                                background: isDone ? '#16a34a18' : 'var(--s1)',
                                border: `1px solid ${isDone ? '#16a34a40' : 'var(--b)'}`,
                                opacity: isDone ? 0.7 : 1,
                                transition: 'all 0.25s',
                              }}>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold" style={{ color: isDone ? '#4ade80' : 'var(--t-head)' }}>
                                  {isDone && '✓ '}{rec.title}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <PriorityBadge p={rec.priority} />
                                  <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>due {formatDate(rec.due_date)}</span>
                                  {rec.rationale && (
                                    <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>· {rec.rationale}</span>
                                  )}
                                </div>
                              </div>
                              {!isDone && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button onClick={() => acceptRec(rec, key)}
                                    className="text-[10px] font-bold px-2 py-1 rounded-lg tap text-white"
                                    style={{ background: '#16a34a' }}>
                                    ✓ Add
                                  </button>
                                  <button onClick={() => setSkipped(prev => new Set(prev).add(key))}
                                    className="w-6 h-6 rounded-lg flex items-center justify-center tap"
                                    style={{ background: 'var(--s3)', color: 'var(--t-faint)' }}>
                                    <X size={10} />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <p className="text-[9px] mt-1 px-1"
                      style={{ color: 'var(--t-faint)', textAlign: isManager ? 'left' : 'right' }}>
                      {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-3 text-xs font-mono"
                  style={{ background: 'var(--s2)', borderLeft: '2px solid #a855f760', color: '#a855f7' }}>
                  <span className="opacity-60">AXIS //</span>
                  <span className="ml-2 animate-pulse">analyzing...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input row */}
          <div className="px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--b)' }}>
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Tell AXIS what you want to work on…"
                rows={2}
                className="flex-1 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none"
                style={{
                  background: 'var(--s2)',
                  border: '1px solid var(--b)',
                  color: 'var(--t-body)',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#a855f760'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--b)'; }}
              />
              <button onClick={send} disabled={!input.trim() || sending}
                className="w-9 h-9 rounded-xl flex items-center justify-center tap disabled:opacity-30 shrink-0 text-white"
                style={{ background: 'rgb(var(--accent-rgb))' }}>
                {sending
                  ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  : <Send size={14} />}
              </button>
            </div>
            <p className="text-[9px] mt-1.5 px-1" style={{ color: 'var(--t-faint)' }}>↵ send · shift+↵ newline</p>
          </div>
        </div>

        {/* ── SECTOR GRID ── */}
        <div style={{ width: '100%', maxWidth: 340, flexShrink: 0 }}>
          {hasSectors ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-black tracking-widest uppercase" style={{ color: 'var(--t-faint)' }}>
                  // {sectors.length} sector{sectors.length !== 1 ? 's' : ''}
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--b)' }} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {sectors.map(sector => {
                  const fill     = fills[sector.id] ?? 0;
                  const isGhost  = fill === 0;
                  const isFull   = fill >= 100;
                  const isEdit   = editingId === sector.id;
                  const isDel    = deletingId === sector.id;
                  const isAdding = addingTo?.id === sector.id;

                  return (
                    <div key={sector.id}
                      className="relative overflow-hidden rounded-2xl flex flex-col"
                      style={{
                        background: 'var(--s1)',
                        border: `1px solid ${isGhost ? `${sector.color}20` : `${sector.color}45`}`,
                        minHeight: 150,
                        boxShadow: isGhost ? 'none' : glowStyle(fill, sector.color),
                        opacity: isDel ? 0 : 1,
                        transform: isDel ? 'scale(0.95)' : 'scale(1)',
                        transition: 'box-shadow 0.6s, border-color 0.6s, opacity 0.3s, transform 0.3s',
                      }}>

                      {/* Water fill */}
                      <div aria-hidden style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        height: `${fill}%`,
                        background: `linear-gradient(to top,
                          ${sector.color}${Math.round(fillOpacity(fill) * 255).toString(16).padStart(2,'0')},
                          ${sector.color}${Math.round(fillOpacity(fill) * 0.45 * 255).toString(16).padStart(2,'0')})`,
                        transition: 'height 1.2s cubic-bezier(0.34,1.2,0.64,1)',
                        pointerEvents: 'none',
                      }} />

                      {isGhost && (
                        <div aria-hidden style={{ position: 'absolute', inset: 0, background: `${sector.color}07`, pointerEvents: 'none' }} />
                      )}

                      <div className="relative z-10 flex flex-col flex-1 p-3 gap-2">

                        {/* Top row */}
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-xl leading-none"
                            style={{
                              opacity: isGhost ? 0.3 : 0.9,
                              filter: isGhost ? 'none' : `drop-shadow(0 0 4px ${sector.color}70)`,
                              transition: 'opacity 0.5s, filter 0.5s',
                            }}>
                            {sector.icon}
                          </span>
                          <div className="flex items-center gap-1 ml-auto">
                            <span className="text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded-full"
                              style={{
                                background: isGhost ? 'var(--s3)' : `${sector.color}20`,
                                color: isGhost ? 'var(--t-faint)' : sector.color,
                                border: `1px solid ${isGhost ? 'var(--b)' : `${sector.color}40`}`,
                                transition: 'all 0.4s',
                              }}>
                              {fill}%
                            </span>
                            {/* Always-visible controls — no hover required (works on mobile) */}
                            {!isEdit && !isAdding && (
                              <>
                                <button onClick={() => startEdit(sector)}
                                  className="w-6 h-6 rounded-md flex items-center justify-center tap"
                                  style={{ background: 'var(--s3)', color: 'var(--t-faint)' }}
                                  title="Edit sector">
                                  <Settings2 size={10} />
                                </button>
                                <button onClick={() => deleteSector(sector.id)}
                                  className="w-6 h-6 rounded-md flex items-center justify-center tap"
                                  style={{ background: 'var(--s3)', color: '#f87171' }}
                                  title="Delete sector">
                                  <X size={10} />
                                </button>
                              </>
                            )}
                            {isEdit && (
                              <button onClick={() => setEditingId(null)}
                                className="w-6 h-6 rounded-md flex items-center justify-center tap"
                                style={{ background: `${sector.color}25`, color: sector.color }}>
                                <X size={10} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Name / edit */}
                        {isEdit ? (
                          <div className="space-y-1.5">
                            <div className="flex gap-1">
                              <input autoFocus value={editIcon} onChange={e => setEditIcon(e.target.value)}
                                className="w-9 rounded-lg px-1 py-1 text-sm text-center focus:outline-none"
                                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: `1px solid ${sector.color}40` }}
                                placeholder="🎯" />
                              <input value={editName} onChange={e => setEditName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(sector.id); if (e.key === 'Escape') setEditingId(null); }}
                                className="flex-1 rounded-lg px-2 py-1 text-xs focus:outline-none"
                                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: `1px solid ${sector.color}40` }} />
                            </div>
                            {/* Manual fill % override */}
                            <div>
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>
                                  fill %
                                </span>
                                <span className="text-[9px] font-bold" style={{ color: sector.color }}>
                                  {editProgress !== null ? editProgress : sector.fillPct}%
                                  {editProgress === null && <span style={{ color: 'var(--t-faint)' }}> (auto)</span>}
                                </span>
                              </div>
                              <input
                                type="range" min={0} max={100} step={1}
                                value={editProgress !== null ? editProgress : sector.fillPct}
                                onChange={e => setEditProgress(Number(e.target.value))}
                                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                                style={{ accentColor: sector.color }}
                              />
                              {editProgress !== null && (
                                <button onClick={() => setEditProgress(null)}
                                  className="text-[9px] tap mt-0.5" style={{ color: 'var(--t-faint)' }}>
                                  reset to auto
                                </button>
                              )}
                            </div>
                            <button onClick={() => saveEdit(sector.id)} disabled={!editName.trim() || savingEdit}
                              className="flex items-center gap-1 text-[10px] font-bold tap px-2 py-1 rounded-lg disabled:opacity-40 text-white"
                              style={{ background: sector.color }}>
                              {savingEdit ? '…' : <><Check size={9} /> Save</>}
                            </button>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs font-bold leading-snug"
                              style={{ color: isGhost ? 'var(--t-faint)' : 'var(--t-head)', transition: 'color 0.4s' }}>
                              {sector.name}
                            </p>
                            {isFull && <p className="text-[9px] font-bold mt-0.5" style={{ color: sector.color }}>✦ Complete</p>}
                          </div>
                        )}

                        <div className="flex-1" />

                        {/* Stats + quick add */}
                        {!isEdit && (
                          <>
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>
                                {sector.total === 0 ? 'No tasks' : `${sector.done}/${sector.total} done`}
                              </span>
                              {!isAdding && (
                                <button onClick={() => { setAddingTo(sector); setTaskTitle(''); }}
                                  className="flex items-center gap-0.5 text-[9px] font-bold tap px-1.5 py-0.5 rounded-lg shrink-0"
                                  style={{ background: `${sector.color}14`, color: sector.color, border: `1px solid ${sector.color}30` }}>
                                  <Plus size={8} /> Task
                                </button>
                              )}
                            </div>

                            {isAdding && (
                              <div className="flex gap-1">
                                <input autoFocus value={taskTitle}
                                  onChange={e => setTaskTitle(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAddingTo(null); }}
                                  placeholder="Task name…"
                                  className="flex-1 rounded-lg px-2 py-1 text-[10px] focus:outline-none"
                                  style={{ background: 'var(--s3)', color: 'var(--t-head)', border: `1px solid ${sector.color}40` }} />
                                <button onClick={addTask} disabled={!taskTitle.trim() || savingTask}
                                  className="px-1.5 py-1 rounded-lg text-[10px] font-bold tap disabled:opacity-40 text-white"
                                  style={{ background: sector.color }}>
                                  {savingTask ? '…' : '↵'}
                                </button>
                                <button onClick={() => setAddingTo(null)}
                                  className="px-1 py-1 rounded-lg tap"
                                  style={{ color: 'var(--t-faint)', background: 'var(--s3)' }}>
                                  <X size={9} />
                                </button>
                              </div>
                            )}
                          </>
                        )}

                        {/* Progress bar */}
                        <div className="w-full h-[2px] rounded-full overflow-hidden" style={{ background: 'var(--s3)' }}>
                          <div style={{
                            height: '100%',
                            width: `${fill}%`,
                            background: sector.color,
                            borderRadius: 99,
                            transition: 'width 1.2s cubic-bezier(0.34,1.2,0.64,1)',
                          }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            loaded && (
              <div className="flex flex-col items-center justify-center text-center py-14 rounded-2xl space-y-2"
                style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
                <p className="text-3xl" style={{ opacity: 0.2 }}>🗺️</p>
                <p className="text-xs font-semibold" style={{ color: 'var(--t-muted)' }}>Sectors appear here</p>
                <p className="text-[10px]" style={{ color: 'var(--t-faint)' }}>Send a message to get started</p>
              </div>
            )
          )}
        </div>

      </div>
    </div>
  );
}
