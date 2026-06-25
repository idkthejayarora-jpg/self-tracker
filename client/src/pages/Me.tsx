import { useEffect, useState, useCallback } from 'react';
import { Plus, X, ChevronUp, Trash2, Pencil, Check, Sparkles, Trophy, Star, Dumbbell, Heart, Target, Eye, Activity, Wallet, Video, History, BookOpen, Salad, Moon, Award, Flame } from 'lucide-react';
import api from '../lib/api';
import type { MeSummary, MeProfile, MeSkill, MeClaim, MeMentor, PointsLogEntry } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { getRankFinish, RankLadder } from '../components/RankCard';

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


const RANK_SOLID: Record<string, string> = {
  E:    '#84816f',
  D:    '#a97e5f',
  C:    '#cf8a3e',
  B:    '#d4a27f',
  A:    '#d97757',
  S:    '#cd5240',
  'S+': '#d9a066',
  '∞':  '#e8a87c',
};

// Class tier display config
const CLASS_CONFIG: Record<string, { label: string; sublabel: string; color: string; bgColor: string }> = {
  Soldier: { label: 'SOLDIER CLASS',  sublabel: '4 ranks · Ground tier',            color: '#a5a293', bgColor: 'rgba(165,162,147,0.08)' },
  General: { label: 'GENERAL CLASS',  sublabel: '2 ranks · Command tier',           color: '#e59a7f', bgColor: 'rgba(229,154,127,0.10)'  },
  King:    { label: 'KING CLASS',     sublabel: '2 ranks · Apex tier',              color: '#e0b27c', bgColor: 'rgba(224,178,124,0.10)'  },
};

// ── Stat config (7 stats — Creativity added) ─────────────────────────────────
const STAT_CONFIG = [
  { key: 'strength',   label: 'STRENGTH',   Icon: Dumbbell,  color: '#cd5240', hint: 'Workouts this month'   },
  { key: 'vitality',   label: 'VITALITY',   Icon: Heart,     color: '#cf8a3e', hint: 'Sleep quality (7 days)' },
  { key: 'discipline', label: 'DISCIPLINE', Icon: Target,    color: '#d97757', hint: 'Habit rate this week'   },
  { key: 'focus',      label: 'FOCUS',      Icon: Eye,       color: '#d97757', hint: 'Tasks done this month'  },
  { key: 'endurance',  label: 'ENDURANCE',  Icon: Activity,  color: '#e59a7f', hint: 'Longest streak ever'    },
  { key: 'wealth',     label: 'WEALTH',     Icon: Wallet,    color: '#d9a066', hint: 'Finance net (half weight)' },
  { key: 'creativity', label: 'CREATIVITY', Icon: Video,     color: '#c2553d', hint: 'Posts this month'       },
];

// ── Point-source → Lucide icon map (for Points History) ──────────────────────
const SOURCE_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  task:       Check,
  habit:      Target,
  sleep:      Moon,
  journal:    BookOpen,
  workout:    Dumbbell,
  diet:       Salad,
  body:       Heart,
  content:    Video,
  milestone:  Trophy,
  area_done:  Award,
  claim:      Star,
};
const SOURCE_COLORS: Record<string, string> = {
  task: '#cf8a3e', habit: '#d97757', sleep: '#e59a7f', journal: '#e59a7f',
  workout: '#cd5240', diet: '#cf8a3e', body: '#d9a066',
  content: '#c2553d', milestone: '#d9a066', area_done: '#d9a066', claim: '#e59a7f',
};

