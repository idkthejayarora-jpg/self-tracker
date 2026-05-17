import { NavLink, Outlet } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, CheckSquare, BookOpen, Bell, BarChart2,
  Dumbbell, Sparkles, LogOut, Sun, Moon, Palette, X, Salad, KeyRound,
  ShieldOff, Target, Activity, Wallet, Swords, Zap, Shield, ImagePlus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, ACCENT_PRESETS } from '../contexts/ThemeContext';
import api from '../lib/api';

const NAV = [
  { to: '/me',        icon: Swords,          label: 'Character',  color: '#e2c97e' },
  { to: '/',          icon: LayoutDashboard, label: 'Command',    color: '#6366f1' },
  { to: '/tasks',     icon: CheckSquare,     label: 'Missions',   color: '#818cf8' },
  { to: '/habits',    icon: Target,          label: 'Habits',     color: '#f97316' },
  { to: '/workout',   icon: Dumbbell,        label: 'Training',   color: '#ef4444' },
  { to: '/sleep',     icon: Moon,            label: 'Sleep',      color: '#818cf8' },
  { to: '/journal',   icon: BookOpen,        label: 'Journal',    color: '#a855f7' },
  { to: '/finance',   icon: Wallet,          label: 'Finance',    color: '#f59e0b' },
  { to: '/diet',      icon: Salad,           label: 'Nutrition',  color: '#22c55e' },
  { to: '/body',      icon: Activity,        label: 'Body',       color: '#06b6d4' },
  { to: '/life',      icon: Sparkles,        label: 'Life Path',  color: '#ec4899' },
  { to: '/analytics', icon: BarChart2,       label: 'Intel',      color: '#06b6d4' },
  { to: '/reminders', icon: Bell,            label: 'Alerts',     color: '#f97316' },
  { to: '/detox',     icon: ShieldOff,       label: 'Detox',      color: '#84cc16' },
];

const RANK_COLORS: Record<string, string> = {
  E: '#6b7280', D: '#3b82f6', C: '#22c55e', B: '#a855f7',
  A: '#f97316', S: '#ef4444', SS: '#f59e0b', SSS: '#e2c97e',
};

interface MeSnap {
  rank: string;
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
        style={{ background: 'var(--s1)', border: '1px solid var(--b)' }}>
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
              style={{ background: '#22c55e18', border: '1px solid #22c55e30' }}>
              <Shield size={20} style={{ color: '#22c55e' }} />
            </div>
            <p className="text-sm font-bold" style={{ color: '#22c55e' }}>Password updated!</p>
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
            {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
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
          style={{ width: `${minPct}%`, background: 'rgb(var(--accent-rgb) / 0.7)', boxShadow: '0 0 5px rgb(var(--accent-rgb) / 0.5)' }} />
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

  const rankColor = me ? (RANK_COLORS[me.rank] ?? '#6366f1') : 'rgb(var(--accent-rgb))';

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--s0)' }}>

