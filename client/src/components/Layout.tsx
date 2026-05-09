import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">Change password</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
        </div>
        {success ? (
          <div className="text-center py-4 space-y-3">
            <p className="text-green-400 font-medium">Password updated!</p>
            <button onClick={onClose} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input type="password" placeholder="Current password" value={current} onChange={e => setCurrent(e.target.value)} required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <input type="password" placeholder="New password" value={next} onChange={e => setNext(e.target.value)} required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <input type="password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              {loading ? 'Updating...' : 'Update password'}
            </button>
          </form>
        )}
      </div>
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
    color: isActive ? '#f4f4f5' : '#71717a',
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
    color: isActive ? `rgb(var(--accent-rgb-light))` : '#52525b',
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
        <div className="mb-7 px-1 flex items-center gap-2.5">
          <img src="/logo.svg" alt="Self Tracker" className="w-8 h-8 rounded-lg shrink-0" />
          <div>
            <p className="text-[13px] font-bold text-head leading-tight">Self Tracker</p>
            <p className="text-[11px]" style={{ color: '#52525b' }}>@{user?.username}</p>
          </div>
        </div>

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
            style={{ color: '#71717a' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e4e4e7'; e.currentTarget.style.background = 'var(--s2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#71717a'; e.currentTarget.style.background = 'transparent'; }}>
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
            style={{ color: '#52525b' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'var(--s2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#52525b'; e.currentTarget.style.background = 'transparent'; }}>
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile Left Icon Sidebar ── */}
      <aside className="md:hidden fixed left-0 top-0 bottom-0 z-50 flex flex-col items-center"
        style={{ width: 'var(--sidebar-w)', background: 'var(--s1)', borderRight: '1px solid var(--b)' }}>

        {/* Logo — fixed at top */}
        <div className="shrink-0 pt-3 pb-2">
          <img src="/logo.svg" alt="" className="w-7 h-7 rounded-lg" />
        </div>

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
