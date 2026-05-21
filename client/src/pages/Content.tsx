import { useState, useEffect, useCallback } from 'react';
import {
  Plus, ChevronRight, ChevronDown, ChevronUp, Trash2, X,
  AlertTriangle, Lightbulb, PenLine, Film, CheckCircle2, Archive,
} from 'lucide-react';
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
  idea:     { label: 'Idea',     icon: <Lightbulb size={12} />,    color: '#818cf8' },
  scripted: { label: 'Scripted', icon: <PenLine size={12} />,      color: '#f59e0b' },
  filmed:   { label: 'Filmed',   icon: <Film size={12} />,         color: '#f97316' },
  posted:   { label: 'Posted',   icon: <CheckCircle2 size={12} />, color: '#22c55e' },
  archived: { label: 'Archived', icon: <Archive size={12} />,      color: '#52525b' },
};

const TYPE_LABELS: Record<Idea['content_type'], string> = {
  reel: 'Reel', post: 'Post', carousel: 'Carousel', story: 'Story',
};

const NICHE_COLORS = [
  '#6366f1','#ec4899','#f59e0b','#22c55e','#06b6d4',
  '#ef4444','#a855f7','#f97316','#84cc16','#14b8a6',
];

const ACCENT = '#ec4899';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function nextStatus(s: Idea['status']): Idea['status'] | null {
  const i = STATUS_ORDER.indexOf(s);
  if (i < 0 || i >= STATUS_ORDER.indexOf('posted')) return null;
  return STATUS_ORDER[i + 1];
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
  const [notes, setNotes] = useState(idea.notes || '');
  const [schedDate, setSchedDate] = useState(idea.scheduled_date || '');
  const [selNiche, setSelNiche] = useState<number | null>(idea.niche_id);
  const [selType, setSelType] = useState<Idea['content_type']>(idea.content_type);
  const [saving, setSaving] = useState(false);

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
    setExpanded(false);
  };

  const sm = STATUS_META[idea.status];

  return (
    <div className="rounded-xl mb-2"
      style={{ background: 'var(--s2)', border: '1px solid var(--b)' }}>
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Niche dot */}
        <div className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: idea.niche_color || 'var(--t-faint)' }} />

        {/* Title */}
        <p className="flex-1 text-sm font-medium leading-snug min-w-0 truncate"
          style={{ color: 'var(--t-head)' }}>
          {idea.title}
        </p>

        {/* Status badge */}
        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-semibold flex-shrink-0"
          style={{ background: sm.color + '18', color: sm.color }}>
          {sm.icon}
          <span className="hidden sm:inline">{sm.label}</span>
        </span>

        {/* Advance button */}
        {nextStatus(idea.status) && (
          <button onClick={advance}
            className="tap w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}
            title={`Move to ${nextStatus(idea.status)}`}>
            <ChevronRight size={13} />
          </button>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="tap w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--s3)', color: 'var(--t-faint)' }}>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5" style={{ marginTop: -4 }}>
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
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--t-dim)' }}>
            {fmtDate(idea.scheduled_date)}
          </span>
        )}
      </div>

      {/* Expanded edit panel */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2.5" style={{ borderTop: '1px solid var(--b)', paddingTop: 12 }}>
          <textarea
            rows={2}
            placeholder="Notes, caption ideas, hashtags..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full text-xs rounded-lg px-3 py-2 resize-none"
            style={{ background: 'var(--s3)', color: 'var(--t-body)', border: '1px solid var(--b)' }}
          />
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[130px]">
              <label className="text-[10px] mb-1 block font-semibold tracking-wider"
                style={{ color: 'var(--t-faint)' }}>SCHEDULE</label>
              <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                className="w-full text-xs rounded-lg px-2 py-1.5"
                style={{ background: 'var(--s3)', color: 'var(--t-body)', border: '1px solid var(--b)' }} />
            </div>
            <div className="flex-1 min-w-[110px]">
              <label className="text-[10px] mb-1 block font-semibold tracking-wider"
                style={{ color: 'var(--t-faint)' }}>NICHE</label>
              <select value={selNiche ?? ''} onChange={e => setSelNiche(e.target.value ? Number(e.target.value) : null)}
                className="w-full text-xs rounded-lg px-2 py-1.5"
                style={{ background: 'var(--s3)', color: 'var(--t-body)', border: '1px solid var(--b)' }}>
                <option value="">None</option>
                {niches.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[100px]">
              <label className="text-[10px] mb-1 block font-semibold tracking-wider"
                style={{ color: 'var(--t-faint)' }}>TYPE</label>
              <select value={selType} onChange={e => setSelType(e.target.value as Idea['content_type'])}
                className="w-full text-xs rounded-lg px-2 py-1.5"
                style={{ background: 'var(--s3)', color: 'var(--t-body)', border: '1px solid var(--b)' }}>
                {(['reel','post','carousel','story'] as const).map(t =>
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                )}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button onClick={saveEdits} disabled={saving}
                className="tap text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setExpanded(false)}
                className="tap text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>
                Cancel
              </button>
            </div>
            <div className="flex gap-1.5">
              {idea.status !== 'archived' && (
                <button onClick={() => onUpdate(idea.id, { status: 'archived' })}
                  className="tap text-xs px-2 py-1.5 rounded-lg flex items-center gap-1"
                  style={{ background: 'var(--s3)', color: 'var(--t-faint)' }}>
                  <Archive size={11} /> Archive
                </button>
              )}
              <button onClick={() => onDelete(idea.id)}
                className="tap text-xs px-2 py-1.5 rounded-lg flex items-center gap-1"
                style={{ background: 'rgb(239 68 68 / 0.1)', color: '#f87171' }}>
                <Trash2 size={11} /> Delete
              </button>
            </div>
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
    <div className="anim-page max-w-2xl mx-auto space-y-5 pb-8"
      style={{ '--accent-rgb': '236 72 153' } as React.CSSProperties}>

      {/* Dot grid overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `radial-gradient(circle, rgba(236,72,153,0.06) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }} />
      </div>

      {/* ── STUDIO HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{ background: 'var(--hero-bg)', border: `1px solid ${ACCENT}25`, minHeight: 110, zIndex: 1 }}>
        {/* Scanlines */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, ${ACCENT}03 3px, ${ACCENT}03 4px)` }} />
        {/* HUD corners */}
        {[['top-0 left-0', 'borderTop borderLeft'], ['top-0 right-0', 'borderTop borderRight'],
          ['bottom-0 left-0', 'borderBottom borderLeft'], ['bottom-0 right-0', 'borderBottom borderRight']
        ].map(([pos], i) => (
          <div key={i} className={`absolute ${pos} pointer-events-none`}
            style={{ width: 12, height: 12,
              ...(i === 0 && { borderTop: `1.5px solid ${ACCENT}`, borderLeft: `1.5px solid ${ACCENT}`, opacity: 0.5 }),
              ...(i === 1 && { borderTop: `1.5px solid ${ACCENT}`, borderRight: `1.5px solid ${ACCENT}`, opacity: 0.5 }),
              ...(i === 2 && { borderBottom: `1.5px solid ${ACCENT}`, borderLeft: `1.5px solid ${ACCENT}`, opacity: 0.5 }),
              ...(i === 3 && { borderBottom: `1.5px solid ${ACCENT}`, borderRight: `1.5px solid ${ACCENT}`, opacity: 0.5 }),
            }} />
        ))}
        {/* Top neon bar */}
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${ACCENT}60, transparent)`, boxShadow: `0 0 8px ${ACCENT}` }} />
        {/* REC indicator — top right */}
        <div className="absolute top-3 right-4 flex items-center gap-1.5 pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full"
            style={{ background: ACCENT, animation: 'neon-pulse 1.2s ease-in-out infinite', boxShadow: `0 0 6px ${ACCENT}` }} />
          <span className="text-[8px] font-mono font-black tracking-widest" style={{ color: ACCENT, opacity: 0.7 }}>REC</span>
        </div>
        {/* Content */}
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black tracking-[0.3em]" style={{ color: ACCENT, opacity: 0.6 }}>SIG://</span>
            <span className="text-[9px] font-mono opacity-30 text-white tracking-widest">CONTENT_STUDIO</span>
            <span className="cursor-blink font-mono" style={{ color: ACCENT, fontSize: 11 }}>▌</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight leading-none text-white"
            style={{ textShadow: `0 0 30px ${ACCENT}50` }}>
            CONTENT STUDIO
          </h1>
          <p className="font-mono text-[10px] mt-1" style={{ color: ACCENT, opacity: 0.5 }}>
            {'// idea pipeline — broadcast protocol active'}
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${ACCENT}40, transparent)` }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
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
        <div className="space-y-4">
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
              />
              <select value={dumpNiche ?? ''} onChange={e => setDumpNiche(e.target.value ? Number(e.target.value) : null)}
                className="text-sm rounded-xl px-2 py-2"
                style={{ background: 'var(--s3)', color: 'var(--t-muted)', border: '1px solid var(--b)' }}>
                <option value="">No niche</option>
                {niches.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
              <select value={dumpType} onChange={e => setDumpType(e.target.value as Idea['content_type'])}
                className="text-sm rounded-xl px-2 py-2"
                style={{ background: 'var(--s3)', color: 'var(--t-muted)', border: '1px solid var(--b)' }}>
                <option value="reel">Reel</option>
                <option value="post">Post</option>
                <option value="carousel">Carousel</option>
                <option value="story">Story</option>
              </select>
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
              <div key={status} className="card" style={{ padding: '12px 14px' }}>
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
            <div className="rounded-xl px-4 py-3 flex items-start gap-3"
              style={{ background: 'rgb(239 68 68 / 0.08)', border: '1px solid rgb(239 68 68 / 0.2)' }}>
              <AlertTriangle size={15} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p className="text-sm font-bold tracking-wide" style={{ color: '#f87171' }}>
                  {stats.daysSinceLastPost} DAYS WITHOUT A POST
                </p>
                <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--t-dim)' }}>
                  Last posted {stats.lastPostDate ? fmtDate(stats.lastPostDate) : 'never'}
                </p>
              </div>
            </div>
          )}

          <div className="card px-4 py-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="tap w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
                style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>‹</button>
              <div className="text-center">
                <p className="font-black text-sm tracking-wide" style={{ color: 'var(--t-head)' }}>
                  {new Date(calYear, calMonthNum - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase()}
                </p>
                <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--t-dim)' }}>
                  {calMonthIdeas.length} idea{calMonthIdeas.length !== 1 ? 's' : ''} · {calPosted} posted
                </p>
              </div>
              <button onClick={nextMonth} className="tap w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
                style={{ background: 'var(--s3)', color: 'var(--t-muted)' }}>›</button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <div key={d} className="text-center text-[10px] font-black tracking-wider py-1"
                  style={{ color: 'var(--t-faint)' }}>{d}</div>
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
                return (
                  <button key={day}
                    onClick={() => setCalDay(isSelected ? null : dateStr)}
                    className="tap flex flex-col items-center rounded-lg py-1.5"
                    style={{
                      background: isSelected ? `${ACCENT}22` : isToday ? 'var(--s3)' : 'transparent',
                      border: isToday ? `1px solid ${ACCENT}40` : '1px solid transparent',
                    }}>
                    <span className="text-xs font-semibold" style={{
                      color: isSelected ? ACCENT : isToday ? 'var(--t-head)' : 'var(--t-muted)',
                    }}>{day}</span>
                    <div className="flex flex-wrap justify-center gap-0.5 mt-0.5" style={{ minHeight: 6 }}>
                      {dayIdeas.slice(0, 3).map((idea, j) => (
                        <div key={j} className="w-1.5 h-1.5 rounded-full"
                          style={{ background: idea.niche_color || ACCENT }} />
                      ))}
                      {dayIdeas.length > 3 && (
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--t-faint)' }} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected day drawer */}
          {calDay && (
            <div className="card px-4 py-4 slide-up">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-black tracking-wide" style={{ color: 'var(--t-head)' }}>
                  {fmtDate(calDay).toUpperCase()}
                </p>
                <button onClick={() => setCalDay(null)} className="tap"
                  style={{ color: 'var(--t-faint)' }}><X size={14} /></button>
              </div>
              {(ideasByDate[calDay] || []).length === 0
                ? <p className="text-xs font-mono" style={{ color: 'var(--t-faint)' }}>// nothing scheduled</p>
                : (ideasByDate[calDay] || []).map(idea => (
                    <IdeaCard key={idea.id} idea={idea} niches={niches}
                      onUpdate={updateIdea} onDelete={deleteIdea} />
                  ))
              }
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
                          style={{ background: 'rgb(239 68 68 / 0.1)', color: '#f87171' }}>
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
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'POST STREAK', value: `${stats.postingStreak}w`, sub: 'consecutive weeks', color: '#f97316' },
              { label: 'LAST POST',   value: stats.daysSinceLastPost !== null ? `${stats.daysSinceLastPost}d` : '--',
                sub: stats.lastPostDate ? fmtDate(stats.lastPostDate) : 'Never posted', color: ACCENT },
              { label: 'PIPELINE',    value: String(stats.inPipeline), sub: 'ideas in flight', color: '#818cf8' },
            ].map(tile => (
              <div key={tile.label} className="card flex flex-col items-center py-4 px-2 text-center">
                <span className="text-2xl font-black" style={{ color: tile.color }}>{tile.value}</span>
                <span className="text-[9px] font-black tracking-[0.15em] mt-1"
                  style={{ color: tile.color, opacity: 0.7 }}>{tile.label}</span>
                <span className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--t-faint)' }}>{tile.sub}</span>
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