      {/* ═══════════════════════════════════════ DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col py-4 px-2 shrink-0"
        style={{ width: 228, background: 'var(--s1)', borderRight: '1px solid var(--b)', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>

        {/* Logo — click to upload custom image from gallery */}
        <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
        <div className="mb-3 px-2 flex items-center gap-2.5">
          <div
            onClick={handleLogoClick}
            title="Click to swap logo"
            className="shrink-0 rounded-full overflow-hidden relative group cursor-pointer"
            style={{ width: 36, height: 36, background: '#e3dfda', boxShadow: '0 0 0 2px rgba(255,255,255,0.10)', flexShrink: 0 }}>
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
        <div className="mx-1 mb-2 px-3 py-2.5 rounded-xl glow-card"
          style={{ background: 'var(--s2)', border: `1px solid ${rankColor}25`, '--gc': `${rankColor}50` } as React.CSSProperties}>
          <div className="flex items-center gap-2 mb-2">
            {/* Avatar */}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ background: `${rankColor}18`, border: `1px solid ${rankColor}35` }}>
              {me?.profile.avatar_emoji || '⚔️'}
            </div>
            <div className="min-w-0">
              {/* Rank badge with radar rings */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className="relative inline-flex" style={{ color: rankColor }}>
                  <span className="ring-ping ring-ping-2" />
                  <span className="ring-ping ring-ping-3" />
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full tracking-widest relative z-10"
                    style={{ background: `${rankColor}22`, color: rankColor, border: `1px solid ${rankColor}40` }}>
                    {me?.rank || 'E'} RANK
                  </span>
                </div>
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
                style={{ width: `${me?.meritScore ?? 0}%`, background: rankColor, boxShadow: `0 0 6px ${rankColor}80` }} />
            </div>
          </div>
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
                padding: isActive ? '7px 10px 7px 8px' : '7px 10px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? color : 'var(--t-faint)',
                background: isActive ? `${color}14` : 'transparent',
                borderLeft: isActive ? `2px solid ${color}` : '2px solid transparent',
                textDecoration: 'none',
                transition: 'all 0.15s',
              } as React.CSSProperties)}
              onMouseEnter={e => {
                if (e.currentTarget.getAttribute('aria-current') !== 'page') {
                  e.currentTarget.style.color = 'var(--t-body)';
                  e.currentTarget.style.background = 'var(--s2)';
                }
              }}
              onMouseLeave={e => {
                if (e.currentTarget.getAttribute('aria-current') !== 'page') {
                  e.currentTarget.style.color = 'var(--t-faint)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}>
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="active-dot shrink-0" style={{ color, background: color }} />
                  )}
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
            { icon: isLight ? Moon : Sun, label: isLight ? 'Dark mode' : 'Light mode', onClick: toggleMode, hoverColor: 'var(--t-head)' },
            { icon: KeyRound, label: 'Password', onClick: () => setShowChangePw(true), hoverColor: 'var(--t-head)' },
          ] as const).map(({ icon: Icon, label, onClick }) => (
            <button key={label} onClick={onClick}
              className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-xl text-[13px] transition-all duration-150"
              style={{ color: 'var(--t-faint)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t-head)'; (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t-faint)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
              <Icon size={13} /> {label}
            </button>
          ))}

          {/* Accent picker */}
          <button onClick={() => setShowTheme(s => !s)}
            className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-xl text-[13px] transition-all duration-150"
            style={{ color: 'var(--t-faint)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t-head)'; (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t-faint)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
            <Palette size={13} />
            <span className="flex-1 text-left">Accent</span>
            <span className="w-3 h-3 rounded-full border border-white/10" style={{ background: accent.main }} />
          </button>
          {showTheme && (
            <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--s2)', border: '1px solid var(--b)' }}>
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
            style={{ color: 'var(--t-faint)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.background = '#ef444410'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t-faint)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      {/* ═══════════════════════════════════════ MOBILE ICON STRIP */}
      <aside className="md:hidden fixed left-0 top-0 bottom-0 z-50 flex flex-col items-center"
        style={{ width: 'var(--sidebar-w)', background: 'var(--s1)', borderRight: '1px solid var(--b)' }}>

        {/* Logo (mobile) — click to upload */}
        <div className="shrink-0 pt-3 pb-1">
          <div onClick={handleLogoClick} title="Change logo"
            className="rounded-full overflow-hidden relative group cursor-pointer"
            style={{ width: 34, height: 34, background: '#e3dfda', boxShadow: '0 0 0 2px rgba(255,255,255,0.08)' }}>
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
          style={{ left: 'calc(var(--sidebar-w) + 8px)', bottom: '80px', background: 'var(--s2)', border: '1px solid var(--b)', borderRadius: 14, padding: 12, minWidth: 160 }}>
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
          style={{ background: 'var(--s1)', borderBottom: '1px solid var(--b)' }}>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full"
              style={{ background: `${rankColor}20`, color: rankColor, border: `1px solid ${rankColor}40` }}>
              {me?.rank || 'E'}
            </span>
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

        <main className="flex-1 px-4 py-5 md:px-8 md:py-7 max-w-5xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}
