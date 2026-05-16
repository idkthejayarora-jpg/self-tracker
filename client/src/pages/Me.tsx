import { useEffect, useState, useCallback } from 'react';
import { Plus, X, ChevronUp, Trash2, Pencil, Check, Sparkles, Trophy, Star, Dumbbell, Heart, Target, Eye, Activity, Wallet } from 'lucide-react';
import api from '../lib/api';
import type { MeSummary, MeProfile, MeSkill, MeClaim, MeMentor } from '../types';
import { useTheme } from '../contexts/ThemeContext';

// ── Count-up animation hook ───────────────────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    setValue(0);
    if (target === 0) return;
    let frame = 0;
    const totalFrames = Math.round(duration / 16);
    const timer = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(eased * target));
      if (frame >= totalFrames) { setValue(target); clearInterval(timer); }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

// ── Rank glow config ──────────────────────────────────────────────────────────
const RANK_GLOW: Record<string, string> = {
  E: 'rgba(107,114,128,0.25)',
  D: 'rgba(59,130,246,0.3)',
  C: 'rgba(34,197,94,0.3)',
  B: 'rgba(168,85,247,0.35)',
  A: 'rgba(249,115,22,0.35)',
  S: 'rgba(239,68,68,0.4)',
  SS: 'rgba(245,158,11,0.4)',
  SSS: 'rgba(226,201,126,0.5)',
};

const RANK_SOLID: Record<string, string> = {
  E: '#6b7280',
  D: '#3b82f6',
  C: '#22c55e',
  B: '#a855f7',
  A: '#f97316',
  S: '#ef4444',
  SS: '#f59e0b',
  SSS: '#e2c97e',
};

// ── Stat config ───────────────────────────────────────────────────────────────
const STAT_CONFIG = [
  { key: 'strength',   label: 'STRENGTH',   Icon: Dumbbell,  color: '#ef4444', hint: 'Workouts this month'   },
  { key: 'vitality',   label: 'VITALITY',   Icon: Heart,     color: '#22c55e', hint: 'Sleep quality (7 days)' },
  { key: 'discipline', label: 'DISCIPLINE', Icon: Target,    color: '#f97316', hint: 'Habit rate this week'   },
  { key: 'focus',      label: 'FOCUS',      Icon: Eye,       color: '#6366f1', hint: 'Tasks done this month'  },
  { key: 'endurance',  label: 'ENDURANCE',  Icon: Activity,  color: '#a855f7', hint: 'Longest streak ever'    },
  { key: 'wealth',     label: 'WEALTH',     Icon: Wallet,    color: '#f59e0b', hint: 'Finance net this month' },
];

const CLAIM_TYPE_COLOR: Record<string, string> = {
  quest: '#6366f1',
  achievement: '#f97316',
  legacy: '#a855f7',
};

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function SectionHeader({ title, sub, color }: { title: string; sub?: string; color?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <h2 className="text-[11px] font-black tracking-[0.14em] uppercase"
        style={{ color: color ?? 'var(--cyan)' }}>{title}</h2>
      {sub && <span className="text-[10px] font-medium" style={{ color: 'var(--t-muted)' }}>{sub}</span>}
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md capitalize"
      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
      {label}
    </span>
  );
}

// ── Brand of Sacrifice (Berserk) — accurate geometric form ───────────────────
function BrandOfSacrifice({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 200 308"
      className="brand-breathe"
      style={{
        width: '100%',
        maxWidth: 300,
        height: 'auto',
        color,
        overflow: 'visible',
        filter: `drop-shadow(0 0 16px ${color}) drop-shadow(0 0 48px ${color}44) drop-shadow(0 0 96px ${color}20)`,
      }}
      aria-hidden="true">
      <g stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="miter" fill="none">
        {/* Upper diamond */}
        <polygon points="100,58 165,120 100,178 35,120" />
        {/* Lower diamond */}
        <polygon points="100,178 165,236 100,294 35,236" />
        {/* Vertical spine through both */}
        <line x1="100" y1="58" x2="100" y2="294" />
        {/* Horizontal equator — upper diamond */}
        <line x1="35" y1="120" x2="165" y2="120" />
        {/* Horizontal equator — lower diamond */}
        <line x1="35" y1="236" x2="165" y2="236" />
        {/* Trident — center prong */}
        <line x1="100" y1="58" x2="100" y2="10" />
        {/* Trident — left fork */}
        <line x1="100" y1="38" x2="76" y2="22" />
        {/* Trident — right fork */}
        <line x1="100" y1="38" x2="124" y2="22" />
      </g>
    </svg>
  );
}

