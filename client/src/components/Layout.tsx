import { NavLink, Outlet } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, CheckSquare, BookOpen, Bell, BarChart2,
  Dumbbell, Sparkles, LogOut, Sun, Moon, Palette, X, Salad, KeyRound,
  ShieldOff, Target, Activity, Wallet, Swords, Zap, Shield, ImagePlus, Video,
  AudioLines, Brain, Flame, Menu,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, ACCENT_PRESETS } from '../contexts/ThemeContext';
import api from '../lib/api';

const NAV = [
  { to: '/',          icon: AudioLines,      label: 'Daily log',  color: '#e59a7f' },
  { to: '/me',        icon: Swords,          label: 'Character',  color: '#d9a066' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Command',    color: '#d97757' },
  { to: '/focus',     icon: Brain,           label: 'Focus',      color: '#d97757' },
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
  { to: '/quotes',    icon: Flame,           label: 'Wall of Fire', color: '#e08b4e' },
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
  rankName?: string;
  leagueLabel?: string;
  meritScore: number;
  profile: { avatar_emoji: string; character_name: string };
}

interface Quote { id: number; text: string; author: string | null }

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

/* ── Sidebar quote box ── */
function SidebarQuote({ quotes }: { quotes: Quote[] }) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * Math.max(quotes.length, 1)));

  useEffect(() => {
    if (quotes.length < 2) return;
    const id = setInterval(() => setIdx(i => (i + 1) % quotes.length), 14000);
    return () => clearInterval(id);
  }, [quotes.length]);

  if (!quotes.length) return null;
  const q = quotes[idx % quotes.length];

  return (
    <div className="mx-1 mb-3 rounded-xl relative overflow-hidden cursor-pointer"
      onClick={() => setIdx(i => (i + 1) % quotes.length)}
      title="Next quote"
      style={{
        background: 'linear-gradient(145deg, #e08b4e14 0%, #cd524008 60%, #e08b4e08 100%)',
        border: '1px solid #e08b4e28',
        boxShadow: '0 2px 16px #e08b4e0a',
      }}>

      {/* Big ambient flame watermark */}
      <div className="absolute -right-3 -bottom-3 pointer-events-none select-none"
        style={{ opacity: 0.07 }}>
        <Flame size={72} style={{ color: '#e08b4e' }} />
      </div>

      {/* Ember sparkle top-right */}
      <div className="absolute top-2 right-2.5 pointer-events-none"
        style={{ opacity: 0.35 }}>
        <Flame size={10} style={{ color: '#e08b4e' }} />
      </div>

      <div className="relative px-3 pt-2.5 pb-3">
        {/* Label */}
        <div className="flex items-center gap-1 mb-2">
          <Flame size={8} style={{ color: '#e08b4e' }} />
          <span className="text-[7.5px] font-black tracking-[0.2em] uppercase"
            style={{ color: '#e08b4e', opacity: 0.75 }}>Wall of Fire</span>
        </div>

        {/* Quote text */}
        <p className="text-[11px] leading-[1.55] mb-2"
          style={{
            color: 'var(--t-body)',
            fontFamily: "'Lora', Georgia, serif",
            fontStyle: 'italic',
            display: '-webkit-box',
            WebkitLineClamp: 5,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
          "{q.text}"
        </p>

        {/* Author */}
        {q.author && (
          <p className="text-[9px] font-bold tracking-wide"
            style={{ color: '#e08b4e', opacity: 0.65 }}>— {q.author}</p>
        )}

        {/* Dot nav */}
        {quotes.length > 1 && (
          <div className="flex gap-1 mt-2">
            {quotes.map((_, i) => (
              <span key={i} className="rounded-full transition-all duration-300"
                style={{
                  width: i === idx % quotes.length ? 10 : 4,
                  height: 3,
                  background: i === idx % quotes.length ? '#e08b4e' : '#e08b4e44',
                }} />
            ))}
          </div>
        )}
      </div>
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
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const [customLogo, setCustomLogo] = useState<string | null>(() => localStorage.getItem('custom_logo'));

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
    e.target.value = '';
  }

  useEffect(() => {
    api.get('/me/summary').then(r => setMe(r.data)).catch(() => {});
    api.get('/quotes').then(r => setQuotes(r.data)).catch(() => {});
  }, []);

  const rankColor = me?.rankColor || '#d97757';

  useEffect(() => {
    document.documentElement.style.setProperty('--rank-rgb', hexToRgb(rankColor));
  }, [rankColor]);

  // Close mobile drawer when route changes
  useEffect(() => { setMobileOpen(false); }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  /* ── Shared nav link renderer ── */
  function NavLinks({ onClick }: { onClick?: () => void }) {
    return (
      <nav className="flex-1 space-y-0.5 overflow-y-auto hide-scroll pb-2">
        {NAV.map(({ to, icon: Icon, label, color }) => (
          <NavLink key={to} to={to} end={to === '/'} onClick={onClick}
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
              background: isActive ? 'var(--hov)' : 'transparent',
              border: isActive ? '1px solid var(--hov-b)' : '1px solid transparent',
              boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
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
    );
  }

  /* ── Shared bottom utilities ── */
  function BottomUtils({ onClose }: { onClose?: () => void }) {
    return (
      <div className="shrink-0 pt-2 space-y-0.5" style={{ borderTop: '1px solid var(--b)' }}>
        {([
          { icon: isLight ? Moon : Sun, label: isLight ? 'Dark mode' : 'Light mode', onClick: toggleMode },
          { icon: KeyRound, label: 'Password', onClick: () => { setShowChangePw(true); onClose?.(); } },
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
            style={{ background: 'var(--s2)', border: '1px solid var(--bh)', boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}>
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
    );
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

        <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />

        {/* Logo */}
        <div className="mb-3 px-2 flex items-center gap-2.5">
          <div onClick={handleLogoClick} title="Click to swap logo"
            className="shrink-0 rounded-full overflow-hidden relative group cursor-pointer"
            style={{ width: 36, height: 36, background: '#e3dfda', boxShadow: '0 0 0 2px var(--b)', flexShrink: 0 }}>
            <img src={customLogo ?? '/logo.png'} alt="logo" className="w-full h-full object-cover" style={{ objectPosition: 'center top' }} />
            <div className="absolute inset-0 flex items-center justify-center transition-all duration-200"
              style={{ background: 'rgba(0,0,0,0)', opacity: 0.6 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.55)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0)'; }}>
              <ImagePlus size={12} style={{ color: '#fff', opacity: 0 }}
                className="group-hover:opacity-100 transition-opacity duration-150" />
            </div>
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

        {/* Quote box */}
        <SidebarQuote quotes={quotes} />

        {/* Clock */}
        <SidebarClock />

        {/* Navigation */}
        <NavLinks />

        {/* Bottom utilities */}
        <BottomUtils />
      </aside>

      {/* ═══════════════════════════════════════ MOBILE DRAWER */}
      {/* Backdrop */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
          onClick={() => setMobileOpen(false)} />
      )}

      {/* Drawer panel */}
      <div className="md:hidden fixed top-0 left-0 bottom-0 z-50 flex flex-col py-4 px-2"
        style={{
          width: 240,
          background: 'var(--side-bg)',
          borderRight: '1px solid var(--b)',
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
          overflowY: 'auto',
        }}>

        {/* Drawer header */}
        <div className="mb-3 px-2 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div onClick={handleLogoClick}
              className="shrink-0 rounded-full overflow-hidden cursor-pointer"
              style={{ width: 32, height: 32, background: '#e3dfda', boxShadow: '0 0 0 2px var(--b)', flexShrink: 0 }}>
              <img src={customLogo ?? '/logo.png'} alt="logo" className="w-full h-full object-cover" style={{ objectPosition: 'center top' }} />
            </div>
            <div>
              <p className="text-[12px] font-black text-head leading-tight">Self Tracker</p>
              <p className="text-[8px] font-bold tracking-[0.14em] uppercase" style={{ color: 'var(--t-faint)' }}>@{user?.username}</p>
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)}
            className="tap w-7 h-7 flex items-center justify-center rounded-lg shrink-0"
            style={{ color: 'var(--t-faint)', background: 'var(--s2)', border: '1px solid var(--b)' }}>
            <X size={14} />
          </button>
        </div>

        {/* Quote box in drawer */}
        <SidebarQuote quotes={quotes} />

        {/* Nav */}
        <NavLinks onClick={() => setMobileOpen(false)} />

        {/* Utilities */}
        <BottomUtils onClose={() => setMobileOpen(false)} />
      </div>

      {/* ═══════════════════════════════════════ MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top header */}
        <header className="md:hidden flex items-center justify-between px-3 py-2.5"
          style={{ background: 'var(--side-bg)', borderBottom: '1px solid var(--b)' }}>

          {/* Hamburger */}
          <button onClick={() => setMobileOpen(true)}
            className="tap w-9 h-9 flex items-center justify-center rounded-xl shrink-0"
            style={{ color: 'var(--t-faint)', background: 'var(--s2)', border: '1px solid var(--b)' }}>
            <Menu size={17} />
          </button>

          {/* Rank + name */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex flex-col items-start shrink-0">
              {(me?.leagueLabel || me?.rankClass) && (
                <span className="text-[7px] font-black tracking-[0.2em] leading-none mb-0.5"
                  style={{ color: rankColor, opacity: 0.7 }}>
                  {(me.leagueLabel || me.rankClass).toUpperCase()}
                </span>
              )}
              <span className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full"
                style={{ background: `${rankColor}20`, color: rankColor, border: `1px solid ${rankColor}40` }}>
                {me?.rank || 'A1'} RANK
              </span>
            </div>
            <span className="text-[13px] font-bold text-head truncate">
              {me?.profile.character_name || user?.username}
            </span>
          </div>

          {/* Merit */}
          <div className="flex items-center gap-1.5 shrink-0">
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
