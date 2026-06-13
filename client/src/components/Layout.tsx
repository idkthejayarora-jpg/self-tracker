import { NavLink, Outlet } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, CheckSquare, BookOpen, Bell, BarChart2,
  Dumbbell, Sparkles, LogOut, Sun, Moon, Palette, X, Salad, KeyRound,
  ShieldOff, Target, Activity, Wallet, Swords, Zap, Shield, ImagePlus, Video,
  AudioLines,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, ACCENT_PRESETS } from '../contexts/ThemeContext';
import api from '../lib/api';

const NAV = [
  { to: '/',          icon: AudioLines,      label: 'Daily log',  color: '#e59a7f' },
  { to: '/me',        icon: Swords,          label: 'Character',  color: '#d9a066' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Command',    color: '#d97757' },
  { to: '/tasks',     icon: CheckSquare,     label: 'Missions',   color: '#c2553d' },
  { to: '/habits',    icon: Target,          label: 'Habits',     color: '#d97757' },
  { to: '/workout',   icon: Dumbbell,        label: 'Training',   color: '#b3372e' },
  { to: '/sleep',     icon: Moon,            label: 'Sleep',      color: '#e59a7f' },
  { to: '/journal',   icon: BookOpen,        label: 'Journal',    color: '#d4a27f' },
  { to: '/finance',   icon: Wallet,          label: 'Finance',    color: '#d9a066' },
  { to: '/diet',      icon: Salad,           label: 'Nutrition',  color: '#b5764f' },
  { to: '/body',      icon: Activity,        label: 'Body',       color: '#d9a066' },
  { to: '/life',      icon: Sparkles,        label: 'Life Path',  color: '#c2553d' },
  { to: '/analytics', icon: BarChart2,       label: 'Intel',      color: '#d9a066' },
  { to: '/reminders', icon: Bell,            label: 'Alerts',     color: '#d97757' },
  { to: '/detox',     icon: ShieldOff,       label: 'Detox',      color: '#b5764f' },
  { to: '/content',   icon: Video,           label: 'Creator',    color: '#d4a27f' },
];

const RANK_COLORS: Record<string, string> = {
  E: '#a59785', D: '#b98a64', C: '#cf8a3e', B: '#d4a27f',
  A: '#d97757', S: '#c2553d', 'S+': '#e08b4e', '∞': '#e8a87c',
};

// Class tier config — drives the faint class pill shown above the rank badge
const CLASS_META: Record<string, { label: string; color: string }> = {
  Soldier: { label: 'SOLDIER',  color: '#a5a293' },
  General: { label: 'GENERAL',  color: '#d97757' },
  King:    { label: 'KING',     color: '#d9a066' },
};

// Palette for custom rank card / gradient color
const RANK_PALETTE = [
  '#d97757', // terracotta
  '#c2553d', // burnt rust
  '#e08b4e', // flame amber
  '#d9a066', // kraft gold
  '#d4a27f', // kraft
  '#cf8a3e', // ochre
  '#b5764f', // sienna
  '#b3372e', // brick
  '#e8a87c', // peach
  '#a97e5f', // clay
  '#a5a293', // stone
  '#f5f3ec', // ivory
];

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

interface MeSnap {
  rank: string;
  rankClass: string;
  rankColor: string;
  rankLabel: string;
  meritScore: number;
  profile: { avatar_emoji: string; character_name: string };
}

/* ── Change Password Modal ── */
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError("Passwords don't match"); return; }
    if (next.length < 4) { setError('Must be at least 4 characters'); return; }
    setLoading(true);
    try {
      await api.post('/auth/change-password', { current_password: current, new_password: next });
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="scale-in p-5 w-full max-w-sm space-y-4 rounded-2xl"
        style={{
          background: 'var(--s2)',
          border: '1px solid var(--bh)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
        }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--s3)', border: '1px solid var(--b)' }}>
              <KeyRound size={13} style={{ color: 'var(--t-faint)' }} />
            </div>
            <h3 className="font-bold text-head text-sm">Change password</h3>
          </div>
          <button onClick={onClose} className="tap w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--t-faint)', background: 'var(--s2)', border: '1px solid var(--b)' }}>
            <X size={13} />
          </button>
        </div>
        {success ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-3"
              style={{ background: '#cf8a3e18', border: '1px solid #cf8a3e30' }}>
              <Shield size={20} style={{ color: '#cf8a3e' }} />
            </div>
            <p className="text-sm font-bold" style={{ color: '#cf8a3e' }}>Password updated!</p>
            <button onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white tap"
              style={{ background: 'rgb(var(--accent-rgb))' }}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-2">
            {[
              { ph: 'Current password', val: current, set: setCurrent },
              { ph: 'New password',     val: next,    set: setNext    },
              { ph: 'Confirm new',      val: confirm, set: setConfirm },
            ].map(({ ph, val, set }) => (
              <input key={ph} type="password" placeholder={ph} value={val}
                onChange={e => set(e.target.value)} required
                className="w-full rounded-xl px-3 py-2.5 text-sm" />
            ))}
            {error && <p className="text-xs" style={{ color: '#e07b62' }}>{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-40 text-white tap"
              style={{ background: 'rgb(var(--accent-rgb))' }}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ── Sidebar Clock ── */
function SidebarClock() {
  const [now, setNow] = useState(new Date());
  const [prevSec, setPrevSec] = useState(-1);
  useEffect(() => {
    const id = setInterval(() => {
      setNow(n => { const d = new Date(); setPrevSec(n.getSeconds()); return d; });
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const raw  = now.getHours();
  const hh   = ((raw % 12) || 12).toString().padStart(2, '0');
  const mm   = now.getMinutes().toString().padStart(2, '0');
  const ss   = now.getSeconds().toString().padStart(2, '0');
  const ampm = raw < 12 ? 'AM' : 'PM';
  const day  = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  const secTick = now.getSeconds() !== prevSec;
  const minPct  = Math.round((now.getSeconds() / 60) * 100);

  return (
    <div className="px-3 py-3 mb-2" style={{ borderBottom: '1px solid var(--b)' }}>
      <div className="flex items-baseline gap-0.5 mb-0.5">
        <span className="tabular-nums font-black" style={{ fontSize: 26, color: 'rgb(var(--accent-rgb-light))', letterSpacing: '-0.03em' }}>{hh}</span>
        <span className="clock-colon font-black" style={{ fontSize: 26, color: 'rgb(var(--accent-rgb) / 0.4)', letterSpacing: '-0.03em' }}>:</span>
        <span className="tabular-nums font-black" style={{ fontSize: 26, color: 'rgb(var(--accent-rgb-light))', letterSpacing: '-0.03em' }}>{mm}</span>
        <span key={ss} className={`tabular-nums font-semibold ml-1 ${secTick ? 'clock-seconds-tick' : ''}`}
          style={{ fontSize: 11, color: 'var(--t-faint)', marginBottom: 2 }}>:{ss}</span>
        <span className="font-black ml-1" style={{ fontSize: 11, color: 'rgb(var(--accent-rgb) / 0.6)', marginBottom: 2 }}>{ampm}</span>
      </div>
      <p className="text-[9px] font-black tracking-[0.14em]" style={{ color: 'var(--t-faint)' }}>{day} · {date}</p>
      <div className="mt-2 h-[2px] rounded-full overflow-hidden" style={{ background: 'var(--s3)' }}>
        <div className="h-full rounded-full bar-fill"
          style={{ width: `${minPct}%`, background: 'rgb(var(--accent-rgb) / 0.7)', boxShadow: 'none' }} />
      </div>
    </div>
  );
}

/* ── Mobile mini clock ── */
function MobileSidebarClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const raw  = now.getHours();
  const hh   = ((raw % 12) || 12).toString().padStart(2, '0');
  const mm   = now.getMinutes().toString().padStart(2, '0');
  const ampm = raw < 12 ? 'AM' : 'PM';
  return (
    <div className="flex flex-col items-center py-1.5 w-full" style={{ borderBottom: '1px solid var(--b)' }}>
      <span className="tabular-nums font-black text-[10px]" style={{ color: 'rgb(var(--accent-rgb-light))' }}>{hh}</span>
      <span className="clock-colon font-black text-[10px]" style={{ color: 'rgb(var(--accent-rgb) / 0.35)' }}>:</span>
      <span className="tabular-nums font-black text-[10px]" style={{ color: 'rgb(var(--accent-rgb-light))' }}>{mm}</span>
      <span className="font-black text-[8px]" style={{ color: 'rgb(var(--accent-rgb) / 0.5)' }}>{ampm}</span>
    </div>
  );
}

/* ── Main Layout ── */
export default function Layout() {
  const { user, logout } = useAuth();
  const { toggleMode, isLight, accent, setAccent } = useTheme();
  const [showTheme, setShowTheme] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [me, setMe] = useState<MeSnap | null>(null);

  // Logo customisation — stored in localStorage as base64 dataURL
  const [customLogo, setCustomLogo] = useState<string | null>(() => localStorage.getItem('custom_logo'));
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Custom rank card / gradient color
  const [customRankColor, setCustomRankColor] = useState<string | null>(() => {
    const saved = localStorage.getItem('rank_card_color');
    // colors saved under the old neon palette get discarded so the warm rank color takes over
    if (saved && !RANK_PALETTE.includes(saved) && saved !== '#f5f3ec') {
      localStorage.removeItem('rank_card_color');
      return null;
    }
    return saved;
  });
  const [showRankPalette, setShowRankPalette] = useState(false);

  function handleLogoClick() { logoInputRef.current?.click(); }
  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      localStorage.setItem('custom_logo', dataUrl);
      setCustomLogo(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset so re-selecting same file works
  }

  useEffect(() => {
    api.get('/me/summary')
      .then(r => setMe(r.data))
      .catch(() => {});
  }, []);

  // Effective rank color — custom overrides auto; falls back to indigo on load
  const autoRankColor = me ? (RANK_COLORS[me.rank] ?? '#d97757') : '#d97757';
  const rankColor     = customRankColor ?? autoRankColor;

  // Keep --rank-rgb CSS variable in sync → drives the body gradient orbs
  useEffect(() => {
    document.documentElement.style.setProperty('--rank-rgb', hexToRgb(rankColor));
  }, [rankColor]);

  // Close palette on click-outside
  useEffect(() => {
    if (!showRankPalette) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-rank-palette]')) setShowRankPalette(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showRankPalette]);

  function applyRankColor(hex: string) {
    setCustomRankColor(hex);
    localStorage.setItem('rank_card_color', hex);
    setShowRankPalette(false);
  }
  function resetRankColor() {
    setCustomRankColor(null);
    localStorage.removeItem('rank_card_color');
    setShowRankPalette(false);
  }

  return (
    <div className="flex min-h-screen overflow-x-hidden">

      {/* ═══════════════════════════════════════ DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col py-4 px-2 shrink-0"
        style={{
          width: 228,
          background: 'var(--side-bg)',
          borderRight: '1px solid var(--b)',
          position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
        }}>

        {/* Logo — click to upload custom image from gallery */}
        <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
        <div className="mb-3 px-2 flex items-center gap-2.5">
          <div
            onClick={handleLogoClick}
            title="Click to swap logo"
            className="shrink-0 rounded-full overflow-hidden relative group cursor-pointer"
            style={{ width: 36, height: 36, background: '#e3dfda', boxShadow: '0 0 0 2px var(--b)', flexShrink: 0 }}>
            <img src={customLogo ?? '/logo.png'} alt="logo" className="w-full h-full object-cover" style={{ objectPosition: 'center top' }} />
            {/* Camera overlay — always faintly visible, bright on hover */}
            <div className="absolute inset-0 flex items-center justify-center transition-all duration-200"
              style={{ background: 'rgba(0,0,0,0)', opacity: 0.6 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.55)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0)'; }}>
              <ImagePlus size={12} style={{ color: '#fff', opacity: 0 }}
                className="group-hover:opacity-100 transition-opacity duration-150" />
            </div>
            {/* Permanent tiny camera pip at bottom-right */}
            <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full flex items-center justify-center"
              style={{ background: 'var(--s1)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <ImagePlus size={7} style={{ color: 'var(--t-faint)' }} />
            </div>
          </div>
          <div>
            <p className="text-[13px] font-black text-head">Self Tracker</p>
            <p className="text-[9px] font-bold tracking-[0.14em] uppercase" style={{ color: 'var(--t-faint)' }}>@{user?.username}</p>
          </div>
        </div>

        {/* Character snapshot */}
        <div className="mx-1 mb-2 px-3 py-2.5 rounded-xl relative" data-rank-palette
          style={{
            background: `${rankColor}10`,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: `1px solid ${rankColor}30`,
            boxShadow: `0 4px 20px ${rankColor}15`,
            transition: 'background 0.4s, border-color 0.4s, box-shadow 0.4s',
          }}>
          <div className="flex items-center gap-2 mb-2">
            {/* Avatar */}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ background: `${rankColor}20`, border: `1px solid ${rankColor}40` }}>
              {me?.profile.avatar_emoji || '⚔️'}
            </div>
            <div className="min-w-0 flex-1">
              {/* Class tier label — inferred from rank if API hasn't sent it yet */}
              {(() => {
                const RANK_TO_CLASS_SB: Record<string,string> = {
                  E:'Soldier',D:'Soldier',C:'Soldier',B:'Soldier',
                  A:'General',S:'General','S+':'King','∞':'King',
                };
                const cls = me?.rankClass || (me?.rank ? RANK_TO_CLASS_SB[me.rank] : null);
                if (!cls) return null;
                return (
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-[8px] font-black tracking-[0.22em]"
                      style={{ color: rankColor, opacity: 0.75 }}>
                      {CLASS_META[cls]?.label ?? cls}
                    </span>
                    <span className="text-[8px]" style={{ color: rankColor, opacity: 0.3 }}>CLASS</span>
                  </div>
                );
              })()}

              {/* Rank badge — click to open color picker */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <button
                  onClick={() => setShowRankPalette(v => !v)}
                  title="Customise rank color"
                  className="relative inline-flex tap"
                  style={{ color: rankColor }}>
                  <span className="ring-ping ring-ping-2" />
                  <span className="ring-ping ring-ping-3" />
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full tracking-widest relative z-10"
                    style={{ background: `${rankColor}22`, color: rankColor, border: `1px solid ${rankColor}40` }}>
                    {me?.rank || 'E'} RANK
                  </span>
                </button>
              </div>
              <p className="text-xs font-bold text-head truncate leading-tight">
                {me?.profile.character_name || user?.username || 'Hunter'}
              </p>
              {me?.rankLabel && (
                <p className="text-[9px]" style={{ color: rankColor }}>{me.rankLabel}</p>
              )}
            </div>
          </div>

          {/* Merit bar */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: 'var(--t-faint)' }}>MERIT SCORE</span>
              <span className="text-[10px] font-black font-mono" style={{ color: rankColor }}>
                {me?.meritScore ?? 0}<span className="opacity-50">/100</span>
              </span>
            </div>
            <div className="xp-track">
              <div className="xp-fill bar-fill"
                style={{ width: `${me?.meritScore ?? 0}%`, background: rankColor, boxShadow: 'none', transition: 'background 0.4s, box-shadow 0.4s' }} />
            </div>
          </div>

          {/* Color palette popup */}
          {showRankPalette && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl p-3 scale-in"
              style={{
                background: 'var(--s2)',
                border: '1px solid var(--bh)',
                boxShadow: `0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px ${rankColor}20`,
              }}>
              <p className="text-[9px] font-black tracking-[0.18em] mb-2.5" style={{ color: 'var(--t-faint)' }}>
                RANK COLOR
              </p>
              <div className="grid grid-cols-6 gap-1.5 mb-2.5">
                {RANK_PALETTE.map(c => (
                  <button key={c} type="button" onClick={() => applyRankColor(c)}
                    className="tap w-6 h-6 rounded-full transition-transform"
                    style={{
                      background: c,
                      transform: rankColor === c ? 'scale(1.3)' : undefined,
                      outline: rankColor === c ? `2px solid ${c}` : '2px solid transparent',
                      outlineOffset: 2,
                      boxShadow: rankColor === c ? `0 0 0 2px var(--s1), 0 0 0 3.5px ${c}` : undefined,
                    }} />
                ))}
              </div>
              {customRankColor && (
                <button onClick={resetRankColor}
                  className="w-full text-[10px] py-1 rounded-lg tap text-center"
                  style={{ background: 'var(--hov)', color: 'var(--t-faint)' }}>
                  Reset to rank default
                </button>
              )}
            </div>
          )}
        </div>

        {/* Clock */}
        <SidebarClock />

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto hide-scroll pb-2">
          {NAV.map(({ to, icon: Icon, label, color }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => isActive ? 'nav-active-glow' : ''}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '7px 10px',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? color : 'var(--t-faint)',
                background: isActive
                  ? 'var(--hov)'
                  : 'transparent',
                border: isActive
                  ? '1px solid var(--hov-b)'
                  : '1px solid transparent',
                boxShadow: isActive
                  ? '0 1px 4px rgba(0,0,0,0.12)'
                  : 'none',
                textDecoration: 'none',
                transition: 'all 0.18s cubic-bezier(0.34,1.2,0.64,1)',
              } as React.CSSProperties)}
              onMouseEnter={e => {
                if (e.currentTarget.getAttribute('aria-current') !== 'page') {
                  e.currentTarget.style.color = 'var(--t-body)';
                  e.currentTarget.style.background = 'var(--hov)';
                  e.currentTarget.style.border = '1px solid var(--hov-b)';
                }
              }}
              onMouseLeave={e => {
                if (e.currentTarget.getAttribute('aria-current') !== 'page') {
                  e.currentTarget.style.color = 'var(--t-faint)';
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.border = '1px solid transparent';
                }
              }}>
              {({ isActive }) => (
                <>
                  <Icon size={14} style={{ color: isActive ? color : 'inherit', flexShrink: 0, transition: 'color 0.15s' }} />
                  <span className="truncate">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom utilities */}
        <div className="shrink-0 pt-2 space-y-0.5" style={{ borderTop: '1px solid var(--b)' }}>
          {([
            { icon: isLight ? Moon : Sun, label: isLight ? 'Dark mode' : 'Light mode', onClick: toggleMode },
            { icon: KeyRound, label: 'Password', onClick: () => setShowChangePw(true) },
          ] as const).map(({ icon: Icon, label, onClick }) => (
            <button key={label} onClick={onClick}
              className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-xl text-[13px] transition-all duration-150"
              style={{ color: 'var(--t-faint)', border: '1px solid transparent' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = 'var(--t-head)';
                (e.currentTarget as HTMLElement).style.background = 'var(--hov)';
                (e.currentTarget as HTMLElement).style.border = '1px solid var(--hov-b)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = 'var(--t-faint)';
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.border = '1px solid transparent';
              }}>
              <Icon size={13} /> {label}
            </button>
          ))}

          {/* Accent picker */}
          <button onClick={() => setShowTheme(s => !s)}
            className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-xl text-[13px] transition-all duration-150"
            style={{ color: 'var(--t-faint)', border: '1px solid transparent' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--t-head)';
              (e.currentTarget as HTMLElement).style.background = 'var(--hov)';
              (e.currentTarget as HTMLElement).style.border = '1px solid var(--hov-b)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--t-faint)';
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.border = '1px solid transparent';
            }}>
            <Palette size={13} />
            <span className="flex-1 text-left">Accent</span>
            <span className="w-3 h-3 rounded-full border border-white/10" style={{ background: accent.main }} />
          </button>
          {showTheme && (
            <div className="rounded-xl p-3 space-y-2"
              style={{
                background: 'var(--s2)',
                border: '1px solid var(--bh)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              }}>
              <div className="flex items-center justify-between">
                <span className="sys-label">Accent Color</span>
                <button onClick={() => setShowTheme(false)} style={{ color: 'var(--t-faint)' }}><X size={11} /></button>
              </div>
              <div className="flex flex-wrap gap-2">
                {ACCENT_PRESETS.map(p => (
                  <button key={p.id} title={p.label}
                    onClick={() => { setAccent(p); setShowTheme(false); }}
                    className="w-5 h-5 rounded-full transition-all hover:scale-110"
                    style={{ background: p.main, outline: accent.id === p.id ? '2px solid var(--t-head)' : 'none', outlineOffset: '2px', transform: accent.id === p.id ? 'scale(1.15)' : undefined }} />
                ))}
              </div>
            </div>
          )}

          <button onClick={logout}
            className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-xl text-[13px] transition-all duration-150"
            style={{ color: 'var(--t-faint)', border: '1px solid transparent' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = '#e07b62';
              (e.currentTarget as HTMLElement).style.background = 'rgba(205,82,64,0.10)';
              (e.currentTarget as HTMLElement).style.border = '1px solid rgba(205,82,64,0.16)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--t-faint)';
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.border = '1px solid transparent';
            }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      {/* ═══════════════════════════════════════ MOBILE ICON STRIP */}
      <aside className="md:hidden fixed left-0 top-0 bottom-0 z-50 flex flex-col items-center"
        style={{
          width: 'var(--sidebar-w)',
          background: 'var(--side-bg)',
          borderRight: '1px solid var(--b)',
        }}>

        {/* Logo (mobile) — click to upload */}
        <div className="shrink-0 pt-3 pb-1">
          <div onClick={handleLogoClick} title="Change logo"
            className="rounded-full overflow-hidden relative group cursor-pointer"
            style={{ width: 34, height: 34, background: '#e3dfda', boxShadow: '0 0 0 2px var(--b)' }}>
            <img src={customLogo ?? '/logo.png'} alt="logo" className="w-full h-full object-cover" style={{ objectPosition: 'center top' }} />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(0,0,0,0.55)' }}>
              <ImagePlus size={11} style={{ color: '#fff' }} />
            </div>
          </div>
        </div>

        <MobileSidebarClock />

        {/* Nav icons */}
        <div className="flex-1 min-h-0 overflow-y-auto hide-scroll w-full flex flex-col items-center gap-0.5 py-1">
          {NAV.map(({ to, icon: Icon, label, color }) => (
            <NavLink key={to} to={to} end={to === '/'} title={label}
              className="relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-150"
              style={({ isActive }) => ({
                background: isActive ? `${color}18` : 'transparent',
                color: isActive ? color : 'var(--t-faint)',
                textDecoration: 'none',
              })}>
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                      style={{ background: color }} />
                  )}
                  <Icon size={16} />
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Mobile utilities */}
        <div className="shrink-0 flex flex-col items-center gap-0.5 py-2" style={{ borderTop: '1px solid var(--b)' }}>
          {[
            { icon: isLight ? Moon : Sun, action: toggleMode, title: 'Theme' },
            { icon: KeyRound,   action: () => setShowChangePw(true), title: 'Password' },
            { icon: Palette,    action: () => setShowTheme(s => !s), title: 'Accent' },
            { icon: LogOut,     action: logout,                      title: 'Sign out' },
          ].map(({ icon: Icon, action, title }) => (
            <button key={title} onClick={action} title={title}
              className="flex items-center justify-center w-10 h-10 rounded-xl tap"
              style={{ color: 'var(--t-faint)' }}>
              <Icon size={15} />
            </button>
          ))}
        </div>
      </aside>

      {/* Mobile accent picker */}
      {showTheme && (
        <div className="md:hidden fixed z-40 scale-in"
          style={{
            left: 'calc(var(--sidebar-w) + 8px)', bottom: '80px',
            background: 'var(--s2)',
            border: '1px solid var(--bh)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            borderRadius: 16, padding: 12, minWidth: 160,
          }}>
          <div className="flex items-center justify-between mb-2">
            <span className="sys-label">Accent</span>
            <button onClick={() => setShowTheme(false)} style={{ color: 'var(--t-faint)' }}><X size={11} /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map(p => (
              <button key={p.id} title={p.label}
                onClick={() => { setAccent(p); setShowTheme(false); }}
                className="w-5 h-5 rounded-full transition-all hover:scale-110"
                style={{ background: p.main, outline: accent.id === p.id ? '2px solid var(--t-head)' : 'none', outlineOffset: '2px' }} />
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ MAIN CONTENT */}
      <div className="mob-offset flex-1 flex flex-col min-w-0">
        {/* Mobile top header */}
        <header className="md:hidden flex items-center justify-between px-3 py-2.5"
          style={{
            background: 'var(--side-bg)',
            borderBottom: '1px solid var(--b)',
          }}>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-start">
              {(() => {
                const R2C: Record<string,string> = {E:'Soldier',D:'Soldier',C:'Soldier',B:'Soldier',A:'General',S:'General','S+':'King','∞':'King'};
                const cls = me?.rankClass || (me?.rank ? R2C[me.rank] : null);
                if (!cls) return null;
                return (
                  <span className="text-[7px] font-black tracking-[0.2em] leading-none mb-0.5"
                    style={{ color: rankColor, opacity: 0.7 }}>
                    {cls.toUpperCase()}
                  </span>
                );
              })()}
              <span className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full"
                style={{ background: `${rankColor}20`, color: rankColor, border: `1px solid ${rankColor}40` }}>
                {me?.rank || 'E'} RANK
              </span>
            </div>
            <span className="text-[13px] font-bold text-head">
              {me?.profile.character_name || user?.username}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap size={11} style={{ color: 'var(--cyan)' }} />
            <span className="text-[11px] font-black font-mono" style={{ color: 'var(--cyan)' }}>
              {me?.meritScore ?? 0}<span className="opacity-50">/100</span>
            </span>
          </div>
        </header>

        <main className="flex-1 px-5 py-7 md:px-14 md:py-10 max-w-5xl w-full mx-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}
