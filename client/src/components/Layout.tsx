import { NavLink, Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, CheckSquare, BookOpen, Bell, BarChart2,
  Dumbbell, Sparkles, LogOut, Sun, Moon, Palette, X, Salad, KeyRound,
  ShieldOff, Target, Activity, Wallet,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, ACCENT_PRESETS } from '../contexts/ThemeContext';
import api from '../lib/api';

const NAV = [
  { to: '/',          icon: LayoutDashboard, label: 'Home'      },
  { to: '/tasks',     icon: CheckSquare,     label: 'Tasks'     },
  { to: '/journal',   icon: BookOpen,        label: 'Journal'   },
  { to: '/habits',    icon: Target,          label: 'Habits'    },
  { to: '/workout',   icon: Dumbbell,        label: 'Workout'   },
  { to: '/diet',      icon: Salad,           label: 'Diet'      },
  { to: '/body',      icon: Activity,        label: 'Body'      },
  { to: '/sleep',     icon: Moon,            label: 'Sleep'     },
  { to: '/finance',   icon: Wallet,          label: 'Finance'   },
  { to: '/life',      icon: Sparkles,        label: 'Life'      },
  { to: '/reminders', icon: Bell,            label: 'Reminders' },
  { to: '/analytics', icon: BarChart2,       label: 'Analytics' },
  { to: '/detox',     icon: ShieldOff,       label: 'Detox'     },
];

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
    if (next !== confirm) { setError("New passwords don't match"); return; }
    if (next.length < 4) { setError('Password must be at least 4 characters'); return; }
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
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="card scale-in p-5 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-head text-sm">Change password</h3>
          <button onClick={onClose} className="tap" style={{ color: 'var(--t-faint)' }}><X size={16} /></button>
        </div>
        {success ? (
          <div className="text-center py-4 space-y-3">
            <p className="text-sm font-semibold" style={{ color: '#22c55e' }}>Password updated!</p>
            <button onClick={onClose}
              className="w-full py-2 rounded-xl text-sm font-semibold text-white tap"
              style={{ background: 'rgb(var(--accent-rgb))' }}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-2.5">
            {[
              { ph: 'Current password', val: current, set: setCurrent },
              { ph: 'New password',     val: next,    set: setNext    },
              { ph: 'Confirm new',      val: confirm,  set: setConfirm },
            ].map(({ ph, val, set }) => (
              <input key={ph} type="password" placeholder={ph} value={val}
                onChange={e => set(e.target.value)} required
                className="w-full rounded-xl px-3 py-2.5 text-sm" />
            ))}
            {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 text-white tap"
              style={{ background: 'rgb(var(--accent-rgb))' }}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ── Sidebar clock ── */
function SidebarClock() {
  const [now, setNow] = useState(new Date());
  const [prevSec, setPrevSec] = useState(-1);
  useEffect(() => {
    const id = setInterval(() => {
      setNow(n => {
        const d = new Date();
        setPrevSec(n.getSeconds());
        return d;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const hh  = now.getHours().toString().padStart(2, '0');
  const mm  = now.getMinutes().toString().padStart(2, '0');
  const ss  = now.getSeconds().toString().padStart(2, '0');
  const day = now.toLocaleDateString('en-US', { weekday: 'short' });
  const mon = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const secTick = now.getSeconds() !== prevSec;
  // minute progress: 0-59 → 0-100%
  const minPct = Math.round((now.getSeconds() / 60) * 100);

  return (
    <div className="px-2 py-3 mb-1" style={{ borderBottom: '1px solid var(--b)' }}>
      {/* HH:MM + :SS */}
      <div className="flex items-baseline gap-0.5">
        <span className="tabular-nums font-bold leading-none"
          style={{ fontSize: 22, color: 'rgb(var(--accent-rgb-light))', letterSpacing: '-0.03em' }}>
          {hh}
        </span>
        <span className="clock-colon font-bold leading-none"
          style={{ fontSize: 22, color: 'rgb(var(--accent-rgb-light))', letterSpacing: '-0.03em' }}>
          :
        </span>
        <span className="tabular-nums font-bold leading-none"
          style={{ fontSize: 22, color: 'rgb(var(--accent-rgb-light))', letterSpacing: '-0.03em' }}>
          {mm}
        </span>
        <span key={ss}
          className={`tabular-nums font-medium leading-none ml-0.5 ${secTick ? 'clock-seconds-tick' : ''}`}
          style={{ fontSize: 12, color: 'var(--t-faint)', marginBottom: 1 }}>
          :{ss}
        </span>
      </div>
      {/* Date row */}
      <p className="text-[10px] mt-1 font-medium" style={{ color: 'var(--t-faint)' }}>
        {day} · {mon}
      </p>
      {/* Minute progress bar */}
      <div className="mt-2 h-0.5 rounded-full overflow-hidden" style={{ background: 'var(--s3)' }}>
        <div className="h-full rounded-full bar-fill"
          style={{ width: `${minPct}%`, background: 'rgb(var(--accent-rgb) / 0.6)' }} />
      </div>
    </div>
  );
}

/* ── Mobile sidebar mini-clock ── */
function MobileSidebarClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = now.getHours().toString().padStart(2, '0');
  const mm = now.getMinutes().toString().padStart(2, '0');
  return (
    <div className="flex flex-col items-center py-2 w-full" style={{ borderBottom: '1px solid var(--b)' }}>
      <span className="tabular-nums font-bold leading-none text-[11px]"
        style={{ color: 'rgb(var(--accent-rgb-light))' }}>{hh}</span>
      <span className="clock-colon font-bold leading-none text-[11px]"
        style={{ color: 'rgb(var(--accent-rgb) / 0.4)' }}>:</span>
      <span className="tabular-nums font-bold leading-none text-[11px]"
        style={{ color: 'rgb(var(--accent-rgb-light))' }}>{mm}</span>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { toggleMode, isLight, accent, setAccent } = useTheme();
  const [showTheme, setShowTheme] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);

  const navItemStyle = (isActive: boolean) => ({
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '7px 10px', borderRadius: '8px',
    fontSize: '13.5px', fontWeight: isActive ? '600' : '500',
    color: isActive ? 'var(--t-head)' : 'var(--t-faint)',
    background: isActive ? 'var(--s2)' : 'transparent',
    transition: 'all 0.15s',
    textDecoration: 'none',
    ...(isActive ? { borderLeft: `2px solid rgb(var(--accent-rgb))`, paddingLeft: '9px' } : {}),
  });

  const mobileIconStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: isActive ? `rgb(var(--accent-rgb) / 0.12)` : 'transparent',
    color: isActive ? `rgb(var(--accent-rgb-light))` : 'var(--t-faint)',
    transition: 'all 0.15s',
    textDecoration: 'none',
    position: 'relative',
  });

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--s0)' }}>

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex flex-col w-52 py-5 px-3 shrink-0"
        style={{ background: 'var(--s1)', borderRight: '1px solid var(--b)' }}>

        {/* Logo */}
        <div className="mb-4 px-1 flex items-center gap-2.5">
          <div className="shrink-0 rounded-xl overflow-hidden"
            style={{ width: 44, height: 44, background: '#e3dfda', boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }}>
            <img src="/logo.png" alt="logo"
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center top' }} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-head leading-tight">Self Tracker</p>
            <p className="text-[11px] text-dim">@{user?.username}</p>
          </div>
        </div>

        {/* Clock */}
        <SidebarClock />

        {/* Nav */}
        <nav className="flex-1 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              style={({ isActive }) => navItemStyle(isActive) as any}
              onMouseEnter={e => { e.currentTarget.style.color = '#e4e4e7'; }}
              onMouseLeave={e => {
                const isActive = e.currentTarget.getAttribute('aria-current') === 'page';
                e.currentTarget.style.color = isActive ? '#f4f4f5' : '#71717a';
              }}
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="mt-auto space-y-0.5 pt-3" style={{ borderTop: '1px solid var(--b)' }}>
          {[
            { icon: isLight ? Moon : Sun, label: isLight ? 'Dark mode' : 'Light mode', onClick: toggleMode },
            { icon: KeyRound, label: 'Password', onClick: () => setShowChangePw(true) },
          ].map(({ icon: Icon, label, onClick }) => (
            <button key={label} onClick={onClick}
              className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-[13px] transition-colors"
              style={{ color: '#71717a' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#e4e4e7'; e.currentTarget.style.background = 'var(--s2)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#71717a'; e.currentTarget.style.background = 'transparent'; }}>
              <Icon size={14} />
              {label}
            </button>
          ))}

          <button onClick={() => setShowTheme(s => !s)}
            className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-[13px] transition-colors"
            style={{ color: 'var(--t-faint)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--t-head)'; e.currentTarget.style.background = 'var(--s2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--t-faint)'; e.currentTarget.style.background = 'transparent'; }}>
            <Palette size={14} />
            <span className="flex-1 text-left">Accent</span>
            <span className="w-3 h-3 rounded-full" style={{ background: accent.main }} />
          </button>

          {showTheme && (
            <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--s2)', border: '1px solid var(--b)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold" style={{ color: '#71717a' }}>ACCENT COLOR</span>
                <button onClick={() => setShowTheme(false)} style={{ color: '#52525b' }}><X size={12} /></button>
              </div>
              <div className="flex flex-wrap gap-2">
                {ACCENT_PRESETS.map(p => (
                  <button key={p.id} title={p.label}
                    onClick={() => { setAccent(p); setShowTheme(false); }}
                    className="w-5 h-5 rounded-full transition-all hover:scale-110"
                    style={{
                      background: p.main,
                      outline: accent.id === p.id ? `2px solid #f4f4f5` : 'none',
                      outlineOffset: '2px',
                      transform: accent.id === p.id ? 'scale(1.2)' : undefined,
                    }} />
                ))}
              </div>
            </div>
          )}

          <button onClick={logout}
            className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-[13px] transition-colors"
            style={{ color: 'var(--t-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'var(--s2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--t-muted)'; e.currentTarget.style.background = 'transparent'; }}>
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile Left Icon Sidebar ── */}
      <aside className="md:hidden fixed left-0 top-0 bottom-0 z-50 flex flex-col items-center"
        style={{ width: 'var(--sidebar-w)', background: 'var(--s1)', borderRight: '1px solid var(--b)' }}>

        {/* Logo — fixed at top */}
        <div className="shrink-0 pt-3 pb-1">
          <div className="rounded-xl overflow-hidden"
            style={{ width: 38, height: 38, background: '#e3dfda', boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }}>
            <img src="/logo.png" alt="logo"
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center top' }} />
          </div>
        </div>

        {/* Mini clock — HH stacked MM */}
        <MobileSidebarClock />

        {/* Scrollable nav icons — takes all remaining space */}
        <div className="flex-1 min-h-0 overflow-y-auto hide-scroll w-full flex flex-col items-center gap-0.5 py-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              title={label}
              style={({ isActive }) => mobileIconStyle(isActive)}>
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                      style={{ background: `rgb(var(--accent-rgb))` }} />
                  )}
                  <Icon size={18} />
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Utilities — always pinned at bottom */}
        <div className="shrink-0 flex flex-col items-center gap-0.5 py-2"
          style={{ borderTop: '1px solid var(--b)' }}>
          <button onClick={toggleMode} title={isLight ? 'Dark mode' : 'Light mode'}
            className="flex items-center justify-center w-9 h-9 rounded-xl tap transition-colors"
            style={{ color: '#71717a' }}>
            {isLight ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <button onClick={() => setShowChangePw(true)} title="Change password"
            className="flex items-center justify-center w-9 h-9 rounded-xl tap transition-colors"
            style={{ color: '#71717a' }}>
            <KeyRound size={17} />
          </button>
          <button onClick={() => setShowTheme(s => !s)} title="Accent color"
            className="flex items-center justify-center w-9 h-9 rounded-xl tap transition-colors"
            style={{ color: '#71717a' }}>
            <Palette size={17} />
          </button>
          <button onClick={logout} title="Sign out"
            className="flex items-center justify-center w-9 h-9 rounded-xl tap transition-colors"
            style={{ color: '#52525b' }}>
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {/* Mobile accent color picker */}
      {showTheme && (
        <div className="md:hidden fixed z-40"
          style={{ left: 'calc(var(--sidebar-w) + 8px)', bottom: '80px', background: 'var(--s2)', border: '1px solid var(--b)', borderRadius: '12px', padding: '12px', minWidth: '160px' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold" style={{ color: '#71717a' }}>ACCENT</span>
            <button onClick={() => setShowTheme(false)} style={{ color: '#52525b' }}><X size={12} /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map(p => (
              <button key={p.id} title={p.label}
                onClick={() => { setAccent(p); setShowTheme(false); }}
                className="w-5 h-5 rounded-full transition-all hover:scale-110"
                style={{
                  background: p.main,
                  outline: accent.id === p.id ? `2px solid #f4f4f5` : 'none',
                  outlineOffset: '2px',
                }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="mob-offset flex-1 flex flex-col min-w-0">
        {/* Mobile top header — slim, just username */}
        <header className="md:hidden flex items-center justify-between px-3 py-2.5"
          style={{ background: 'var(--s1)', borderBottom: '1px solid var(--b)' }}>
          <span className="text-[12px] font-semibold text-head">@{user?.username}</span>
          <span className="text-[11px]" style={{ color: '#52525b' }}>Self Tracker</span>
        </header>

        <main className="flex-1 p-4 md:p-6 max-w-5xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}