// Relative-time formatter (short, no library)
function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (!t) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d < 30)    return `${d}d ago`;
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const CLAIM_TYPE_COLOR: Record<string, string> = {
  quest: '#d97757',
  achievement: '#d97757',
  legacy: '#e59a7f',
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

// 5-pointed star polygon points (tip pointing up)
function starPoints(cx: number, cy: number, R: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = ((-90 + i * 36) * Math.PI) / 180;
    const rad = i % 2 === 0 ? R : r;
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)}`);
  }
  return pts.join(' ');
}

// ── Rank insignia — shapes that symbolise real military / royal ranks ──────────
// Soldier (E–B) → chevrons, General (A·S) → stars, King (S+·∞) → crowns.
// Uses direct color fills + stroke outline — no SVG gradient refs (Safari-safe).
function RankInsignia({ rank, color }: { rank: string; color: string }) {
  const SOLDIER = ['E', 'D', 'C', 'B'];
  const GENERAL = ['A', 'S'];
  const fill = color;
  const stroke = 'rgba(255,255,255,0.45)';

  // ── Soldier: stacked chevrons ──────────────────────────────────────────────
  if (SOLDIER.includes(rank)) {
    const idx      = SOLDIER.indexOf(rank);       // E=0 D=1 C=2 B=3
    const chevrons = Math.min(idx + 1, 3);        // 1, 2, 3, 3
    const gap      = 38;
    const topY     = 110 - ((chevrons - 1) * gap) / 2;
    const botY     = topY + (chevrons - 1) * gap;
    return (
      <svg viewBox="0 0 200 200" style={{ width: '100%', height: 'auto' }} aria-hidden="true">
        <g fill="none" stroke={fill} strokeWidth="22" strokeLinejoin="round" strokeLinecap="round">
          {Array.from({ length: chevrons }).map((_, i) => {
            const y = topY + i * gap;
            return <path key={i} d={`M44,${y} L100,${y - 44} L156,${y}`} />;
          })}
          {rank === 'B' && (
            <path d={`M42,${botY + 22} Q100,${botY + 52} 158,${botY + 22}`} strokeWidth="15" />
          )}
        </g>
        <g fill="none" stroke={stroke} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
          {Array.from({ length: chevrons }).map((_, i) => {
            const y = topY + i * gap;
            return <path key={i} d={`M44,${y} L100,${y - 44} L156,${y}`} />;
          })}
          {rank === 'B' && (
            <path d={`M42,${botY + 22} Q100,${botY + 52} 158,${botY + 22}`} strokeWidth="3" />
          )}
        </g>
      </svg>
    );
  }

  // ── General: stars ─────────────────────────────────────────────────────────
  if (GENERAL.includes(rank)) {
    return (
      <svg viewBox="0 0 200 200" style={{ width: '100%', height: 'auto' }} aria-hidden="true">
        {rank === 'A' ? (
          <>
            <polygon points={starPoints(100, 100, 78, 33)} fill={fill} />
            <polygon points={starPoints(100, 100, 78, 33)} fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <polygon points={starPoints(100, 68, 52, 22)} fill={fill} />
            <polygon points={starPoints(46, 136, 38, 16)} fill={fill} />
            <polygon points={starPoints(154, 136, 38, 16)} fill={fill} />
            <polygon points={starPoints(100, 68, 52, 22)} fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" />
            <polygon points={starPoints(46, 136, 38, 16)} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
            <polygon points={starPoints(154, 136, 38, 16)} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
          </>
        )}
      </svg>
    );
  }

  // ── King: crown ────────────────────────────────────────────────────────────
  const isApex   = rank === '∞';
  const tipY     = isApex ? 58 : 72;
  return (
    <svg viewBox="0 0 200 200" style={{ width: '100%', height: 'auto' }} aria-hidden="true">
      {isApex && (
        <>
          <circle cx="100" cy="120" r="90" fill="none" stroke={fill} strokeWidth="3" opacity="0.6" />
          {([[100, 18], [18, 82], [182, 82]] as [number,number][]).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5" fill={stroke} opacity="0.9" />
          ))}
        </>
      )}
      {/* Crown spikes */}
      <polygon points={`40,158 54,96 76,128 100,${tipY} 124,128 146,96 160,158`} fill={fill} />
      {/* Crown band */}
      <rect x="38" y="158" width="124" height="20" rx="4" fill={fill} />
      {/* Highlight stroke */}
      <polygon points={`40,158 54,96 76,128 100,${tipY} 124,128 146,96 160,158`} fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" />
      <rect x="38" y="158" width="124" height="20" rx="4" fill="none" stroke={stroke} strokeWidth="2.5" />
      {/* Jewels */}
      {([[54, 96], [100, tipY], [146, 96]] as [number,number][]).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 1 ? 9 : 7} fill="rgba(255,255,255,0.85)" />
      ))}
      <circle cx="100" cy="168" r="6" fill="rgba(255,255,255,0.85)" />
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
        <Pencil size={10} className="absolute -right-4 top-0.5 opacity-20 group-hover:opacity-40 transition-opacity" style={{ color: 'var(--t-faint)' }} />
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

  // Points history
  const [pointsLog, setPointsLog] = useState<PointsLogEntry[]>([]);

  // Claim cooldown error toast
  const [claimError, setClaimError] = useState<string | null>(null);

  // Rank card color — syncs with sidebar via localStorage
  const [customRankColor, setCustomRankColor] = useState<string | null>(() => {
    const saved = localStorage.getItem('rank_card_color');
    if (saved && !/^#(d977|c255|e08b|d9a0|d4a2|cf8a|b576|b337|e8a8|a97e|a5a2|f5f3)/i.test(saved)) {
      localStorage.removeItem('rank_card_color');
      return null;
    }
    return saved;
  });
  const [showRankPalette, setShowRankPalette] = useState(false);

  const RANK_PALETTE_ME = [
    '#d97757','#c2553d','#e08b4e','#d9a066','#d4a27f',
    '#cf8a3e','#b5764f','#b3372e','#e8a87c','#a97e5f',
    '#a5a293','#f5f3ec',
  ];

  function applyRankColorMe(hex: string) {
    setCustomRankColor(hex);
    localStorage.setItem('rank_card_color', hex);
    document.documentElement.style.setProperty('--rank-rgb',
      hex.replace('#','').match(/.{2}/g)!.map(x=>parseInt(x,16)).join(' ')
    );
    setShowRankPalette(false);
  }
  function resetRankColorMe() {
    setCustomRankColor(null);
    localStorage.removeItem('rank_card_color');
    setShowRankPalette(false);
  }

  const load = useCallback(async () => {
    const [summary, log] = await Promise.all([
      api.get<MeSummary>('/me/summary'),
      api.get<PointsLogEntry[]>('/points/log?limit=20').catch(() => ({ data: [] as PointsLogEntry[] })),
    ]);
    setData(summary.data);
    setPointsLog(log.data);
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
    try {
      const res = await api.patch<MeClaim>(`/me/claims/${id}`, { status: 'claimed' });
      setData(d => d ? { ...d, claims: d.claims.map(c => c.id === id ? res.data : c) } : d);
      // Refresh points log + summary so merit reflects the new claim
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Could not claim — try again';
      setClaimError(msg);
      setTimeout(() => setClaimError(null), 4500);
    }
  }

  // Helper: how many days until a claim is available (anti-exploit indicator)
  function claimCooldownDays(claim: MeClaim): number {
    if (claim.status !== 'active') return 0;
    const created = Date.parse(claim.created_at as any);
    if (!created) return 0;
    const ageDays = Math.floor((Date.now() - created) / 86400000);
    const deadlinePassed = claim.deadline && claim.deadline <= new Date().toISOString().slice(0, 10);
    if (deadlinePassed) return 0;
    return Math.max(0, 3 - ageDays);
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

  const { profile, rank, rankClass, rankColor, rankLabel, rankDesc, rankTier, rankPerks, meritScore, meritBreakdown, nextRank, ranks, totalPoints, stats, skills, claims, mentors } = data;
  const activeClaims = claims.filter(c => c.status === 'active');
  const claimedList  = claims.filter(c => c.status === 'claimed');
  const autoSolid    = RANK_SOLID[rank] ?? rankColor;
  // Custom color from palette picker (shared with sidebar via localStorage)
  const rankSolid    = customRankColor ?? autoSolid;
  // Premium card finish for this rank — escalates E → ∞
  const finish       = getRankFinish(rankTier, rankSolid);

  // Infer class from rank if API hasn't sent rankClass yet (backwards compat)
  const RANK_TO_CLASS: Record<string, string> = {
    E: 'Soldier', D: 'Soldier', C: 'Soldier', B: 'Soldier',
    A: 'General', S: 'General',
    'S+': 'King', '∞': 'King',
  };
  const effectiveClass = rankClass || RANK_TO_CLASS[rank] || 'Soldier';
  const classCfg = CLASS_CONFIG[effectiveClass];

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
              : 'none',
            animation: 'scan-line 7s linear infinite',
          }} />
      </div>

      {/* ══════════════════════════════════════════════════════ CHARACTER CARD */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{
          minHeight: 360,
          background: isLight ? '#ebe7da' : '#1f1c19',
          boxShadow: finish.shadow,   // glow escalates with rank
          border: finish.border,      // foil/metal edge per rank
          backdropFilter: 'blur(0px)',
          zIndex: 1,
        }}>

        {/* Subtle top-edge glow — replaces the heavy foil overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1, borderRadius: 'inherit',
          background: `radial-gradient(ellipse 80% 40% at 50% 0%, ${rankSolid}18 0%, transparent 70%)` }} />

        {/* Rank insignia — chevrons / stars / crown, centred behind content */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 0 }}>
          <div style={{
            opacity: isLight ? 0.28 : 0.68,
            width: 'min(260px, 68%)',
            flexShrink: 0,
            filter: isLight ? 'none' : `drop-shadow(0 0 18px ${rankSolid}70)`,
          }}>
            <RankInsignia rank={rank} color={rankSolid} />
          </div>
        </div>

        {/* Card content overlay */}
        <div className="relative flex flex-col items-center gap-3 px-4 py-6 sm:gap-4 sm:px-5 sm:py-8" style={{ zIndex: 3 }}>

          {/* Class tier banner — uses rankSolid so custom color applies everywhere */}
          {classCfg && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full scale-in"
              style={{
                background: `${rankSolid}14`,
                border: `1px solid ${rankSolid}35`,
                backdropFilter: 'blur(12px)',
              }}>
              <div className="flex flex-col items-center gap-0 leading-none">
                <span className="text-[9px] font-black tracking-[0.28em]"
                  style={{ color: rankSolid }}>
                  {classCfg.label}
                </span>
                <span className="text-[8px] font-medium tracking-wider"
                  style={{ color: rankSolid, opacity: 0.55 }}>
                  {classCfg.sublabel}
                </span>
              </div>
            </div>
          )}

          {/* Rank badge + label */}
          <div className="flex flex-col items-center gap-1.5 relative">
            <div className="flex items-center gap-3">
              {/* Rank badge — tap to open color picker */}
              <button
                onClick={() => setShowRankPalette(v => !v)}
                title="Tap to change rank color"
                className="rank-glow-anim tap text-[12px] font-black px-4 py-1.5 rounded-full tracking-[0.2em] uppercase relative"
                style={{
                  background: `${rankSolid}18`,
                  color: rankSolid,
                  border: `1px solid ${rankSolid}60`,
                  '--rg': rankSolid,
                } as React.CSSProperties}>
                <span className="ring-ping ring-ping-2" style={{ color: rankSolid }} />
                {rank} RANK
              </button>
              <span className="font-mono text-[11px] font-bold tabular-nums"
                style={{ color: rankSolid, textShadow: 'none' }}>
                {totalPoints.toLocaleString()} PTS
              </span>
            </div>

            {/* Inline color palette */}
            {showRankPalette && (
              <div className="scale-in rounded-2xl p-3 mt-1"
                style={{
                  background: 'rgba(27,26,24,0.92)',
                  backdropFilter: 'blur(28px)',
                  WebkitBackdropFilter: 'blur(28px)',
                  border: `1px solid ${rankSolid}30`,
                  boxShadow: `0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px ${rankSolid}12`,
                  minWidth: 200,
                }}>
                <p className="text-[9px] font-black tracking-[0.2em] mb-2.5 text-center"
                  style={{ color: 'var(--t-faint)' }}>RANK COLOR</p>
                <div className="grid grid-cols-6 gap-2 justify-items-center mb-2.5">
                  {RANK_PALETTE_ME.map(c => (
                    <button key={c} type="button" onClick={() => applyRankColorMe(c)}
                      className="tap w-7 h-7 rounded-full"
                      style={{
                        background: c,
                        transform: rankSolid === c ? 'scale(1.3)' : undefined,
                        outline: rankSolid === c ? `2px solid ${c}` : '2px solid transparent',
                        outlineOffset: 2,
                        boxShadow: rankSolid === c ? `0 0 0 2px var(--s1), 0 0 0 3.5px ${c}` : undefined,
                      }} />
                  ))}
                </div>
                {customRankColor && (
                  <button onClick={resetRankColorMe}
                    className="w-full text-[10px] py-1.5 rounded-xl tap text-center"
                    style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--t-faint)' }}>
                    Reset to rank default
                  </button>
                )}
              </div>
            )}

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
              <span className="font-black font-mono text-sm tabular-nums" style={{ color: rankSolid, textShadow: 'none' }}>
                {animatedMerit}<span className="text-[10px] font-normal opacity-50">/100</span>
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--s3)' }}>
              <div className="h-full rounded-full transition-all duration-700 bar-fill"
                style={{ width: `${meritScore}%`, background: rankSolid, boxShadow: 'none' }} />
            </div>
            {/* Breakdown — 5 pillars: Consistency/Discipline/Vitality/Mastery/Momentum */}
            <div className="grid grid-cols-5 gap-1.5 pt-1">
              {([
                { label: 'CONSIST', val: meritBreakdown.consistency, max: 25, color: '#d97757' },
                { label: 'DISCIP',  val: meritBreakdown.discipline,  max: 25, color: '#cf8a3e' },
                { label: 'VITAL',   val: meritBreakdown.vitality,    max: 20, color: '#c2553d' },
                { label: 'MASTERY', val: meritBreakdown.mastery,     max: 15, color: '#d4a27f' },
                { label: 'MOMENT',  val: meritBreakdown.momentum,    max: 15, color: '#d9a066' },
              ]).map(b => (
                <div key={b.label} className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] tracking-wider font-semibold" style={{ color: 'var(--t-muted)' }}>{b.label}</span>
                  <span className="text-xs font-black font-mono" style={{ color: b.color }}>
                    {b.val}<span className="text-[9px] opacity-40">/{b.max}</span>
                  </span>
                  <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--s3)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (b.val / b.max) * 100)}%`, background: b.color }} />
                  </div>
                </div>
              ))}
            </div>

            {/* This rank's perks / premium benefits */}
            {rankPerks && rankPerks.length > 0 && (
              <div className="pt-1.5" style={{ borderTop: '1px solid var(--b)' }}>
                <p className="text-[9px] font-bold tracking-[0.16em] uppercase mb-1.5" style={{ color: 'var(--t-faint)' }}>
                  {finish.name} card · your perks
                </p>
                <div className="flex flex-wrap gap-1 justify-center">
                  {rankPerks.map((p, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-md"
                      style={{ background: `${rankSolid}16`, color: rankSolid, border: `1px solid ${rankSolid}2e` }}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Next rank progress + what it unlocks */}
            {nextRank && (
              <p className="text-[10px] text-center pt-0.5" style={{ color: 'var(--t-faint)' }}>
                Next:&nbsp;
                <span style={{ color: nextRank.color, fontWeight: 700 }}>{nextRank.rank} RANK</span>
                {nextRank.rankClass && nextRank.rankClass !== rankClass && (
                  <span className="font-black ml-1"
                    style={{ color: CLASS_CONFIG[nextRank.rankClass]?.color ?? nextRank.color }}>
                    · {nextRank.rankClass.toUpperCase()} CLASS ↑
                  </span>
                )}
                <span className="opacity-60"> — {nextRank.min - meritScore} merit to go</span>
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
                boxShadow: 'none',
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

      {/* ══════════════════════════════════════════════════════ RANK LADDER */}
      {ranks && ranks.length > 0 && (
        <div className="relative" style={{ zIndex: 1 }}>
          <div className="flex items-center gap-2 mb-2.5 px-1">
            <Trophy size={13} style={{ color: rankSolid }} />
            <p className="text-[10px] font-bold tracking-[0.15em]" style={{ color: 'var(--t-faint)' }}>
              RANK LADDER — CLIMB FOR BETTER CARDS &amp; PERKS
            </p>
          </div>
          <RankLadder ranks={ranks} currentRank={rank} merit={meritScore} />
        </div>
      )}

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
                    style={{ color: s.color, textShadow: 'none' }}>{val}</span>
                </div>
                <div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--s3)' }}>
                    <div className="h-full rounded-full bar-fill"
                      style={{
                        width: `${val}%`,
                        background: s.color,
                        boxShadow: 'none',
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
          ↑ Stats update as you log workouts, sleep, habits, tasks, streaks, finance & content posts
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
              style={{ borderLeft: `3px solid rgb(var(--accent-rgb)/0.6)`, '--gc': 'rgba(217,119,87,0.45)' } as React.CSSProperties}>

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
                        style={{ background: '#d9775712', color: '#d97757', border: '1px solid #d9775740', textShadow: 'none' }}>
                        LVL {skill.level}
                      </span>
                      <button onClick={() => levelUpSkill(skill.id)}
                        className="w-8 h-8 rounded flex items-center justify-center tap opacity-25 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
                        style={{ background: '#cf8a3e18', border: '1px solid #cf8a3e30' }} title="Level up">
                        <ChevronUp size={13} style={{ color: '#cf8a3e' }} />
                      </button>
                      <button onClick={() => { setEditingSkillId(skill.id); setShowSkillForm(false); }}
                        className="w-8 h-8 rounded flex items-center justify-center tap opacity-25 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'var(--s3)' }} title="Edit skill">
                        <Pencil size={11} style={{ color: 'rgb(var(--accent-rgb-light))' }} />
                      </button>
                      <button onClick={() => deleteSkill(skill.id)}
                        className="w-8 h-8 rounded flex items-center justify-center tap opacity-25 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'var(--s3)' }}>
                        <X size={11} style={{ color: '#cd5240' }} />
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
                          boxShadow: 'none',
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
            const tc = CLAIM_TYPE_COLOR[claim.claim_type] ?? '#d97757';
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
                                background: '#d9a06618',
                                color: '#d9a066',
                                border: '1px solid #d9a06650',
                                textShadow: 'none',
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
                            <span className="text-[10px]" style={{ color: isOverdue ? '#cd5240' : 'var(--t-faint)' }}>
                              {isOverdue ? '⚠ ' : ''}⏳ {claim.deadline}
                            </span>
                          )}
                          {claim.reward_text && (
                            <span className="text-[10px] flex items-center gap-1" style={{ color: '#d9a066' }}>
                              <Trophy size={9} /> {claim.reward_text}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {claim.status === 'active' && (() => {
                          const cd = claimCooldownDays(claim);
                          if (cd > 0) {
                            return (
                              <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold cursor-not-allowed select-none"
                                style={{
                                  background: 'var(--s3)',
                                  color: 'var(--t-faint)',
                                  border: '1px dashed var(--b)',
                                }}
                                title={`Cooldown: this claim must age ${cd} more day(s) before claimable. Or set a deadline that's already passed.`}>
                                LOCKED · {cd}d
                              </span>
                            );
                          }
                          return (
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
                          );
                        })()}
                        <button
                          onClick={() => { setEditingClaimId(claim.id); setShowClaimForm(false); }}
                          className="w-8 h-8 flex items-center justify-center rounded tap opacity-25 group-hover:opacity-100 transition-opacity"
                          style={{ background: 'var(--s3)' }} title="Edit claim">
                          <Pencil size={11} style={{ color: tc }} />
                        </button>
                        <button onClick={() => deleteClaim(claim.id)}
                          className="w-8 h-8 flex items-center justify-center rounded tap opacity-25 group-hover:opacity-100 transition-opacity"
                          style={{ color: 'var(--t-faint)' }}>
                          <Trash2 size={13} />
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
              style={{ '--gc': 'rgba(229,154,127,0.4)' } as React.CSSProperties}>

              {/* ── Edit form ── */}
              {editingMentorId === mentor.id ? (
                <form onSubmit={e => saveMentorEdit(e, mentor.id)} className="px-4 py-4 space-y-2 scale-in">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black tracking-widest" style={{ color: '#e59a7f' }}>EDITING MENTOR</span>
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
                          {mentor.era && <Chip label={mentor.era} color="#d97757" />}
                          {mentor.domain && <Chip label={mentor.domain} color="#e59a7f" />}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingMentorId(mentor.id); setShowMentorForm(false); }}
                        className="w-8 h-8 flex items-center justify-center rounded tap opacity-25 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'var(--s3)' }} title="Edit mentor">
                        <Pencil size={11} style={{ color: '#e59a7f' }} />
                      </button>
                      <button onClick={() => deleteMentor(mentor.id)}
                        className="w-8 h-8 flex items-center justify-center rounded tap opacity-25 group-hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--t-faint)' }}>
                        <Trash2 size={13} />
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
                          boxShadow: 'none',
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

      {/* ══════════════════════════════════════════════════════ POINTS HISTORY */}
      <div style={{ zIndex: 1, position: 'relative' }}>
        <div className="glass flex items-center justify-between mb-3 rounded-xl px-3 py-2">
          <SectionHeader title="POINTS LEDGER" sub="— recent merit transactions" />
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-1 rounded-lg"
            style={{ background: 'rgb(245 158 11 / 0.1)', color: '#d9a066', border: '1px solid rgb(245 158 11 / 0.3)' }}>
            <History size={10} /> {pointsLog.length}
          </span>
        </div>

        {pointsLog.length === 0 ? (
          <p className="text-sm py-4 text-center font-mono" style={{ color: 'var(--t-faint)' }}>
            // no points logged yet
          </p>
        ) : (
          <div className="card scale-in" style={{ padding: 0 }}>
            {/* HUD corner brackets */}
            <div className="relative">
              <div className="absolute top-1 left-1 w-3 h-3 pointer-events-none"
                style={{ borderTop: '1.5px solid #d9a066', borderLeft: '1.5px solid #d9a066', opacity: 0.4 }} />
              <div className="absolute top-1 right-1 w-3 h-3 pointer-events-none"
                style={{ borderTop: '1.5px solid #d9a066', borderRight: '1.5px solid #d9a066', opacity: 0.4 }} />
              <div className="absolute bottom-1 left-1 w-3 h-3 pointer-events-none"
                style={{ borderBottom: '1.5px solid #d9a066', borderLeft: '1.5px solid #d9a066', opacity: 0.4 }} />
              <div className="absolute bottom-1 right-1 w-3 h-3 pointer-events-none"
                style={{ borderBottom: '1.5px solid #d9a066', borderRight: '1.5px solid #d9a066', opacity: 0.4 }} />

              <div className="max-h-80 overflow-y-auto px-3 py-2 hide-scroll" style={{ scrollBehavior: 'smooth' }}>
                {pointsLog.map((p, i) => {
                  const Icon = SOURCE_ICONS[p.source] || Flame;
                  const color = SOURCE_COLORS[p.source] || '#a5a293';
                  return (
                    <div key={p.id}
                      className="flex items-center gap-3 py-2 fade-in"
                      style={{
                        borderBottom: i < pointsLog.length - 1 ? '1px solid var(--b)' : 'none',
                        animationDelay: `${Math.min(i, 8) * 30}ms`,
                      }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                        <Icon size={13} color={color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold capitalize truncate" style={{ color: 'var(--t-body)' }}>
                          {p.action.replace(/_/g, ' ')}
                          {p.note && (
                            <span className="font-normal opacity-60"> — {p.note.slice(0, 40)}</span>
                          )}
                        </p>
                        <p className="text-[10px] font-mono" style={{ color: 'var(--t-faint)' }}>
                          <span className="uppercase tracking-wider">{p.source}</span> · {relTime(p.created_at)}
                        </p>
                      </div>
                      <span className="text-sm font-black font-mono tabular-nums shrink-0"
                        style={{ color, textShadow: 'none' }}>
                        +{p.points}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Claim cooldown toast (slides up from bottom right) */}
      {claimError && (
        <div className="fixed bottom-6 right-6 z-50 slide-up max-w-xs">
          <div className="rounded-xl px-4 py-3 flex items-start gap-2"
            style={{
              background: 'rgba(205,82,64,0.12)',
              border: '1px solid rgba(205,82,64,0.4)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 8px 32px rgba(205,82,64,0.25)',
            }}>
            <X size={14} style={{ color: '#e07b62', marginTop: 2 }} />
            <p className="text-xs font-semibold" style={{ color: '#e8a18f' }}>{claimError}</p>
          </div>
        </div>
      )}

    </div>
  );
}
