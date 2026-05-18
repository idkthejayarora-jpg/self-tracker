import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, RefreshCw, Zap, X, AlertCircle } from 'lucide-react';
import api from '../lib/api';

interface Sector {
  id: number;
  name: string;
  icon: string;
  color: string;
  fillPct: number;   // 0–100, driven by task completion
  total: number;
  done: number;
}

// Animate fill heights in: start at 0, step to actual value after mount
function useFillAnimate(sectors: Sector[]) {
  const [fills, setFills] = useState<Record<number, number>>({});
  useEffect(() => {
    if (!sectors.length) return;
    // First tick: all zeros
    const zeros: Record<number, number> = {};
    sectors.forEach(s => { zeros[s.id] = 0; });
    setFills(zeros);
    // Stagger each card's fill
    sectors.forEach((s, i) => {
      setTimeout(() => {
        setFills(prev => ({ ...prev, [s.id]: s.fillPct }));
      }, 120 + i * 80);
    });
  }, [sectors]);
  return fills;
}

const PLACEHOLDER = `I want to get fit and lose some weight. I've been meaning to learn German for ages — planning to move to Berlin eventually. Want to build a startup or at least a side product. Also want to get better at drawing and maybe start producing music. I need to sort out my finances, start investing. And travel more — Japan and Italy are at the top of the list. Really want to work on my discipline and build better habits.`;