// ── Inline editable field ─────────────────────────────────────────────────────
function EditableField({
  value, placeholder, onSave, multiline = false, large = false, centered = false,
}: {
  value: string; placeholder: string; onSave: (v: string) => void;
  multiline?: boolean; large?: boolean; centered?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    onSave(draft.trim());
    setEditing(false);
  }

  if (!editing) {
    return (
      <div
        onClick={() => { setDraft(value); setEditing(true); }}
        className="cursor-text group relative"
        title="Click to edit">
        {value
          ? <span className={`${large ? 'text-2xl font-bold' : 'text-sm'} ${centered ? 'text-center block' : ''} text-head`}>{value}</span>
          : <span className={`${large ? 'text-2xl font-bold' : 'text-sm'} ${centered ? 'text-center block' : ''}`}
              style={{ color: 'var(--t-faint)' }}>{placeholder}</span>}
        <Pencil size={10} className="absolute -right-4 top-0.5 opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: 'var(--t-faint)' }} />
      </div>
    );
  }

  return multiline ? (
    <textarea autoFocus rows={3} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}
      className={`w-full rounded-lg px-2 py-1 text-sm resize-none focus:outline-none ${centered ? 'text-center' : ''}`}
      style={{ background: 'var(--s3)', border: '1px solid rgb(var(--accent-rgb)/0.3)' }} />
  ) : (
    <input autoFocus type="text" value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      className={`w-full rounded-lg px-2 py-1 focus:outline-none ${large ? 'text-2xl font-bold' : 'text-sm'} ${centered ? 'text-center' : ''}`}
      style={{ background: 'var(--s3)', border: '1px solid rgb(var(--accent-rgb)/0.3)' }} />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Me() {
  const { isLight } = useTheme();
  const [data, setData] = useState<MeSummary | null>(null);
  const [claimsTab, setClaimsTab] = useState<'active' | 'claimed'>('active');

  // Add-form visibility
  const [showSkillForm, setShowSkillForm]   = useState(false);
  const [showClaimForm, setShowClaimForm]   = useState(false);
  const [showMentorForm, setShowMentorForm] = useState(false);

  // Edit state — which card is open for editing
  const [editingSkillId,  setEditingSkillId]  = useState<number | null>(null);
  const [editingClaimId,  setEditingClaimId]  = useState<number | null>(null);
  const [editingMentorId, setEditingMentorId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<MeSummary>('/me/summary');
    setData(res.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Profile save ──
  async function saveProfile(patch: Partial<MeProfile>) {
    if (!data) return;
    const updated = { ...data.profile, ...patch };
    await api.put('/me/profile', updated);
    setData(d => d ? { ...d, profile: updated } : d);
  }

  // ── Skills ──
  async function addSkill(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const fd = new FormData(f);
    const res = await api.post<MeSkill>('/me/skills', {
      name: fd.get('name'), icon: fd.get('icon') || '⚡',
      level: Number(fd.get('level')) || 1, xp: Number(fd.get('xp')) || 0,
      description: fd.get('description'), category: fd.get('category') || 'general',
    });
    setData(d => d ? { ...d, skills: [...d.skills, res.data] } : d);
    f.reset(); setShowSkillForm(false);
  }

  async function levelUpSkill(id: number) {
    const skill = data?.skills.find(s => s.id === id);
    if (!skill) return;
    const res = await api.patch<MeSkill>(`/me/skills/${id}`, { level: skill.level + 1, xp: 0 });
    setData(d => d ? { ...d, skills: d.skills.map(s => s.id === id ? res.data : s) } : d);
  }

  async function deleteSkill(id: number) {
    await api.delete(`/me/skills/${id}`);
    setData(d => d ? { ...d, skills: d.skills.filter(s => s.id !== id) } : d);
  }

  async function saveSkillEdit(e: React.FormEvent<HTMLFormElement>, id: number) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await api.patch<MeSkill>(`/me/skills/${id}`, {
      name: fd.get('name'), icon: fd.get('icon') || '⚡',
      level: Number(fd.get('level')) || 1, xp: Math.min(100, Math.max(0, Number(fd.get('xp')) || 0)),
      description: fd.get('description'), category: fd.get('category') || 'general',
    });
    setData(d => d ? { ...d, skills: d.skills.map(s => s.id === id ? res.data : s) } : d);
    setEditingSkillId(null);
  }

  // ── Claims ──
  async function addClaim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const fd = new FormData(f);
    const res = await api.post<MeClaim>('/me/claims', {
      title: fd.get('title'), description: fd.get('description'),
      claim_type: fd.get('claim_type') || 'quest',
      deadline: fd.get('deadline') || null, reward_text: fd.get('reward_text'),
      icon: fd.get('icon') || '🎯',
    });
    setData(d => d ? { ...d, claims: [...d.claims, res.data] } : d);
    f.reset(); setShowClaimForm(false);
  }

  async function claimIt(id: number) {
    const res = await api.patch<MeClaim>(`/me/claims/${id}`, { status: 'claimed' });
    setData(d => d ? { ...d, claims: d.claims.map(c => c.id === id ? res.data : c) } : d);
  }

  async function deleteClaim(id: number) {
    await api.delete(`/me/claims/${id}`);
    setData(d => d ? { ...d, claims: d.claims.filter(c => c.id !== id) } : d);
  }

  async function saveClaimEdit(e: React.FormEvent<HTMLFormElement>, id: number) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await api.patch<MeClaim>(`/me/claims/${id}`, {
      title: fd.get('title'), icon: fd.get('icon') || '🎯',
      description: fd.get('description'),
      claim_type: fd.get('claim_type') || 'quest',
      deadline: fd.get('deadline') || null,
      reward_text: fd.get('reward_text'),
    });
    setData(d => d ? { ...d, claims: d.claims.map(c => c.id === id ? res.data : c) } : d);
    setEditingClaimId(null);
  }

  // ── Mentors ──
  async function addMentor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const fd = new FormData(f);
    const res = await api.post<MeMentor>('/me/mentors', {
      name: fd.get('name'), era: fd.get('era'), domain: fd.get('domain'),
      trait: fd.get('trait'), progress: Number(fd.get('progress')) || 0,
      icon: fd.get('icon') || '👤', notes: fd.get('notes'),
    });
    setData(d => d ? { ...d, mentors: [...d.mentors, res.data] } : d);
    f.reset(); setShowMentorForm(false);
  }

  async function updateMentorProgress(id: number, progress: number) {
    await api.patch(`/me/mentors/${id}`, { progress });
    setData(d => d ? { ...d, mentors: d.mentors.map(m => m.id === id ? { ...m, progress } : m) } : d);
  }

  async function deleteMentor(id: number) {
    await api.delete(`/me/mentors/${id}`);
    setData(d => d ? { ...d, mentors: d.mentors.filter(m => m.id !== id) } : d);
  }

  async function saveMentorEdit(e: React.FormEvent<HTMLFormElement>, id: number) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await api.patch<MeMentor>(`/me/mentors/${id}`, {
      name: fd.get('name'), icon: fd.get('icon') || '👤',
      era: fd.get('era'), domain: fd.get('domain'),
      trait: fd.get('trait'),
      progress: Math.min(100, Math.max(0, Number(fd.get('progress')) || 0)),
      notes: fd.get('notes'),
    });
    setData(d => d ? { ...d, mentors: d.mentors.map(m => m.id === id ? res.data : m) } : d);
    setEditingMentorId(null);
  }

  // ── Hooks must all be called before any early return ──────────────────────
  // useCountUp is a hook — calling it after `if (!data) return` violates Rules of Hooks.
  const animatedMerit = useCountUp(data?.meritScore ?? 0);

  if (!data) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <span className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: 'rgb(var(--accent-rgb))', borderTopColor: 'transparent' }} />
    </div>
  );

  const { profile, rank, rankColor, rankLabel, rankDesc, meritScore, meritBreakdown, nextRank, totalPoints, stats, skills, claims, mentors } = data;
  const activeClaims = claims.filter(c => c.status === 'active');
  const claimedList  = claims.filter(c => c.status === 'claimed');
  const rankGlow     = RANK_GLOW[rank] ?? 'transparent';
  const rankSolid    = RANK_SOLID[rank] ?? rankColor;

  // ── Form field style shorthand
  const ff = 'w-full rounded-xl px-3 py-2 text-sm focus:outline-none';

  return (
    <div className="max-w-2xl mx-auto space-y-4 anim-page pb-12 relative px-1 sm:px-0" style={{ background: 'var(--s0)' }}>

      {/* Page-level animated scan line */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-none" style={{ zIndex: 0 }}>
        {/* Hex-dot grid overlay */}
        <div className="absolute inset-0"
          style={{
            opacity: isLight ? 0.06 : 0.03,
            backgroundImage: `radial-gradient(circle, ${isLight ? '#000000' : '#ffffff'} 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
          }} />
        {/* Scan line */}
        <div className="absolute left-0 right-0 h-[3px] pointer-events-none"
          style={{
            background: isLight
              ? 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.12) 50%, rgba(0,0,0,0.08) 60%, transparent 100%)'
              : 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 40%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.18) 60%, transparent 100%)',
            animation: 'scan-line 7s linear infinite',
          }} />
      </div>

      {/* ══════════════════════════════════════════════════════ CHARACTER CARD */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{
          minHeight: 360,
          background: isLight
            ? `radial-gradient(ellipse at 50% -5%, ${rankGlow} 0%, #f0f2f7 55%, #e4e8f0 100%)`
            : `radial-gradient(ellipse at 50% -5%, ${rankGlow} 0%, #090b10 55%, #030508 100%)`,
          boxShadow: isLight
            ? `0 0 60px ${rankGlow}, 0 0 120px ${rankGlow}40, inset 0 1px 0 rgba(255,255,255,0.80), 0 20px 60px rgba(0,0,0,0.12)`
            : `0 0 80px ${rankGlow}, 0 0 160px ${rankGlow}40, inset 0 1px 0 rgba(255,255,255,0.10), 0 30px 80px rgba(0,0,0,0.6)`,
          border: isLight ? `1px solid rgba(0,0,0,0.08)` : `1px solid rgba(255,255,255,0.10)`,
          backdropFilter: 'blur(0px)',
          zIndex: 1,
        }}>

        {/* Brand of Sacrifice — behind everything */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 0 }}>
          <div style={{ opacity: isLight ? 0.18 : 0.55, width: 'min(260px, 68%)', flexShrink: 0 }}>
            <BrandOfSacrifice color={rankSolid} />
          </div>
        </div>

        {/* Shimmer sheen */}
        <div className="shimmer-slide" style={{ zIndex: 2 }} />

        {/* Card content overlay */}
        <div className="relative flex flex-col items-center gap-3 px-4 py-6 sm:gap-4 sm:px-5 sm:py-8" style={{ zIndex: 3 }}>
          {/* Rank badge + label */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-3">
              <span
                className="rank-glow-anim text-[12px] font-black px-4 py-1.5 rounded-full tracking-[0.2em] uppercase"
                style={{
                  background: `${rankSolid}18`,
                  color: rankSolid,
                  border: `1px solid ${rankSolid}60`,
                  '--rg': rankSolid,
                } as React.CSSProperties}>
                {rank} RANK
              </span>
              <span className="font-mono text-[11px] font-bold tabular-nums"
                style={{ color: rankSolid, textShadow: `0 0 10px ${rankSolid}80` }}>
                {totalPoints.toLocaleString()} PTS
              </span>
            </div>
            {/* Rank label + desc */}
            <div className="text-center">
              <p className="text-[13px] font-bold tracking-wide" style={{ color: rankSolid, textShadow: isLight ? 'none' : `0 0 10px ${rankSolid}60` }}>{rankLabel}</p>
              <p className="text-[11px] mt-0.5 font-medium" style={{ color: 'var(--t-muted)' }}>{rankDesc}</p>
            </div>
          </div>

          {/* Merit score panel */}
          <div className="glass w-full max-w-sm rounded-xl px-4 py-3 space-y-2"
            style={{ border: `1px solid ${rankSolid}25` }}>
            {/* Total merit bar */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--t-muted)' }}>MERIT SCORE</span>
              <span className="font-black font-mono text-sm tabular-nums" style={{ color: rankSolid, textShadow: `0 0 8px ${rankSolid}80` }}>
                {animatedMerit}<span className="text-[10px] font-normal opacity-50">/100</span>
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--s3)' }}>
              <div className="h-full rounded-full transition-all duration-700 bar-fill"
                style={{ width: `${meritScore}%`, background: rankSolid, boxShadow: `0 0 8px ${rankSolid}` }} />
            </div>
            {/* Breakdown */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {([
                { label: 'STATS', val: meritBreakdown.statScore,  max: 60, color: '#ef4444' },
                { label: 'SKILLS', val: meritBreakdown.skillScore, max: 20, color: '#39ff14' },
                { label: 'CLAIMS', val: meritBreakdown.claimScore, max: 10, color: '#6366f1' },
                { label: 'PTS',   val: meritBreakdown.ptsScore,   max: 10, color: '#f59e0b' },
              ]).map(b => (
                <div key={b.label} className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] tracking-wider font-semibold" style={{ color: 'var(--t-muted)' }}>{b.label}</span>
                  <span className="text-xs font-black font-mono" style={{ color: b.color }}>
                    {b.val}<span className="text-[9px] opacity-40">/{b.max}</span>
                  </span>
                  <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--s3)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(b.val / b.max) * 100}%`, background: b.color }} />
                  </div>
                </div>
              ))}
            </div>
            {/* Next rank progress */}
            {nextRank && (
              <p className="text-[10px] text-center pt-0.5" style={{ color: 'var(--t-faint)' }}>
                Next: <span style={{ color: nextRank.color, fontWeight: 700 }}>{nextRank.rank} — {nextRank.label}</span>
                <span className="opacity-60"> ({nextRank.min - meritScore} pts to go)</span>
              </p>
            )}
          </div>

          {/* Avatar ring + emoji */}
          <div className="relative flex items-center justify-center">
            {/* Rotating ring */}
            <div className="spin-slow absolute rounded-full"
              style={{
                width: 96, height: 96,
                border: `2px solid ${rankSolid}`,
                opacity: 0.4,
                boxShadow: `0 0 14px ${rankSolid}60`,
              }} />
            <div className="relative z-10" style={{ fontSize: 52, lineHeight: 1, padding: 4 }}>
              {profile.avatar_emoji || '⚔️'}
            </div>
          </div>

          {/* Name */}
          <div className="text-center w-full max-w-xs">
            <EditableField value={profile.character_name} placeholder="Your character name"
              onSave={v => saveProfile({ character_name: v })} large centered />
          </div>

          {/* Title · Class */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="text-[11px] font-semibold tracking-wider"
              style={{ color: `${rankSolid}cc` }}>
              <EditableField value={profile.title} placeholder="Your title"
                onSave={v => saveProfile({ title: v })} centered />
            </span>
            {profile.title && profile.class && (
              <span style={{ color: 'var(--t-faint)' }}>·</span>
            )}
            <span className="text-[11px]" style={{ color: 'var(--t-muted)' }}>
              <EditableField value={profile.class} placeholder="Your class"
                onSave={v => saveProfile({ class: v })} centered />
            </span>
          </div>

          {/* Bio */}
          <div className="w-full max-w-md text-center">
            <EditableField value={profile.bio} placeholder="Write your origin story…"
              onSave={v => saveProfile({ bio: v })} multiline centered />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════ ADVENTURE */}
      <div className="glass rounded-2xl px-5 py-4 relative"
        style={{ borderLeft: `3px solid rgb(var(--accent-rgb))`, zIndex: 1 }}>
        <p className="text-[10px] font-bold tracking-[0.15em] mb-2 flex items-center gap-1.5"
          style={{ color: 'var(--t-faint)' }}>
          <Sparkles size={11} /> MAIN QUEST
        </p>
        <EditableField
          value={profile.adventure}
          placeholder="What is your ultimate aspiration? Your life's great adventure…"
          onSave={v => saveProfile({ adventure: v })}
          multiline />
      </div>

      {/* ══════════════════════════════════════════════════════ STATS */}
      <div style={{ zIndex: 1, position: 'relative' }}>
        <SectionHeader title="CHARACTER STATS" sub="— live from your logs" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {STAT_CONFIG.map((s, idx) => {
            const val = stats[s.key as keyof typeof stats];
            return (
              <div key={s.key}
                className="glass glow-card rounded-2xl px-3 py-3 space-y-2 stat-pop group transition-all duration-200"
                title={s.hint}
                style={{ borderLeft: `3px solid ${s.color}`, animationDelay: `${idx * 60}ms`, '--gc': `${s.color}55` } as React.CSSProperties}>
                <div className="flex items-center justify-between">
                  <s.Icon size={16} style={{ color: s.color }} />
                  <span className="text-3xl font-black tabular-nums font-mono"
                    style={{ color: s.color, textShadow: `0 0 12px ${s.color}80` }}>{val}</span>
                </div>
                <div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--s3)' }}>
                    <div className="h-full rounded-full bar-fill"
                      style={{
                        width: `${val}%`,
                        background: s.color,
                        boxShadow: `0 0 8px ${s.color}`,
                      }} />
                  </div>
                  <p className="text-[10px] mt-1 font-bold tracking-[0.12em] uppercase"
                    style={{ color: 'var(--t-muted)' }}>
                    {s.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] mt-1.5 font-medium" style={{ color: 'var(--t-muted)' }}>
          ↑ Stats update as you log workouts, sleep, habits, tasks, streaks & finance
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════ SKILLS */}
      <div style={{ zIndex: 1, position: 'relative' }}>
        <div className="glass flex items-center justify-between mb-3 rounded-xl px-3 py-2">
          <SectionHeader title="SKILLS & ABILITIES" />
          <button onClick={() => setShowSkillForm(s => !s)}
            className="flex items-center gap-1 text-[11px] font-semibold tap px-2 py-1 rounded-lg"
            style={{ background: 'rgb(var(--accent-rgb)/0.12)', color: 'rgb(var(--accent-rgb-light))' }}>
            <Plus size={11} /> Skill
          </button>
        </div>

        {showSkillForm && (
          <form onSubmit={addSkill} className="rounded-2xl px-3 py-4 mb-3 space-y-2 scale-in sm:px-4"
            style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input name="name" required placeholder="Skill name" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
              <input name="icon" placeholder="Icon (emoji)" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
            </div>
            <input name="description" placeholder="Description (optional)" className={ff}
              style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
            <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>LEVEL</p>
                <input name="level" type="number" min={1} max={100} defaultValue={1} className={ff}
                  style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>XP (0–100)</p>
                <input name="xp" type="number" min={0} max={100} defaultValue={0} className={ff}
                  style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>CATEGORY</p>
                <input name="category" placeholder="combat" className={ff}
                  style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white tap"
                style={{ background: 'rgb(var(--accent-rgb))' }}>Add Skill</button>
              <button type="button" onClick={() => setShowSkillForm(false)}
                className="px-3 py-1.5 rounded-xl text-xs tap" style={{ color: 'var(--t-faint)' }}>Cancel</button>
            </div>
          </form>
        )}

        {skills.length === 0 && !showSkillForm && (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--t-faint)' }}>
            No skills yet — add your first ability
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {skills.map(skill => (
            <div key={skill.id}
              className="glass glow-card rounded-2xl overflow-hidden group transition-all duration-200"
              style={{ borderLeft: `3px solid rgb(var(--accent-rgb)/0.6)`, '--gc': 'rgba(99,102,241,0.45)' } as React.CSSProperties}>

              {/* ── Edit form (shown when editing) ── */}
              {editingSkillId === skill.id ? (
                <form onSubmit={e => saveSkillEdit(e, skill.id)} className="px-3 py-3 space-y-2 scale-in">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black tracking-widest" style={{ color: 'rgb(var(--accent-rgb-light))' }}>EDITING SKILL</span>
                    <div className="h-px flex-1" style={{ background: 'var(--b)' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input name="name" required defaultValue={skill.name} placeholder="Skill name" className={ff}
                      style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                    <input name="icon" defaultValue={skill.icon} placeholder="Emoji" className={ff}
                      style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                  </div>
                  <input name="description" defaultValue={skill.description} placeholder="Description" className={ff}
                    style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[9px] mb-1 font-bold tracking-wider" style={{ color: 'var(--t-faint)' }}>LEVEL</p>
                      <input name="level" type="number" min={1} max={999} defaultValue={skill.level} className={ff}
                        style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                    </div>
                    <div>
                      <p className="text-[9px] mb-1 font-bold tracking-wider" style={{ color: 'var(--t-faint)' }}>XP (0–100)</p>
                      <input name="xp" type="number" min={0} max={100} defaultValue={skill.xp} className={ff}
                        style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                    </div>
                    <div>
                      <p className="text-[9px] mb-1 font-bold tracking-wider" style={{ color: 'var(--t-faint)' }}>CATEGORY</p>
                      <input name="category" defaultValue={skill.category} placeholder="general" className={ff}
                        style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white tap"
                      style={{ background: 'rgb(var(--accent-rgb))' }}>
                      <Check size={11} /> Save
                    </button>
                    <button type="button" onClick={() => setEditingSkillId(null)}
                      className="px-3 py-1.5 rounded-xl text-xs tap" style={{ color: 'var(--t-faint)' }}>Cancel</button>
                  </div>
                </form>
              ) : (
                /* ── Normal view ── */
                <div className="px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[28px] leading-none shrink-0">{skill.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-head truncate">{skill.name}</p>
                        {skill.description && (
                          <p className="text-[11px] truncate" style={{ color: 'var(--t-faint)' }}>{skill.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] font-black px-2 py-1 rounded-md"
                        style={{ background: '#39ff1412', color: '#39ff14', border: '1px solid #39ff1440', textShadow: '0 0 8px #39ff1480' }}>
                        LVL {skill.level}
                      </span>
                      <button onClick={() => levelUpSkill(skill.id)}
                        className="w-6 h-6 rounded flex items-center justify-center tap opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
                        style={{ background: '#22c55e18', border: '1px solid #22c55e30' }} title="Level up">
                        <ChevronUp size={11} style={{ color: '#22c55e' }} />
                      </button>
                      <button onClick={() => { setEditingSkillId(skill.id); setShowSkillForm(false); }}
                        className="w-6 h-6 rounded flex items-center justify-center tap opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'var(--s3)' }} title="Edit skill">
                        <Pencil size={9} style={{ color: 'rgb(var(--accent-rgb-light))' }} />
                      </button>
                      <button onClick={() => deleteSkill(skill.id)}
                        className="w-6 h-6 rounded flex items-center justify-center tap opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'var(--s3)' }}>
                        <X size={9} style={{ color: '#ef4444' }} />
                      </button>
                    </div>
                  </div>
                  {/* XP bar — click to set XP directly */}
                  <div className="mt-2.5 space-y-1">
                    <div className="relative h-3 rounded-full overflow-hidden cursor-pointer"
                      style={{ background: 'var(--s3)' }}
                      title={`${skill.xp}/100 XP — click to set`}
                      onClick={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = Math.round(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)));
                        api.patch<MeSkill>(`/me/skills/${skill.id}`, { xp: pct }).then(r =>
                          setData(d => d ? { ...d, skills: d.skills.map(s => s.id === skill.id ? r.data : s) } : d)
                        );
                      }}>
                      <div className="h-full rounded-full bar-fill"
                        style={{
                          width: `${skill.xp}%`,
                          background: `linear-gradient(90deg, rgb(var(--accent-rgb)/0.8), rgb(var(--accent-rgb)))`,
                          boxShadow: `0 0 6px rgb(var(--accent-rgb)/0.6)`,
                        }} />
                      {skill.xp > 0 && (
                        <div className="xp-shimmer-bar absolute inset-0 rounded-full" style={{ mixBlendMode: 'screen' }} />
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--t-muted)' }}>{skill.category}</span>
                      <span className="text-[10px] font-mono font-semibold" style={{ color: 'var(--t-muted)' }}>{skill.xp}/100 XP</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════ CLAIMS */}
      <div style={{ zIndex: 1, position: 'relative' }}>
        <div className="glass flex items-center justify-between mb-3 rounded-xl px-3 py-2 flex-wrap gap-2">
          {/* Tabs — styled as quest log header */}
          <div className="flex items-center gap-1 flex-wrap">
            {(['active', 'claimed'] as const).map(tab => (
              <button key={tab} onClick={() => setClaimsTab(tab)}
                className="text-[10px] sm:text-[11px] font-bold px-2 sm:px-3 py-1 rounded-lg tap capitalize tracking-wider"
                style={{
                  background: claimsTab === tab ? 'rgb(var(--accent-rgb)/0.12)' : 'transparent',
                  color: claimsTab === tab ? 'rgb(var(--accent-rgb-light))' : 'var(--t-faint)',
                  borderBottom: claimsTab === tab ? `2px solid rgb(var(--accent-rgb)/0.6)` : '2px solid transparent',
                }}>
                {tab === 'active' ? `QUEST LOG — ACTIVE (${activeClaims.length})` : `CLAIMED (${claimedList.length})`}
              </button>
            ))}
          </div>
          <button onClick={() => setShowClaimForm(s => !s)}
            className="flex items-center gap-1 text-[11px] font-semibold tap px-2 py-1 rounded-lg"
            style={{ background: 'rgb(var(--accent-rgb)/0.12)', color: 'rgb(var(--accent-rgb-light))' }}>
            <Plus size={11} /> Claim
          </button>
        </div>

        {showClaimForm && (
          <form onSubmit={addClaim} className="rounded-2xl px-3 py-4 mb-3 space-y-2 scale-in sm:px-4"
            style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input name="title" required placeholder="Quest title" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
              <input name="icon" placeholder="Icon (emoji)" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
            </div>
            <input name="description" placeholder="Description" className={ff}
              style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>TYPE</p>
                <select name="claim_type" className={ff}
                  style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }}>
                  <option value="quest">Quest</option>
                  <option value="achievement">Achievement</option>
                  <option value="legacy">Legacy</option>
                </select>
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>DEADLINE</p>
                <input name="deadline" type="date" className={ff}
                  style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
              </div>
            </div>
            <input name="reward_text" placeholder="Reward / what you unlock" className={ff}
              style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
            <div className="flex gap-2 pt-1">
              <button type="submit"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white tap"
                style={{ background: 'rgb(var(--accent-rgb))' }}>Add Claim</button>
              <button type="button" onClick={() => setShowClaimForm(false)}
                className="px-3 py-1.5 rounded-xl text-xs tap" style={{ color: 'var(--t-faint)' }}>Cancel</button>
            </div>
          </form>
        )}

        {(claimsTab === 'active' ? activeClaims : claimedList).length === 0 && (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--t-faint)' }}>
            {claimsTab === 'active' ? 'No active claims — add your next quest' : 'Nothing claimed yet'}
          </p>
        )}

        <div className="space-y-2">
          {(claimsTab === 'active' ? activeClaims : claimedList).map(claim => {
            const tc = CLAIM_TYPE_COLOR[claim.claim_type] ?? '#6366f1';
            const isOverdue = claim.deadline && claim.deadline < new Date().toISOString().slice(0, 10);
            return (
              <div key={claim.id}
                className="glass glow-card rounded-2xl overflow-hidden transition-all duration-200 group"
                style={{ borderLeft: `4px solid ${tc}`, opacity: claim.status === 'claimed' ? 0.7 : 1, '--gc': `${tc}55` } as React.CSSProperties}>

                {/* ── Edit form ── */}
                {editingClaimId === claim.id ? (
                  <form onSubmit={e => saveClaimEdit(e, claim.id)} className="px-4 py-3 space-y-2 scale-in">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-black tracking-widest" style={{ color: tc }}>EDITING CLAIM</span>
                      <div className="h-px flex-1" style={{ background: 'var(--b)' }} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input name="title" required defaultValue={claim.title} placeholder="Quest title" className={ff}
                        style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                      <input name="icon" defaultValue={claim.icon} placeholder="Emoji" className={ff}
                        style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                    </div>
                    <input name="description" defaultValue={claim.description} placeholder="Description" className={ff}
                      style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[9px] mb-1 font-bold tracking-wider" style={{ color: 'var(--t-faint)' }}>TYPE</p>
                        <select name="claim_type" defaultValue={claim.claim_type} className={ff}
                          style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }}>
                          <option value="quest">Quest</option>
                          <option value="achievement">Achievement</option>
                          <option value="legacy">Legacy</option>
                        </select>
                      </div>
                      <div>
                        <p className="text-[9px] mb-1 font-bold tracking-wider" style={{ color: 'var(--t-faint)' }}>DEADLINE</p>
                        <input name="deadline" type="date" defaultValue={claim.deadline ?? ''} className={ff}
                          style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                      </div>
                    </div>
                    <input name="reward_text" defaultValue={claim.reward_text} placeholder="Reward / what you unlock" className={ff}
                      style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                    <div className="flex gap-2 pt-1">
                      <button type="submit" className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white tap"
                        style={{ background: 'rgb(var(--accent-rgb))' }}>
                        <Check size={11} /> Save
                      </button>
                      <button type="button" onClick={() => setEditingClaimId(null)}
                        className="px-3 py-1.5 rounded-xl text-xs tap" style={{ color: 'var(--t-faint)' }}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  /* ── Normal view ── */
                  <div className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      {/* Large icon column */}
                      <span className="text-[32px] leading-none mt-0.5 shrink-0">{claim.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-head">{claim.title}</p>
                          <Chip label={claim.claim_type} color={tc} />
                          {claim.status === 'claimed' && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                              style={{
                                background: '#f59e0b18',
                                color: '#f59e0b',
                                border: '1px solid #f59e0b50',
                                textShadow: '0 0 8px #f59e0b80',
                              }}>
                              ✓ CLAIMED
                            </span>
                          )}
                        </div>
                        {claim.description && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--t-muted)' }}>{claim.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {claim.deadline && (
                            <span className="text-[10px]" style={{ color: isOverdue ? '#ef4444' : 'var(--t-faint)' }}>
                              {isOverdue ? '⚠ ' : ''}⏳ {claim.deadline}
                            </span>
                          )}
                          {claim.reward_text && (
                            <span className="text-[10px] flex items-center gap-1" style={{ color: '#f59e0b' }}>
                              <Trophy size={9} /> {claim.reward_text}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {claim.status === 'active' && (
                          <button onClick={() => claimIt(claim.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold tap btn-glow claim-pulse-btn"
                            style={{
                              background: `${tc}18`,
                              color: tc,
                              border: `1px solid ${tc}40`,
                              '--cp': tc,
                              '--btn-glow': `${tc}60`,
                              animation: 'claim-pulse 2.5s ease-in-out infinite',
                            } as React.CSSProperties}>
                            <Check size={10} /> Claim it
                          </button>
                        )}
                        <button
                          onClick={() => { setEditingClaimId(claim.id); setShowClaimForm(false); }}
                          className="w-6 h-6 flex items-center justify-center rounded tap opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: 'var(--s3)' }} title="Edit claim">
                          <Pencil size={9} style={{ color: tc }} />
                        </button>
                        <button onClick={() => deleteClaim(claim.id)}
                          className="w-6 h-6 flex items-center justify-center rounded tap opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: 'var(--t-faint)' }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════ MENTOR HALL */}
      <div style={{ zIndex: 1, position: 'relative' }}>
        <div className="glass flex items-center justify-between mb-3 rounded-xl px-3 py-2">
          <SectionHeader title="MENTOR HALL" sub="— figures you embody" />
          <button onClick={() => setShowMentorForm(s => !s)}
            className="flex items-center gap-1 text-[11px] font-semibold tap px-2 py-1 rounded-lg"
            style={{ background: 'rgb(var(--accent-rgb)/0.12)', color: 'rgb(var(--accent-rgb-light))' }}>
            <Plus size={11} /> Mentor
          </button>
        </div>

        {showMentorForm && (
          <form onSubmit={addMentor} className="rounded-2xl px-3 py-4 mb-3 space-y-2 scale-in sm:px-4"
            style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input name="name" required placeholder="Name (e.g. Marcus Aurelius)" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
              <input name="icon" placeholder="Icon (emoji)" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input name="era" placeholder="Era (Ancient / Modern / Fictional)" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
              <input name="domain" placeholder="Domain (Stoicism / Combat…)" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
            </div>
            <input name="trait" placeholder="Trait you're embodying from them" className={ff}
              style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
            <div>
              <p className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>EMBODIMENT PROGRESS (0–100)</p>
              <input name="progress" type="number" min={0} max={100} defaultValue={0} className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
            </div>
            <textarea name="notes" placeholder="Notes / quotes from them…" rows={2}
              className={`${ff} resize-none`}
              style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
            <div className="flex gap-2 pt-1">
              <button type="submit"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white tap"
                style={{ background: 'rgb(var(--accent-rgb))' }}>Add Mentor</button>
              <button type="button" onClick={() => setShowMentorForm(false)}
                className="px-3 py-1.5 rounded-xl text-xs tap" style={{ color: 'var(--t-faint)' }}>Cancel</button>
            </div>
          </form>
        )}

        {mentors.length === 0 && !showMentorForm && (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--t-faint)' }}>
            No mentors yet — add a figure who shaped who you are becoming
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {mentors.map(mentor => (
            <div key={mentor.id}
              className="glass glow-card rounded-2xl group relative overflow-hidden"
              style={{ '--gc': 'rgba(168,85,247,0.4)' } as React.CSSProperties}>

              {/* ── Edit form ── */}
              {editingMentorId === mentor.id ? (
                <form onSubmit={e => saveMentorEdit(e, mentor.id)} className="px-4 py-4 space-y-2 scale-in">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black tracking-widest" style={{ color: '#a855f7' }}>EDITING MENTOR</span>
                    <div className="h-px flex-1" style={{ background: 'var(--b)' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input name="name" required defaultValue={mentor.name} placeholder="Name" className={ff}
                      style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                    <input name="icon" defaultValue={mentor.icon} placeholder="Emoji" className={ff}
                      style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input name="era" defaultValue={mentor.era} placeholder="Era (Ancient / Modern…)" className={ff}
                      style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                    <input name="domain" defaultValue={mentor.domain} placeholder="Domain (Stoicism…)" className={ff}
                      style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                  </div>
                  <input name="trait" defaultValue={mentor.trait} placeholder="Trait you're embodying" className={ff}
                    style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                  <div>
                    <p className="text-[9px] mb-1 font-bold tracking-wider" style={{ color: 'var(--t-faint)' }}>EMBODIMENT PROGRESS (0–100)</p>
                    <input name="progress" type="number" min={0} max={100} defaultValue={mentor.progress} className={ff}
                      style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                  </div>
                  <textarea name="notes" defaultValue={mentor.notes} placeholder="Notes / quotes…" rows={2}
                    className={`${ff} resize-none`}
                    style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid var(--b)' }} />
                  <div className="flex gap-2 pt-1">
                    <button type="submit" className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white tap"
                      style={{ background: 'rgb(var(--accent-rgb))' }}>
                      <Check size={11} /> Save
                    </button>
                    <button type="button" onClick={() => setEditingMentorId(null)}
                      className="px-3 py-1.5 rounded-xl text-xs tap" style={{ color: 'var(--t-faint)' }}>Cancel</button>
                  </div>
                </form>
              ) : (
                /* ── Normal view ── */
                <div className="px-4 py-4">
                  {/* Portrait frame corners */}
                  <div className="absolute top-2 left-2 w-4 h-4 pointer-events-none"
                    style={{ borderTop: '1px solid var(--b)', borderLeft: '1px solid var(--b)' }} />
                  <div className="absolute top-2 right-2 w-4 h-4 pointer-events-none"
                    style={{ borderTop: '1px solid var(--b)', borderRight: '1px solid var(--b)' }} />
                  <div className="absolute bottom-2 left-2 w-4 h-4 pointer-events-none"
                    style={{ borderBottom: '1px solid var(--b)', borderLeft: '1px solid var(--b)' }} />
                  <div className="absolute bottom-2 right-2 w-4 h-4 pointer-events-none"
                    style={{ borderBottom: '1px solid var(--b)', borderRight: '1px solid var(--b)' }} />

                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[32px] leading-none">{mentor.icon}</span>
                      <div>
                        <p className="text-sm font-bold text-head">{mentor.name}</p>
                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                          {mentor.era && <Chip label={mentor.era} color="#6366f1" />}
                          {mentor.domain && <Chip label={mentor.domain} color="#a855f7" />}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingMentorId(mentor.id); setShowMentorForm(false); }}
                        className="w-6 h-6 flex items-center justify-center rounded tap opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'var(--s3)' }} title="Edit mentor">
                        <Pencil size={9} style={{ color: '#a855f7' }} />
                      </button>
                      <button onClick={() => deleteMentor(mentor.id)}
                        className="w-6 h-6 flex items-center justify-center rounded tap opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--t-faint)' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {mentor.trait && (
                    <p className="text-xs mb-2 flex items-center gap-1" style={{ color: 'rgb(var(--accent-rgb-light))' }}>
                      <Star size={10} /> Embodying: <span className="font-semibold">{mentor.trait}</span>
                    </p>
                  )}

                  {/* Embodiment progress — clickable bar */}
                  <div className="space-y-1 mb-2">
                    <div className="flex justify-between">
                      <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: 'var(--t-muted)' }}>EMBODIMENT</span>
                      <span className="text-[10px] font-black font-mono"
                        style={{
                          color: 'rgb(var(--accent-rgb-light))',
                          textShadow: mentor.progress > 0 ? '0 0 8px rgb(var(--accent-rgb)/0.6)' : 'none',
                        }}>
                        {mentor.progress}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden cursor-pointer relative"
                      style={{ background: 'var(--s3)' }}
                      title="Click to set progress"
                      onClick={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = Math.round(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)));
                        updateMentorProgress(mentor.id, pct);
                      }}>
                      <div className="h-full rounded-full bar-fill"
                        style={{
                          width: `${mentor.progress}%`,
                          background: 'rgb(var(--accent-rgb))',
                          boxShadow: '0 0 8px rgb(var(--accent-rgb)/0.7)',
                        }} />
                      {mentor.progress > 0 && (
                        <div className="xp-shimmer-bar absolute inset-0 rounded-full" style={{ mixBlendMode: 'screen' }} />
                      )}
                    </div>
                  </div>

                  {mentor.notes && (
                    <p className="text-[11px] mt-2 italic leading-relaxed" style={{ color: 'var(--t-muted)' }}>
                      " {mentor.notes}"
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
