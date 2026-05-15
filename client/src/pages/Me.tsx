import { useEffect, useState, useCallback } from 'react';
import { Plus, X, ChevronUp, Trash2, Pencil, Check, Sparkles, Trophy, Star } from 'lucide-react';
import api from '../lib/api';
import type { MeSummary, MeProfile, MeSkill, MeClaim, MeMentor } from '../types';

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
  { key: 'strength',   label: 'STRENGTH',   icon: '⚔️', color: '#ef4444', hint: 'Workouts this month'   },
  { key: 'vitality',   label: 'VITALITY',   icon: '🛡️', color: '#22c55e', hint: 'Sleep quality (7 days)' },
  { key: 'discipline', label: 'DISCIPLINE', icon: '🔥', color: '#f97316', hint: 'Habit rate this week'   },
  { key: 'focus',      label: 'FOCUS',      icon: '🧠', color: '#6366f1', hint: 'Tasks done this month'  },
  { key: 'endurance',  label: 'ENDURANCE',  icon: '💎', color: '#a855f7', hint: 'Longest streak ever'    },
  { key: 'wealth',     label: 'WEALTH',     icon: '💰', color: '#f59e0b', hint: 'Finance net this month' },
];

const CLAIM_TYPE_COLOR: Record<string, string> = {
  quest: '#6366f1',
  achievement: '#f97316',
  legacy: '#a855f7',
};

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <h2 className="text-xs font-bold tracking-[0.15em] uppercase"
        style={{ color: 'var(--t-faint)', letterSpacing: '0.15em' }}>{title}</h2>
      {sub && <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>{sub}</span>}
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