export default function LifeProgress() {
  const [rawText, setRawText] = useState('');
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');

  // Quick-add task state
  const [addingTo, setAddingTo] = useState<Sector | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fills = useFillAnimate(sectors);

  const loadSectors = useCallback(async () => {
    try {
      const r = await api.get<{ sectors: Sector[]; rawText: string }>('/life/sectors');
      setSectors(r.data.sectors);
      if (r.data.rawText) setRawText(r.data.rawText);
    } catch (_) {}
    setLoaded(true);
  }, []);

  useEffect(() => { loadSectors(); }, [loadSectors]);

  async function detect() {
    if (!rawText.trim() || detecting) return;
    setDetecting(true);
    setErr('');
    try {
      await api.post('/life/detect-sectors', { text: rawText });
      await loadSectors();
    } catch (_) {
      setErr('Could not map sectors. Try again.');
    }
    setDetecting(false);
  }

  async function addTask() {
    if (!addingTo || !taskTitle.trim()) return;
    setSavingTask(true);
    try {
      await api.post('/tasks', {
        title: taskTitle.trim(),
        priority: 'medium',
        life_area_id: addingTo.id,
      });
      setTaskTitle('');
      setAddingTo(null);
      await loadSectors();
    } catch (_) {}
    setSavingTask(false);
  }

  // Fill visual helpers
  function fillOpacity(pct: number) {
    if (pct === 0) return 0.06;
    return 0.12 + (pct / 100) * 0.55; // 0.12 → 0.67
  }

  function glowIntensity(pct: number, color: string) {
    if (pct < 10) return 'none';
    const alpha = Math.round((pct / 100) * 40);
    return `0 0 ${8 + pct / 5}px ${color}${alpha.toString(16).padStart(2, '0')}`;
  }

  const hasSectors = sectors.length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-8 anim-page pb-10"
      style={{ '--accent-rgb': '168 85 247' } as React.CSSProperties}>

      {/* ── HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{ background: 'linear-gradient(180deg, #1a0a2e 0%, var(--hero-bg) 65%)', border: '1px solid #a855f730', minHeight: 110 }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, #a855f710 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }} />
        {/* HUD corners */}
        {(['top-0 left-0 border-t border-l','top-0 right-0 border-t border-r','bottom-0 left-0 border-b border-l','bottom-0 right-0 border-b border-r'] as const).map(cls => (
          <div key={cls} className={`absolute ${cls} pointer-events-none`}
            style={{ width: 14, height: 14, borderColor: '#a855f7', opacity: 0.6, borderWidth: '1.5px' }} />
        ))}
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #a855f780, transparent)', boxShadow: '0 0 12px #a855f7' }} />
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: '#a855f7', opacity: 0.7 }}>PATH://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">LIFE_TRAJECTORY</span>
            <span className="cursor-blink font-mono" style={{ color: '#a855f7', fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight leading-none text-white"
            style={{ textShadow: '0 0 40px #a855f760' }}>
            LIFE PATH
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: '#a855f7', opacity: 0.5 }}>
            // WRITE YOUR LIFE DOWN — WATCH IT FILL UP
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #a855f740, transparent)' }} />
      </div>

      {/* ── TEXT INPUT ── */}
      <div className="space-y-4" style={{ position: 'relative', zIndex: 1 }}>
        <div>
          <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: 'var(--t-faint)' }}>
            // Your life, in your words
          </p>
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--t-muted)' }}>
            Write about where you're headed — what you want to learn, build, become, fix, or experience. Don't filter. The sectors below will fill up as you complete tasks linked to them.
          </p>
        </div>

        <div className="relative">
          <textarea
            ref={taRef}
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            rows={7}
            placeholder={PLACEHOLDER}
            className="w-full rounded-2xl px-4 py-4 text-sm resize-none focus:outline-none leading-relaxed"
            style={{
              background: 'var(--s1)',
              border: '1px solid var(--b)',
              color: 'var(--t-body)',
              fontFamily: 'inherit',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#a855f760'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--b)'; }}
          />
          <div className="absolute bottom-3 right-3 text-[10px]" style={{ color: 'var(--t-faint)' }}>
            {rawText.trim() ? `${rawText.trim().split(/\s+/).length} words` : 'write freely'}
          </div>
        </div>

        {err && (
          <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl"
            style={{ background: '#ef444418', color: '#f87171', border: '1px solid #ef444430' }}>
            <AlertCircle size={12} />{err}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={detect}
            disabled={!rawText.trim() || detecting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white tap disabled:opacity-40"
            style={{ background: 'rgb(var(--accent-rgb))' }}>
            {detecting
              ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Mapping...</>
              : <><Zap size={14} /> Map my sectors</>}
          </button>

          {hasSectors && (
            <button onClick={detect} disabled={detecting}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold tap"
              style={{ background: 'var(--s2)', color: 'var(--t-faint)', border: '1px solid var(--b)' }}>
              <RefreshCw size={11} /> Re-map
            </button>
          )}
        </div>
      </div>

      {/* ── SECTOR GRID ── */}
      {hasSectors && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-black tracking-widest uppercase" style={{ color: 'var(--t-faint)' }}>
              // {sectors.length} sector{sectors.length !== 1 ? 's' : ''} detected
            </span>
            <div className="flex-1 h-px" style={{ background: 'var(--b)' }} />
            <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>
              complete tasks to fill them up
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sectors.map(sector => {
              const fill = fills[sector.id] ?? 0;
              const isGhost = fill === 0;
              const isFull = fill >= 100;

              return (
                <div key={sector.id}
                  className="relative overflow-hidden rounded-2xl flex flex-col"
                  style={{
                    background: 'var(--s1)',
                    border: `1px solid ${isGhost ? `${sector.color}20` : `${sector.color}50`}`,
                    minHeight: 160,
                    boxShadow: isGhost ? 'none' : glowIntensity(fill, sector.color),
                    transition: 'box-shadow 0.6s ease, border-color 0.6s ease',
                  }}>

                  {/* ── Water fill (rises from bottom) ── */}
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      bottom: 0, left: 0, right: 0,
                      height: `${fill}%`,
                      background: `linear-gradient(to top, ${sector.color}${Math.round(fillOpacity(fill) * 255).toString(16).padStart(2,'0')}, ${sector.color}${Math.round(fillOpacity(fill) * 0.5 * 255).toString(16).padStart(2,'0')})`,
                      transition: 'height 1.2s cubic-bezier(0.34,1.2,0.64,1)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* ── Full-card ghost tint at 0% ── */}
                  {isGhost && (
                    <div aria-hidden style={{
                      position: 'absolute', inset: 0,
                      background: `${sector.color}08`,
                      pointerEvents: 'none',
                    }} />
                  )}

                  {/* ── Content (above fill) ── */}
                  <div className="relative z-10 flex flex-col flex-1 p-4 gap-3">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="text-3xl leading-none"
                        style={{
                          opacity: isGhost ? 0.3 : 0.9,
                          filter: isGhost ? 'none' : `drop-shadow(0 0 6px ${sector.color}80)`,
                          transition: 'opacity 0.6s, filter 0.6s',
                        }}>
                        {sector.icon}
                      </span>
                      {/* Fill % badge */}
                      <span className="text-[9px] font-black tracking-wider px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          background: isGhost ? 'var(--s3)' : `${sector.color}20`,
                          color: isGhost ? 'var(--t-faint)' : sector.color,
                          border: `1px solid ${isGhost ? 'var(--b)' : `${sector.color}40`}`,
                          transition: 'all 0.4s',
                        }}>
                        {fill}%
                      </span>
                    </div>

                    {/* Name */}
                    <div>
                      <p className="text-sm font-bold leading-tight"
                        style={{
                          color: isGhost ? 'var(--t-faint)' : 'var(--t-head)',
                          transition: 'color 0.4s',
                        }}>
                        {sector.name}
                      </p>
                      {isFull && (
                        <p className="text-[10px] font-bold mt-0.5" style={{ color: sector.color }}>✦ Sector complete</p>
                      )}
                    </div>

                    {/* Spacer pushes stats to bottom */}
                    <div className="flex-1" />

                    {/* Task stats */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>
                        {sector.total === 0
                          ? 'No tasks yet'
                          : `${sector.done} / ${sector.total} tasks done`}
                      </span>

                      {/* Add task button */}
                      {addingTo?.id === sector.id ? null : (
                        <button
                          onClick={() => { setAddingTo(sector); setTaskTitle(''); }}
                          className="flex items-center gap-1 text-[10px] font-bold tap px-2 py-1 rounded-lg shrink-0"
                          style={{
                            background: `${sector.color}14`,
                            color: sector.color,
                            border: `1px solid ${sector.color}30`,
                          }}>
                          <Plus size={9} /> Task
                        </button>
                      )}
                    </div>

                    {/* Inline add-task form */}
                    {addingTo?.id === sector.id && (
                      <div className="flex gap-1.5 mt-1">
                        <input
                          autoFocus
                          value={taskTitle}
                          onChange={e => setTaskTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAddingTo(null); }}
                          placeholder="Task name…"
                          className="flex-1 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                          style={{ background: 'var(--s3)', color: 'var(--t-head)', border: `1px solid ${sector.color}40` }}
                        />
                        <button onClick={addTask} disabled={!taskTitle.trim() || savingTask}
                          className="px-2 py-1.5 rounded-lg text-[11px] font-bold tap disabled:opacity-40 text-white"
                          style={{ background: sector.color }}>
                          {savingTask ? '…' : '↵'}
                        </button>
                        <button onClick={() => setAddingTo(null)}
                          className="px-1.5 py-1.5 rounded-lg tap"
                          style={{ color: 'var(--t-faint)', background: 'var(--s3)' }}>
                          <X size={11} />
                        </button>
                      </div>
                    )}

                    {/* Thin progress bar at very bottom */}
                    <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--s3)' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${fill}%`,
                          background: sector.color,
                          boxShadow: fill > 0 ? `0 0 6px ${sector.color}80` : 'none',
                          borderRadius: 99,
                          transition: 'width 1.2s cubic-bezier(0.34,1.2,0.64,1)',
                        }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {loaded && !hasSectors && !detecting && (
        <div className="text-center py-16 space-y-3" style={{ position: 'relative', zIndex: 1 }}>
          <p className="text-5xl" style={{ opacity: 0.4 }}>🗺️</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--t-muted)' }}>Your sectors will appear here</p>
          <p className="text-xs" style={{ color: 'var(--t-faint)' }}>
            Write about your life above and hit <strong>Map my sectors</strong>
          </p>
        </div>
      )}

    </div>
  );
}
