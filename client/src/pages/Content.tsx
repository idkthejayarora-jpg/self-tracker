import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, ChevronRight, ChevronDown, ChevronUp, Trash2, X,
  AlertTriangle, Lightbulb, PenLine, Film, CheckCircle2, Archive,
} from 'lucide-react';
import PaperBanner from '../components/PaperBanner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Niche {
  id: number; name: string; color: string; icon: string;
  sort_order: number; idea_count: number;
}

interface Idea {
  id: number;
  niche_id: number | null; niche_name: string | null;
  niche_color: string | null; niche_icon: string | null;
  title: string; notes: string | null;
  content_type: 'reel' | 'post' | 'carousel' | 'story';
  status: 'idea' | 'scripted' | 'filmed' | 'posted' | 'archived';
  scheduled_date: string | null; posted_at: string | null;
  created_at: string;
}

interface Stats {
  lastPostDate: string | null; daysSinceLastPost: number | null;
  inPipeline: number; byStatus: Record<string, number>;
  postingStreak: number;
  weeklyData: { label: string; count: number; start: string }[];
  niches: { id: number; name: string; color: string }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_ORDER: Idea['status'][] = ['idea', 'scripted', 'filmed', 'posted', 'archived'];

const STATUS_META: Record<Idea['status'], { label: string; icon: React.ReactNode; color: string }> = {
  idea:     { label: 'Idea',     icon: <Lightbulb size={12} />,    color: '#e59a7f' },
  scripted: { label: 'Scripted', icon: <PenLine size={12} />,      color: '#d9a066' },
  filmed:   { label: 'Filmed',   icon: <Film size={12} />,         color: '#d97757' },
  posted:   { label: 'Posted',   icon: <CheckCircle2 size={12} />, color: '#cf8a3e' },
  archived: { label: 'Archived', icon: <Archive size={12} />,      color: '#57544a' },
};

const TYPE_LABELS: Record<Idea['content_type'], string> = {
  reel: 'Reel', post: 'Post', carousel: 'Carousel', story: 'Story',
};

const NICHE_COLORS = [
  '#d97757','#c2553d','#d9a066','#cf8a3e','#d9a066',
  '#cd5240','#e59a7f','#d97757','#b5764f','#d9a066',
];

const ACCENT = '#c2553d';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function nextStatus(s: Idea['status']): Idea['status'] | null {
  const i = STATUS_ORDER.indexOf(s);
  if (i < 0 || i >= STATUS_ORDER.indexOf('posted')) return null;
  return STATUS_ORDER[i + 1];
}

// ── Custom Select ─────────────────────────────────────────────────────────────

interface SelectOption {
  value: string | number | null;
  label: string;
  color?: string;
}

function CustomSelect({
  value, options, onChange, placeholder = 'Select…', accent, wide,
}: {
  value: string | number | null;
  options: SelectOption[];
  onChange: (v: string | number | null) => void;
  placeholder?: string;
  accent?: string;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = options.find(o => o.value === value);
  const accentColor = accent || ACCENT;

  const openPanel = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const panelH = Math.min(options.length * 42 + 12, 260);
    const top = (window.innerHeight - r.bottom) >= panelH ? r.bottom + 4 : r.top - panelH - 4;
    setPos({ top, left: r.left, width: wide ? Math.max(r.width, 190) : Math.max(r.width, 150) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    // Close on scroll/resize too — the fixed-position panel would otherwise
    // float away from its trigger (a visible "glitch").
    const dismiss = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? setOpen(false) : openPanel()}
        className="flex items-center justify-between gap-2 text-sm rounded-xl px-3 py-2 tap"
        style={{
          background: 'var(--s3)',
          color: selected?.color || 'var(--t-muted)',
          border: `1px solid ${open ? accentColor + '55' : 'var(--b)'}`,
          minWidth: 0,
          transition: 'border-color 0.15s',
        }}>
        <span className="flex items-center gap-1.5 truncate min-w-0">
          {selected?.color && (
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: selected.color }} />
          )}
          {selected
            ? <span className="truncate">{selected.label}</span>
            : <span style={{ color: 'var(--t-faint)' }}>{placeholder}</span>
          }
        </span>
        <ChevronDown size={11} style={{
          flexShrink: 0, opacity: 0.45,
          transform: open ? 'rotate(180deg)' : undefined,
          transition: 'transform 0.15s',
        }} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          className="scale-in"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 99999,
            background: 'var(--s1)',
            border: `1px solid ${accentColor}35`,
            borderRadius: 14,
            boxShadow: `0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px ${accentColor}12`,
            overflow: 'hidden',
            maxHeight: 260,
            overflowY: 'auto',
          }}>
          {/* neon top line */}
          <div style={{ height: 1, background: `${accentColor}55` }} />
          <div style={{ padding: '4px 0' }}>
            {options.map((opt, i) => {
              const isSel = opt.value === value;
              return (
                <button key={i} type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 tap text-left"
                  style={{
                    background: isSel ? `${opt.color || accentColor}18` : 'transparent',
                    color: isSel ? (opt.color || accentColor) : 'var(--t-body)',
                  }}>
                  {opt.color && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.color }} />
                  )}
                  <span className="text-sm font-medium flex-1">{opt.label}</span>
                  {isSel && <span className="text-[10px] font-black" style={{ color: opt.color || accentColor }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Idea Card ─────────────────────────────────────────────────────────────────

function IdeaCard({
  idea, niches, onUpdate, onDelete,
}: {
  idea: Idea;
  niches: Niche[];
  onUpdate: (id: number, patch: Partial<Idea>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [notes,    setNotes]    = useState(idea.notes || '');
  const [schedDate,setSchedDate]= useState(idea.scheduled_date || '');
  const [selNiche, setSelNiche] = useState<number | null>(idea.niche_id);
  const [selType,  setSelType]  = useState<Idea['content_type']>(idea.content_type);
  const [saving,   setSaving]   = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Reset edit mode whenever the card collapses. (No auto-scroll — it caused
  // the page to jerk on every tap; the card expands in place where tapped.)
  useEffect(() => {
    if (!expanded) setEditing(false);
  }, [expanded]);

  const advance = async () => {
    const next = nextStatus(idea.status);
    if (!next) return;
    await onUpdate(idea.id, { status: next });
  };

  const saveEdits = async () => {
    setSaving(true);
    await onUpdate(idea.id, {
      notes: notes || null,
      scheduled_date: schedDate || null,
      niche_id: selNiche,
      content_type: selType,
    });
    setSaving(false);
    setEditing(false);
  };

  const sm = STATUS_META[idea.status];

  return (
    <div ref={cardRef} className="rounded-xl mb-3 overflow-hidden"
      style={{
        background: 'var(--s2)',
        border: `1px solid ${expanded ? (idea.niche_color || ACCENT) + '35' : 'var(--b)'}`,
        transition: 'border-color 0.2s',
      }}>

      {/* ── Header row: niche dot · title · expand only ── */}
      {/* Status badge intentionally removed — shown clearly in expanded panel */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 tap text-left"
        onClick={() => setExpanded(v => !v)}>
        {/* Niche colour strip on left edge */}
        <div className="w-1.5 h-5 rounded-full flex-shrink-0"
          style={{ background: idea.niche_color || 'var(--t-faint)' }} />

        {/* Title takes ALL remaining space — truncated only when collapsed */}
        <p className={`flex-1 text-sm font-semibold leading-snug min-w-0 ${expanded ? 'break-words' : 'truncate'}`}
          style={{ color: 'var(--t-head)' }}>
          {idea.title}
        </p>

        {/* Chevron indicator */}
        <span className="flex-shrink-0" style={{ color: expanded ? (idea.niche_color || ACCENT) : 'var(--t-faint)' }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* ── Collapsed: meta pills ── */}
      {!expanded && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3.5" style={{ marginTop: -4 }}>
          {/* Status pill */}
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-bold"
            style={{ background: sm.color + '18', color: sm.color }}>
            {sm.icon} {sm.label}
          </span>
          {idea.niche_name && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
              style={{ background: (idea.niche_color || ACCENT) + '18', color: idea.niche_color || ACCENT }}>
              {idea.niche_name}
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded-md"
            style={{ background: 'var(--s3)', color: 'var(--t-faint)' }}>
            {TYPE_LABELS[idea.content_type]}
          </span>
          {idea.scheduled_date && (
            <span className="text-[10px]" style={{ color: 'var(--t-dim)' }}>
              {fmtDate(idea.scheduled_date)}
            </span>
          )}
        </div>
      )}

      {/* ── Expanded: VIEW mode ── */}
      {expanded && !editing && (
        <div style={{ borderTop: '1px solid var(--b)' }}>
          {/* Full title — prominent, always readable */}
          <div className="px-4 pt-4 pb-3">
            <p className="text-base font-bold leading-snug break-words" style={{ color: 'var(--t-head)' }}>
              {idea.title}
            </p>
          </div>

          {/* Properties row — horizontal chips */}
          <div className="flex flex-wrap gap-2 px-4 pb-4">
            <span className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-xl font-bold"
              style={{ background: sm.color + '15', color: sm.color }}>
              {sm.icon} {sm.label}
            </span>
            <span className="text-[11px] px-2.5 py-1.5 rounded-xl font-medium"
              style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>
              {TYPE_LABELS[idea.content_type]}
            </span>
            {idea.niche_name && (
              <span className="text-[11px] px-2.5 py-1.5 rounded-xl font-bold"
                style={{ background: (idea.niche_color || ACCENT) + '18', color: idea.niche_color || ACCENT }}>
                {idea.niche_name}
              </span>
            )}
            {idea.scheduled_date && (
              <span className="text-[11px] px-2.5 py-1.5 rounded-xl font-medium"
                style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>
                📅 {fmtDate(idea.scheduled_date)}
              </span>
            )}
            {idea.posted_at && (
              <span className="text-[11px] px-2.5 py-1.5 rounded-xl font-bold"
                style={{ background: '#cf8a3e18', color: '#cf8a3e' }}>
                ✓ {fmtDate(idea.posted_at)}
              </span>
            )}
          </div>

          {/* Notes */}
          <div className="px-4 pb-4">
            {idea.notes
              ? <p className="text-sm leading-relaxed" style={{ color: 'var(--t-muted)' }}>{idea.notes}</p>
              : <p className="text-xs font-mono italic" style={{ color: 'var(--t-faint)', opacity: 0.45 }}>// no notes yet</p>
            }
          </div>

          {/* Actions — two full-width rows */}
          <div className="px-4 pb-4 space-y-2" style={{ borderTop: '1px solid var(--b)', paddingTop: 12 }}>
            {/* Primary: advance + edit */}
            <div className="flex gap-2">
              {nextStatus(idea.status) && (
                <button onClick={advance}
                  className="tap flex items-center justify-center gap-1.5 text-xs px-3 py-2.5 rounded-xl font-bold flex-1"
                  style={{ background: sm.color + '18', color: sm.color, border: `1px solid ${sm.color}25` }}>
                  <ChevronRight size={13} /> Move → {nextStatus(idea.status)}
                </button>
              )}
              <button onClick={() => { setEditing(true); setNotes(idea.notes || ''); setSchedDate(idea.scheduled_date || ''); setSelNiche(idea.niche_id); setSelType(idea.content_type); }}
                className="tap text-xs px-3 py-2.5 rounded-xl font-semibold flex-1"
                style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>
                Edit
              </button>
            </div>
            {/* Secondary: archive + delete side by side */}
            <div className="flex gap-2">
              {idea.status !== 'archived' && (
                <button onClick={() => onUpdate(idea.id, { status: 'archived' })}
                  className="tap flex items-center justify-center gap-1.5 text-xs px-3 py-2.5 rounded-xl font-medium flex-1"
                  style={{ background: 'var(--s3)', color: 'var(--t-faint)' }}>
                  <Archive size={12} /> Archive
                </button>
              )}
              <button onClick={() => onDelete(idea.id)}
                className="tap flex items-center justify-center gap-1.5 text-xs px-3 py-2.5 rounded-xl font-medium flex-1"
                style={{ background: 'rgb(239 68 68 / 0.08)', color: '#e07b62' }}>
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Expanded: EDIT mode ── */}
      {expanded && editing && (
        <div className="px-4 pb-4 space-y-3.5" style={{ borderTop: '1px solid var(--b)', paddingTop: 16 }}>
          {/* Title reminder at top of edit panel */}
          <p className="text-[11px] font-mono" style={{ color: ACCENT, opacity: 0.6 }}>editing: {idea.title.slice(0, 40)}{idea.title.length > 40 ? '…' : ''}</p>

          <textarea
            rows={3}
            placeholder="Notes, caption ideas, hashtags..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2.5 resize-none focus:outline-none"
            style={{ background: 'var(--s3)', color: 'var(--t-body)', border: `1px solid ${ACCENT}25` }}
          />

          {/* Two dropdowns on same row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] mb-1.5 block font-black tracking-[0.15em]"
                style={{ color: 'var(--t-faint)' }}>NICHE</label>
              <CustomSelect
                value={selNiche}
                options={[{ value: null, label: 'None' }, ...niches.map(n => ({ value: n.id, label: n.name, color: n.color }))]}
                onChange={v => setSelNiche(v as number | null)}
                placeholder="None"
                accent={ACCENT}
                wide
              />
            </div>
            <div>
              <label className="text-[10px] mb-1.5 block font-black tracking-[0.15em]"
                style={{ color: 'var(--t-faint)' }}>TYPE</label>
              <CustomSelect
                value={selType}
                options={(['reel','post','carousel','story'] as const).map(t => ({ value: t, label: TYPE_LABELS[t] }))}
                onChange={v => setSelType(v as Idea['content_type'])}
                accent={ACCENT}
              />
            </div>
          </div>

          {/* Schedule date full-width */}
          <div>
            <label className="text-[10px] mb-1.5 block font-black tracking-[0.15em]"
              style={{ color: 'var(--t-faint)' }}>SCHEDULE DATE</label>
            <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
              className="w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none"
              style={{ background: 'var(--s3)', color: 'var(--t-body)', border: '1px solid var(--b)' }} />
          </div>

          {/* Save / Cancel — full-width side by side */}
          <div className="flex gap-2 pt-1">
            <button onClick={saveEdits} disabled={saving}
              className="tap text-sm px-4 py-2.5 rounded-xl font-bold flex-1"
              style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)}
              className="tap text-sm px-4 py-2.5 rounded-xl font-semibold flex-1"
              style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Content() {
  const [tab, setTab] = useState<'board' | 'calendar' | 'niches' | 'stats'>('board');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // Quick dump
  const [dumpTitle, setDumpTitle] = useState('');
  const [dumpNiche, setDumpNiche] = useState<number | null>(null);
  const [dumpType, setDumpType] = useState<Idea['content_type']>('reel');
  const [dumping, setDumping] = useState(false);

  // Calendar
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
  });
  const [calDay, setCalDay] = useState<string | null>(null);

  // Niches form
  const [newNicheName, setNewNicheName] = useState('');
  const [newNicheColor, setNewNicheColor] = useState(NICHE_COLORS[0]);
  const [addingNiche, setAddingNiche] = useState(false);
  const [editNiche, setEditNiche] = useState<Niche | null>(null);

  // Pipeline collapse state
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ archived: true });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ideasRes, nichesRes, statsRes] = await Promise.all([
        api.get<Idea[]>('/content/ideas'),
        api.get<Niche[]>('/content/niches'),
        api.get<Stats>('/content/stats'),
      ]);
      setIdeas(ideasRes.data);
      setNiches(nichesRes.data);
      setStats(statsRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const quickDump = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!dumpTitle.trim()) return;
    setDumping(true);
    try {
      const r = await api.post<Idea>('/content/ideas', {
        title: dumpTitle.trim(), niche_id: dumpNiche, content_type: dumpType,
      });
      setIdeas(prev => [r.data, ...prev]);
      setDumpTitle('');
      const nr = await api.get<Niche[]>('/content/niches');
      setNiches(nr.data);
    } finally { setDumping(false); }
  };

  const updateIdea = useCallback(async (id: number, patch: Partial<Idea>) => {
    const r = await api.put<Idea>(`/content/ideas/${id}`, patch);
    setIdeas(prev => prev.map(i => i.id === id ? r.data : i));
    if (patch.status) {
      const sr = await api.get<Stats>('/content/stats');
      setStats(sr.data);
    }
  }, []);

  const deleteIdea = useCallback(async (id: number) => {
    await api.delete(`/content/ideas/${id}`);
    setIdeas(prev => prev.filter(i => i.id !== id));
    const sr = await api.get<Stats>('/content/stats');
    setStats(sr.data);
  }, []);

  const createNiche = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNicheName.trim()) return;
    setAddingNiche(true);
    try {
      await api.post('/content/niches', { name: newNicheName.trim(), color: newNicheColor, icon: '' });
      setNewNicheName(''); setNewNicheColor(NICHE_COLORS[0]);
      const nr = await api.get<Niche[]>('/content/niches');
      setNiches(nr.data);
    } finally { setAddingNiche(false); }
  };

  const saveEditNiche = async () => {
    if (!editNiche) return;
    await api.put(`/content/niches/${editNiche.id}`, { name: editNiche.name, color: editNiche.color });
    setEditNiche(null);
    const nr = await api.get<Niche[]>('/content/niches');
    setNiches(nr.data);
  };

  const deleteNiche = async (id: number) => {
    await api.delete(`/content/niches/${id}`);
    const nr = await api.get<Niche[]>('/content/niches');
    setNiches(nr.data);
  };

  // ── Calendar helpers ──────────────────────────────────────────────────────

  const [calYear, calMonthNum] = calMonth.split('-').map(Number);
  const daysInMonth = new Date(calYear, calMonthNum, 0).getDate();
  const firstDayOfWeek = new Date(calYear, calMonthNum - 1, 1).getDay();

  const ideasByDate: Record<string, Idea[]> = {};
  for (const idea of ideas) {
    const d = idea.scheduled_date || (idea.status === 'posted' ? idea.posted_at : null);
    if (d && d.startsWith(calMonth)) {
      if (!ideasByDate[d]) ideasByDate[d] = [];
      ideasByDate[d].push(idea);
    }
  }

  const calMonthIdeas = ideas.filter(i => {
    const d = i.scheduled_date || (i.status === 'posted' ? i.posted_at : null);
    return d && d.startsWith(calMonth);
  });
  const calPosted = calMonthIdeas.filter(i => i.status === 'posted').length;

  const prevMonth = () => {
    const d = new Date(calYear, calMonthNum - 2, 1);
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`);
    setCalDay(null);
  };
  const nextMonth = () => {
    const d = new Date(calYear, calMonthNum, 1);
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`);
    setCalDay(null);
  };

  const byStatus: Record<string, Idea[]> = {};
  for (const s of STATUS_ORDER) byStatus[s] = [];
  for (const idea of ideas) byStatus[idea.status]?.push(idea);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="anim-page max-w-3xl mx-auto space-y-7 pb-12"
      style={{ '--accent-rgb': '194 85 61' } as React.CSSProperties}>

      {/* Focus trap — prevents mobile keyboard auto-opening on page load */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div tabIndex={0} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} aria-hidden="true" />

      {/* Dot grid overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `radial-gradient(circle, rgba(194,85,61,0.06) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }} />
      </div>

      <PaperBanner
        title="Content Studio"
        label="Creator"
        accent={ACCENT}
        subtitle="ideas, drafts, and everything to be made"
      />

      <div style={{ position: 'relative', zIndex: 1 }}>

      {/* Tabs */}
      <div className="flex gap-2.5 flex-wrap">
        {(['board','calendar','niches','stats'] as const).map(t => (
          <button key={t}
            className="tap px-4 py-1.5 rounded-xl text-sm font-semibold transition-colors capitalize"
            style={tab === t
              ? { background: `rgb(var(--accent-rgb) / 0.12)`, color: `rgb(var(--accent-rgb-light))` }
              : { background: 'var(--s3)', color: 'var(--t-muted)' }}
            onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm py-4 text-center" style={{ color: 'var(--t-dim)' }}>Loading...</p>}

      {/* ── BOARD TAB ── */}
      {tab === 'board' && (
        <div className="space-y-5">
          {/* Quick dump bar */}
          <form onSubmit={quickDump} className="card px-4 py-4 space-y-3"
            style={{ borderColor: `${ACCENT}25`, background: `linear-gradient(135deg, var(--s1) 0%, ${ACCENT}05 100%)` }}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black tracking-[0.2em]" style={{ color: ACCENT }}>
                QUICK DUMP
              </span>
              <span className="text-[10px] font-mono opacity-40 text-white">// drop ideas before they vanish</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                value={dumpTitle}
                onChange={e => setDumpTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && quickDump()}
                placeholder="What is the idea?"
                className="flex-1 min-w-0 text-sm rounded-xl px-3 py-2 focus:outline-none"
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: `1px solid ${ACCENT}25` }}
                autoComplete="off"
              />
              <CustomSelect
                value={dumpNiche}
                options={[{ value: null, label: 'No niche' }, ...niches.map(n => ({ value: n.id, label: n.name, color: n.color }))]}
                onChange={v => setDumpNiche(v as number | null)}
                placeholder="No niche"
                accent={ACCENT}
                wide
              />
              <CustomSelect
                value={dumpType}
                options={(['reel','post','carousel','story'] as const).map(t => ({ value: t, label: TYPE_LABELS[t] }))}
                onChange={v => setDumpType(v as Idea['content_type'])}
                accent={ACCENT}
              />
              <button type="submit" disabled={dumping || !dumpTitle.trim()}
                className="tap flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl font-bold"
                style={{ background: `${ACCENT}e6`, color: '#fff', opacity: dumpTitle.trim() ? 1 : 0.4 }}>
                <Plus size={14} /> Add
              </button>
            </div>
          </form>

          {/* Pipeline columns */}
          {STATUS_ORDER.map(status => {
            const list = byStatus[status] || [];
            const meta = STATUS_META[status];
            const isCollapsed = collapsed[status];
            return (
              <div key={status} className="card" style={{ padding: '16px 18px' }}>
                <button
                  className="tap w-full flex items-center justify-between mb-3"
                  onClick={() => setCollapsed(c => ({ ...c, [status]: !c[status] }))}>
                  <div className="flex items-center gap-2">
                    <span style={{ color: meta.color }}>{meta.icon}</span>
                    <span className="text-sm font-black tracking-wide" style={{ color: meta.color }}>
                      {meta.label.toUpperCase()}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                      style={{ background: meta.color + '18', color: meta.color }}>
                      {list.length}
                    </span>
                  </div>
                  {isCollapsed
                    ? <ChevronDown size={14} style={{ color: 'var(--t-faint)' }} />
                    : <ChevronUp size={14} style={{ color: 'var(--t-faint)' }} />}
                </button>
                {!isCollapsed && (
                  list.length === 0
                    ? <p className="text-xs py-2 text-center font-mono" style={{ color: 'var(--t-faint)' }}>
                        // empty
                      </p>
                    : list.map(idea => (
                        <IdeaCard key={idea.id} idea={idea} niches={niches}
                          onUpdate={updateIdea} onDelete={deleteIdea} />
                      ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── CALENDAR TAB ── */}
      {tab === 'calendar' && (
        <div className="space-y-3">
          {/* Dry-spell warning */}
          {stats && stats.daysSinceLastPost !== null && stats.daysSinceLastPost >= 7 && (
            <div className="relative overflow-hidden rounded-xl px-4 py-3 flex items-start gap-3"
              style={{ background: 'rgba(92,42,34,0.45)',
                border: '1px solid rgb(239 68 68 / 0.35)', boxShadow: 'none' }}>
              {/* warning neon top bar */}
              <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
                style={{ background: '#cd524080' }} />
              <AlertTriangle size={15} style={{ color: '#e07b62', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p className="text-sm font-black tracking-[0.1em]" style={{ color: '#e8a18f', textShadow: 'none' }}>
                  {stats.daysSinceLastPost}D SIGNAL BLACKOUT
                </p>
                <p className="text-[11px] mt-0.5 font-mono" style={{ color: 'rgb(239 68 68 / 0.6)' }}>
                  last_post=
                  <span style={{ color: '#e8a18f' }}>
                    {stats.lastPostDate ? fmtDate(stats.lastPostDate) : 'null'}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Calendar card — full cyberpunk */}
          <div className="relative overflow-hidden rounded-2xl"
            style={{ background: 'var(--hero-bg)', border: `1px solid ${ACCENT}20`,
              boxShadow: 'none' }}>
            {/* Scanlines */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ backgroundImage: 'none' }} />
            {/* Top neon bar */}
            <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
              style={{ background: `${ACCENT}50`,
                boxShadow: 'none' }} />
            {/* HUD corners */}
            {([
              ['top-0 left-0',     { borderTop: `1.5px solid ${ACCENT}`, borderLeft: `1.5px solid ${ACCENT}` }],
              ['top-0 right-0',    { borderTop: `1.5px solid ${ACCENT}`, borderRight: `1.5px solid ${ACCENT}` }],
              ['bottom-0 left-0',  { borderBottom: `1.5px solid ${ACCENT}`, borderLeft: `1.5px solid ${ACCENT}` }],
              ['bottom-0 right-0', { borderBottom: `1.5px solid ${ACCENT}`, borderRight: `1.5px solid ${ACCENT}` }],
            ] as [string, React.CSSProperties][]).map(([pos, s], i) => (
              <div key={i} className={`absolute ${pos} pointer-events-none`}
                style={{ width: 10, height: 10, opacity: 0.45, ...s }} />
            ))}

            <div className="relative z-10 px-4 py-4">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-1">
                <button onClick={prevMonth}
                  className="tap w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg"
                  style={{ background: `${ACCENT}12`, color: ACCENT, border: `1px solid ${ACCENT}25` }}>
                  ‹
                </button>
                <div className="text-center">
                  <p className="font-black text-sm tracking-[0.12em] font-mono"
                    style={{ color: 'var(--t-head)', textShadow: 'none' }}>
                    {new Date(calYear, calMonthNum - 1)
                      .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
                      .toUpperCase()}
                  </p>
                  <p className="text-[9px] font-mono mt-0.5" style={{ color: ACCENT, opacity: 0.5 }}>
                    {calMonthIdeas.length}_IDEAS · {calPosted}_POSTED
                  </p>
                </div>
                <button onClick={nextMonth}
                  className="tap w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg"
                  style={{ background: `${ACCENT}12`, color: ACCENT, border: `1px solid ${ACCENT}25` }}>
                  ›
                </button>
              </div>

              {/* Thin separator */}
              <div className="my-3" style={{ height: 1,
                background: `${ACCENT}25` }} />

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['SU','MO','TU','WE','TH','FR','SA'].map(d => (
                  <div key={d} className="text-center text-[9px] font-black tracking-[0.2em] py-1 font-mono"
                    style={{ color: ACCENT, opacity: 0.45 }}>{d}</div>
                ))}
              </div>

              {/* Grid */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${calMonth}-${String(day).padStart(2,'0')}`;
                  const dayIdeas = ideasByDate[dateStr] || [];
                  const isToday = dateStr === new Date().toISOString().slice(0,10);
                  const isSelected = calDay === dateStr;
                  const hasContent = dayIdeas.length > 0;
                  return (
                    <button key={day}
                      onClick={() => setCalDay(isSelected ? null : dateStr)}
                      className="tap flex flex-col items-center rounded-lg py-1.5 relative"
                      style={{
                        background: isSelected
                          ? `${ACCENT}22`
                          : isToday
                          ? `${ACCENT}0e`
                          : hasContent
                          ? 'rgba(255,255,255,0.03)'
                          : 'transparent',
                        border: isSelected
                          ? `1px solid ${ACCENT}70`
                          : isToday
                          ? `1px solid ${ACCENT}45`
                          : hasContent
                          ? '1px solid rgba(255,255,255,0.07)'
                          : '1px solid transparent',
                        boxShadow: undefined,
                      }}>
                      <span className="text-xs font-mono font-bold" style={{
                        color: isSelected ? ACCENT : isToday ? 'white' : 'var(--t-muted)',
                        textShadow: undefined,
                      }}>{day}</span>
                      <div className="flex flex-wrap justify-center gap-0.5 mt-0.5" style={{ minHeight: 5 }}>
                        {dayIdeas.slice(0, 3).map((idea, j) => (
                          <div key={j} className="w-1 h-1 rounded-full"
                            style={{ background: idea.niche_color || ACCENT,
                              boxShadow: 'none' }} />
                        ))}
                        {dayIdeas.length > 3 && (
                          <div className="w-1 h-1 rounded-full" style={{ background: 'var(--t-faint)' }} />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Bottom neon bar */}
            <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
              style={{ background: `${ACCENT}25` }} />
          </div>

          {/* Selected day drawer */}
          {calDay && (
            <div className="relative overflow-hidden rounded-2xl slide-up"
              style={{ background: 'var(--s1)', border: `1px solid ${ACCENT}20` }}>
              {/* Top neon bar */}
              <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
                style={{ background: `${ACCENT}40` }} />
              <div className="px-4 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[9px] font-mono tracking-[0.2em] mb-0.5" style={{ color: ACCENT, opacity: 0.5 }}>
                      DATE://
                    </p>
                    <p className="text-sm font-black font-mono tracking-wide"
                      style={{ color: 'var(--t-head)', textShadow: 'none' }}>
                      {fmtDate(calDay).toUpperCase()}
                    </p>
                  </div>
                  <button onClick={() => setCalDay(null)}
                    className="tap w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: `${ACCENT}12`, color: ACCENT }}>
                    <X size={15} />
                  </button>
                </div>
                {(ideasByDate[calDay] || []).length === 0
                  ? <p className="text-xs font-mono py-2" style={{ color: 'var(--t-faint)' }}>
                      // nothing_scheduled
                    </p>
                  : (ideasByDate[calDay] || []).map(idea => (
                      <IdeaCard key={idea.id} idea={idea} niches={niches}
                        onUpdate={updateIdea} onDelete={deleteIdea} />
                    ))
                }
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── NICHES TAB ── */}
      {tab === 'niches' && (
        <div className="space-y-3">
          <form onSubmit={createNiche} className="card px-4 py-4 space-y-3">
            <p className="text-[10px] font-black tracking-[0.2em]" style={{ color: 'var(--t-faint)' }}>
              NEW NICHE
            </p>
            <input value={newNicheName} onChange={e => setNewNicheName(e.target.value)}
              placeholder="Niche name (e.g. Fitness, Tech, Lifestyle)"
              className="w-full text-sm rounded-xl px-3 py-2"
              style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
            {/* Color swatches */}
            <div>
              <p className="text-[10px] font-semibold tracking-wider mb-2" style={{ color: 'var(--t-faint)' }}>COLOR</p>
              <div className="flex flex-wrap gap-2">
                {NICHE_COLORS.map(c => (
                  <button key={c} type="button"
                    onClick={() => setNewNicheColor(c)}
                    className="tap w-6 h-6 rounded-full"
                    style={{
                      background: c,
                      transform: newNicheColor === c ? 'scale(1.3)' : undefined,
                      outline: newNicheColor === c ? `2px solid ${c}` : 'none',
                      outlineOffset: 2,
                    }} />
                ))}
              </div>
            </div>
            <button type="submit" disabled={addingNiche || !newNicheName.trim()}
              className="tap text-sm px-4 py-2 rounded-xl font-bold"
              style={{ background: `rgb(var(--accent-rgb))`, color: '#fff', opacity: newNicheName.trim() ? 1 : 0.4 }}>
              {addingNiche ? 'Adding...' : '+ Add Niche'}
            </button>
          </form>

          {niches.length === 0
            ? <p className="text-sm text-center py-6 font-mono" style={{ color: 'var(--t-dim)' }}>
                // no niches yet
              </p>
            : niches.map(n => (
                <div key={n.id} className="card px-4 py-3">
                  {editNiche?.id === n.id ? (
                    <div className="space-y-2">
                      <input value={editNiche.name} onChange={e => setEditNiche({ ...editNiche, name: e.target.value })}
                        className="w-full text-sm rounded-xl px-3 py-1.5"
                        style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                      <div className="flex flex-wrap gap-1.5">
                        {NICHE_COLORS.map(c => (
                          <button key={c} type="button" onClick={() => setEditNiche({ ...editNiche, color: c })}
                            className="tap w-5 h-5 rounded-full"
                            style={{ background: c, outline: editNiche.color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveEditNiche}
                          className="tap text-xs px-3 py-1.5 rounded-lg font-semibold"
                          style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>Save</button>
                        <button onClick={() => setEditNiche(null)}
                          className="tap text-xs px-3 py-1.5 rounded-lg"
                          style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-8 rounded-full flex-shrink-0" style={{ background: n.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold tracking-wide" style={{ color: n.color }}>{n.name}</p>
                        <p className="text-[11px] font-mono" style={{ color: 'var(--t-faint)' }}>
                          {n.idea_count} idea{n.idea_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => setEditNiche(n)}
                          className="tap text-xs px-2 py-1 rounded-lg"
                          style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>Edit</button>
                        <button onClick={() => deleteNiche(n.id)}
                          className="tap w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: 'rgb(239 68 68 / 0.1)', color: '#e07b62' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
          }
        </div>
      )}

      {/* ── STATS TAB ── */}
      {tab === 'stats' && stats && (
        <div className="space-y-4">
          {/* Stat tiles */}
          <div className="grid grid-cols-1 min-[360px]:grid-cols-3 gap-3">
            {[
              { label: 'POST STREAK', value: `${stats.postingStreak}w`, sub: 'consecutive weeks', color: '#d97757' },
              { label: 'LAST POST',   value: stats.daysSinceLastPost !== null ? `${stats.daysSinceLastPost}d` : '--',
                sub: stats.lastPostDate ? fmtDate(stats.lastPostDate) : 'Never posted', color: ACCENT },
              { label: 'PIPELINE',    value: String(stats.inPipeline), sub: 'ideas in flight', color: '#e59a7f' },
            ].map(tile => (
              <div key={tile.label} className="card flex min-[360px]:flex-col items-center min-[360px]:items-center justify-between min-[360px]:justify-start py-3 min-[360px]:py-4 px-4 min-[360px]:px-2 text-left min-[360px]:text-center gap-3 min-[360px]:gap-0">
                <span className="text-[10px] font-black tracking-[0.15em]"
                  style={{ color: tile.color, opacity: 0.7 }}>{tile.label}</span>
                <div className="flex items-baseline gap-2 min-[360px]:block min-[360px]:text-center">
                  <span className="text-2xl font-black" style={{ color: tile.color }}>{tile.value}</span>
                  <span className="text-[10px] font-mono min-[360px]:block min-[360px]:mt-0.5" style={{ color: 'var(--t-faint)' }}>{tile.sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Weekly chart */}
          <div className="card px-4 py-4">
            <p className="text-[10px] font-black tracking-[0.2em] mb-3" style={{ color: 'var(--t-dim)' }}>
              POSTS / WEEK — LAST 8 WEEKS
            </p>
            {stats.weeklyData.every(w => w.count === 0)
              ? <p className="text-sm text-center py-6 font-mono" style={{ color: 'var(--t-faint)' }}>// no posts logged yet</p>
              : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={stats.weeklyData} barSize={22}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--t-faint)' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--t-faint)' }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip
                      contentStyle={{ background: 'var(--s2)', border: '1px solid var(--b)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => [v, 'Posts']}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {stats.weeklyData.map((_, i) => (
                        <Cell key={i} fill={ACCENT} fillOpacity={0.5 + (i / stats.weeklyData.length) * 0.5} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            }
          </div>

          {/* Pipeline breakdown */}
          <div className="card px-4 py-4">
            <p className="text-[10px] font-black tracking-[0.2em] mb-3" style={{ color: 'var(--t-dim)' }}>
              PIPELINE BREAKDOWN
            </p>
            <div className="space-y-2.5">
              {STATUS_ORDER.map(s => {
                const count = stats.byStatus[s] || 0;
                const meta = STATUS_META[s];
                const total = ideas.length || 1;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 w-24 flex-shrink-0">
                      <span style={{ color: meta.color }}>{meta.icon}</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--t-muted)' }}>{meta.label}</span>
                    </div>
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--s3)' }}>
                      <div className="h-1.5 rounded-full transition-all"
                        style={{ width: `${(count / total) * 100}%`, background: meta.color }} />
                    </div>
                    <span className="text-xs w-5 text-right font-black" style={{ color: meta.color }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      </div>{/* end zIndex wrapper */}
    </div>
  );
}