// ── Warrior SVG silhouette ─────────────────────────────────────────────────────
function WarriorSilhouette({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 120 220"
      className="warrior-float"
      style={{ color, fill: 'currentColor', stroke: 'currentColor' }}
      aria-hidden="true"
    >
      {/* Cape */}
      <path d="M38 52 Q12 120 18 210 L60 195 L102 210 Q108 120 82 52 Z" fill="currentColor" opacity="0.18" />
      {/* Body */}
      <path d="M34 50 L86 50 L79 115 L41 115 Z" fill="currentColor" />
      {/* Head */}
      <circle cx="60" cy="27" r="15" fill="currentColor" />
      {/* Helmet crest */}
      <polygon points="60,8 50,22 70,22" fill="currentColor" />
      {/* Left arm raised: shoulder → elbow → hand */}
      <line x1="35" y1="56" x2="18" y2="33" strokeWidth="8" strokeLinecap="round" fill="none" />
      <line x1="18" y1="33" x2="11" y2="10" strokeWidth="8" strokeLinecap="round" fill="none" />
      {/* Sword blade */}
      <rect x="4" y="-4" width="5" height="30" rx="1.5" fill="currentColor" transform="rotate(-18 6 13)" />
      {/* Sword guard */}
      <rect x="-2" y="10" width="17" height="4" rx="1" fill="currentColor" transform="rotate(-18 6 13)" />
      {/* Right arm */}
      <line x1="85" y1="56" x2="104" y2="74" strokeWidth="8" strokeLinecap="round" fill="none" />
      {/* Left leg */}
      <polyline points="47,115 39,172 34,210" strokeWidth="10" strokeLinecap="round" fill="none" />
      {/* Right leg */}
      <polyline points="73,115 81,172 86,210" strokeWidth="10" strokeLinecap="round" fill="none" />
      {/* Left boot */}
      <ellipse cx="34" cy="212" rx="10" ry="5" fill="currentColor" />
      {/* Right boot */}
      <ellipse cx="86" cy="212" rx="10" ry="5" fill="currentColor" />
      {/* Outer aura ring */}
      <ellipse cx="60" cy="110" rx="56" ry="102" fill="none" stroke="currentColor" strokeWidth="0.8"
        opacity="0.15" className="aura-breathe" />
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
  const [data, setData] = useState<MeSummary | null>(null);
  const [claimsTab, setClaimsTab] = useState<'active' | 'claimed'>('active');

  // Add-form visibility
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [showMentorForm, setShowMentorForm] = useState(false);

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

  if (!data) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <span className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: 'rgb(var(--accent-rgb))', borderTopColor: 'transparent' }} />
    </div>
  );

  const { profile, rank, rankColor, totalPoints, stats, skills, claims, mentors } = data;
  const activeClaims = claims.filter(c => c.status === 'active');
  const claimedList  = claims.filter(c => c.status === 'claimed');
  const rankGlow     = RANK_GLOW[rank] ?? 'transparent';
  const rankSolid    = RANK_SOLID[rank] ?? rankColor;

  // ── Form field style shorthand
  const ff = 'w-full rounded-xl px-3 py-2 text-sm focus:outline-none';

  return (
    <div className="max-w-2xl space-y-6 anim-page pb-10" style={{ background: '#030508' }}>

      {/* Page-level animated scan line */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        {/* Hex-dot grid overlay */}
        <div className="absolute inset-0"
          style={{
            opacity: 0.03,
            backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }} />
        {/* Scan line */}
        <div className="absolute left-0 right-0 h-[3px] pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 40%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.18) 60%, transparent 100%)',
            animation: 'scan-line 7s linear infinite',
          }} />
      </div>

      {/* ══════════════════════════════════════════════════════ CHARACTER CARD */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{
          minHeight: 420,
          background: `radial-gradient(ellipse at 50% -5%, ${rankGlow} 0%, #090b10 55%, #030508 100%)`,
          boxShadow: `0 0 60px ${rankGlow}, 0 0 120px ${rankGlow}40`,
          border: `1px solid ${rankSolid}30`,
          zIndex: 1,
        }}>

        {/* Warrior silhouette — behind everything */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 0 }}>
          <div style={{ height: '85%', opacity: 0.55, color: rankSolid }}>
            <WarriorSilhouette color={rankSolid} />
          </div>
        </div>

        {/* Card content overlay */}
        <div className="relative flex flex-col items-center gap-4 px-5 py-8" style={{ zIndex: 1 }}>
          {/* Rank badge */}
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
      <div className="rounded-2xl px-5 py-4 relative"
        style={{
          background: '#0d0f14',
          borderLeft: `3px solid rgb(var(--accent-rgb))`,
          border: `1px solid rgba(255,255,255,0.05)`,
          borderLeftWidth: 3,
          borderLeftColor: 'rgb(var(--accent-rgb))',
          zIndex: 1,
        }}>
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
                className="rounded-2xl px-3 py-3 space-y-2 stat-pop group transition-all duration-200"
                title={s.hint}
                style={{
                  background: '#0d0f14',
                  border: `1px solid rgba(255,255,255,0.05)`,
                  borderLeft: `3px solid ${s.color}`,
                  animationDelay: `${idx * 60}ms`,
                }}>
                <div className="flex items-center justify-between">
                  <span className="text-base leading-none">{s.icon}</span>
                  <span className="text-3xl font-black tabular-nums font-mono"
                    style={{ color: s.color, textShadow: `0 0 12px ${s.color}80` }}>{val}</span>
                </div>
                <div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1a1c22' }}>
                    <div className="h-full rounded-full bar-fill"
                      style={{
                        width: `${val}%`,
                        background: s.color,
                        boxShadow: `0 0 8px ${s.color}`,
                      }} />
                  </div>
                  <p className="text-[9px] mt-1 font-semibold tracking-[0.15em] uppercase"
                    style={{ color: 'var(--t-faint)' }}>
                    {s.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--t-faint)' }}>
          ↑ Stats update as you log workouts, sleep, habits, tasks, streaks & finance
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════ SKILLS */}
      <div style={{ zIndex: 1, position: 'relative' }}>
        <div className="flex items-center justify-between mb-3">
          <SectionHeader title="SKILLS & ABILITIES" />
          <button onClick={() => setShowSkillForm(s => !s)}
            className="flex items-center gap-1 text-[11px] font-semibold tap px-2 py-1 rounded-lg"
            style={{ background: 'rgb(var(--accent-rgb)/0.12)', color: 'rgb(var(--accent-rgb-light))' }}>
            <Plus size={11} /> Skill
          </button>
        </div>

        {showSkillForm && (
          <form onSubmit={addSkill} className="rounded-2xl px-4 py-4 mb-3 space-y-2 scale-in"
            style={{ background: '#0d0f14', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="grid grid-cols-2 gap-2">
              <input name="name" required placeholder="Skill name" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
              <input name="icon" placeholder="Icon (emoji)" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            <input name="description" placeholder="Description (optional)" className={ff}
              style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>LEVEL</p>
                <input name="level" type="number" min={1} max={100} defaultValue={1} className={ff}
                  style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>XP (0–100)</p>
                <input name="xp" type="number" min={0} max={100} defaultValue={0} className={ff}
                  style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>CATEGORY</p>
                <input name="category" placeholder="combat" className={ff}
                  style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
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
              className="rounded-2xl px-3 py-3 group transition-all duration-200"
              style={{
                background: '#0d0f14',
                border: `1px solid rgba(255,255,255,0.05)`,
                borderLeft: `3px solid rgb(var(--accent-rgb)/0.6)`,
              }}>
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
                  {/* LVL badge — neon gold */}
                  <span className="text-[10px] font-black px-2 py-1 rounded-md"
                    style={{
                      background: '#39ff1412',
                      color: '#39ff14',
                      border: '1px solid #39ff1440',
                      textShadow: '0 0 8px #39ff1480',
                    }}>
                    LVL {skill.level}
                  </span>
                  <button onClick={() => levelUpSkill(skill.id)}
                    className="w-6 h-6 rounded flex items-center justify-center tap opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
                    style={{ background: '#22c55e18', border: '1px solid #22c55e30' }}
                    title="Level up">
                    <ChevronUp size={11} style={{ color: '#22c55e' }} />
                  </button>
                  <button onClick={() => deleteSkill(skill.id)}
                    className="w-6 h-6 rounded flex items-center justify-center tap opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'var(--s3)' }}>
                    <X size={9} style={{ color: '#ef4444' }} />
                  </button>
                </div>
              </div>
              {/* XP bar with shimmer */}
              <div className="mt-2.5 space-y-1">
                <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: '#1a1c22' }}>
                  <div className="h-full rounded-full bar-fill"
                    style={{
                      width: `${skill.xp}%`,
                      background: `linear-gradient(90deg, rgb(var(--accent-rgb)/0.8), rgb(var(--accent-rgb)))`,
                      boxShadow: `0 0 6px rgb(var(--accent-rgb)/0.6)`,
                    }} />
                  {/* Shimmer overlay */}
                  {skill.xp > 0 && (
                    <div className="xp-shimmer-bar absolute inset-0 rounded-full" style={{ mixBlendMode: 'screen' }} />
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--t-faint)' }}>{skill.category}</span>
                  <span className="text-[9px] font-mono" style={{ color: 'var(--t-faint)' }}>{skill.xp}/100 XP</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════ CLAIMS */}
      <div style={{ zIndex: 1, position: 'relative' }}>
        <div className="flex items-center justify-between mb-3">
          {/* Tabs — styled as quest log header */}
          <div className="flex items-center gap-1">
            {(['active', 'claimed'] as const).map(tab => (
              <button key={tab} onClick={() => setClaimsTab(tab)}
                className="text-[11px] font-bold px-3 py-1 rounded-lg tap capitalize tracking-wider"
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
          <form onSubmit={addClaim} className="rounded-2xl px-4 py-4 mb-3 space-y-2 scale-in"
            style={{ background: '#0d0f14', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="grid grid-cols-2 gap-2">
              <input name="title" required placeholder="Quest title" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
              <input name="icon" placeholder="Icon (emoji)" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            <input name="description" placeholder="Description" className={ff}
              style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>TYPE</p>
                <select name="claim_type" className={ff}
                  style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option value="quest">Quest</option>
                  <option value="achievement">Achievement</option>
                  <option value="legacy">Legacy</option>
                </select>
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>DEADLINE</p>
                <input name="deadline" type="date" className={ff}
                  style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
            </div>
            <input name="reward_text" placeholder="Reward / what you unlock" className={ff}
              style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
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
                className="rounded-2xl px-4 py-3 transition-all duration-200"
                style={{
                  background: '#0d0f14',
                  border: `1px solid rgba(255,255,255,0.05)`,
                  borderLeft: `4px solid ${tc}`,
                  opacity: claim.status === 'claimed' ? 0.7 : 1,
                }}>
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
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold tap claim-pulse-btn"
                        style={{
                          background: `${tc}18`,
                          color: tc,
                          border: `1px solid ${tc}40`,
                          '--cp': tc,
                          animation: 'claim-pulse 2.5s ease-in-out infinite',
                        } as React.CSSProperties}>
                        <Check size={10} /> Claim it
                      </button>
                    )}
                    <button onClick={() => deleteClaim(claim.id)}
                      className="w-6 h-6 flex items-center justify-center rounded tap"
                      style={{ color: 'var(--t-faint)' }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════ MENTOR HALL */}
      <div style={{ zIndex: 1, position: 'relative' }}>
        <div className="flex items-center justify-between mb-3">
          <SectionHeader title="MENTOR HALL" sub="— figures you embody" />
          <button onClick={() => setShowMentorForm(s => !s)}
            className="flex items-center gap-1 text-[11px] font-semibold tap px-2 py-1 rounded-lg"
            style={{ background: 'rgb(var(--accent-rgb)/0.12)', color: 'rgb(var(--accent-rgb-light))' }}>
            <Plus size={11} /> Mentor
          </button>
        </div>

        {showMentorForm && (
          <form onSubmit={addMentor} className="rounded-2xl px-4 py-4 mb-3 space-y-2 scale-in"
            style={{ background: '#0d0f14', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="grid grid-cols-2 gap-2">
              <input name="name" required placeholder="Name (e.g. Marcus Aurelius)" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
              <input name="icon" placeholder="Icon (emoji)" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input name="era" placeholder="Era (Ancient / Modern / Fictional)" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
              <input name="domain" placeholder="Domain (Stoicism / Combat…)" className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            <input name="trait" placeholder="Trait you're embodying from them" className={ff}
              style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
            <div>
              <p className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>EMBODIMENT PROGRESS (0–100)</p>
              <input name="progress" type="number" min={0} max={100} defaultValue={0} className={ff}
                style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            <textarea name="notes" placeholder="Notes / quotes from them…" rows={2}
              className={`${ff} resize-none`}
              style={{ background: 'var(--s3)', color: 'var(--t-head)', border: '1px solid rgba(255,255,255,0.1)' }} />
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
              className="rounded-2xl px-4 py-4 group relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #0d0f14 0%, #111318 100%)',
                border: `1px solid rgba(255,255,255,0.07)`,
                boxShadow: 'inset 0 0 30px rgba(0,0,0,0.3)',
              }}>
              {/* Portrait frame corners */}
              <div className="absolute top-2 left-2 w-4 h-4 pointer-events-none"
                style={{ borderTop: '1px solid rgba(255,255,255,0.15)', borderLeft: '1px solid rgba(255,255,255,0.15)' }} />
              <div className="absolute top-2 right-2 w-4 h-4 pointer-events-none"
                style={{ borderTop: '1px solid rgba(255,255,255,0.15)', borderRight: '1px solid rgba(255,255,255,0.15)' }} />
              <div className="absolute bottom-2 left-2 w-4 h-4 pointer-events-none"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', borderLeft: '1px solid rgba(255,255,255,0.15)' }} />
              <div className="absolute bottom-2 right-2 w-4 h-4 pointer-events-none"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', borderRight: '1px solid rgba(255,255,255,0.15)' }} />

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
                <button onClick={() => deleteMentor(mentor.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity tap"
                  style={{ color: 'var(--t-faint)' }}>
                  <Trash2 size={12} />
                </button>
              </div>

              {mentor.trait && (
                <p className="text-xs mb-2 flex items-center gap-1" style={{ color: 'rgb(var(--accent-rgb-light))' }}>
                  <Star size={10} /> Embodying: <span className="font-semibold">{mentor.trait}</span>
                </p>
              )}

              {/* Embodiment progress — thicker 8px bar */}
              <div className="space-y-1 mb-2">
                <div className="flex justify-between">
                  <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--t-faint)' }}>EMBODIMENT</span>
                  <span className="text-[10px] font-black font-mono"
                    style={{
                      color: 'rgb(var(--accent-rgb-light))',
                      textShadow: mentor.progress > 0 ? '0 0 8px rgb(var(--accent-rgb)/0.6)' : 'none',
                    }}>
                    {mentor.progress}%
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden cursor-pointer relative"
                  style={{ background: '#1a1c22' }}
                  title="Click to update progress"
                  onClick={() => {
                    const v = prompt(`Embodiment progress for ${mentor.name} (0-100):`, String(mentor.progress));
                    if (v !== null && !isNaN(Number(v))) updateMentorProgress(mentor.id, Math.min(100, Math.max(0, Number(v))));
                  }}>
                  <div className="h-full rounded-full bar-fill"
                    style={{
                      width: `${mentor.progress}%`,
                      background: 'rgb(var(--accent-rgb))',
                      boxShadow: '0 0 8px rgb(var(--accent-rgb)/0.7)',
                    }} />
                  {/* Shimmer on the bar */}
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
          ))}
        </div>
      </div>

    </div>
  );
}
