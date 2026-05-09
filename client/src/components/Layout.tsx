import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard, CheckSquare, BookOpen, Bell, BarChart2,
  Dumbbell, Sparkles, LogOut, Sun, Moon, Palette, X, Salad, KeyRound,
  ShieldOff, MoreHorizontal,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, ACCENT_PRESETS } from '../contexts/ThemeContext';
import api from '../lib/api';

const NAV = [
  { to: '/',          icon: LayoutDashboard, label: 'Home'      },
  { to: '/tasks',     icon: CheckSquare,     label: 'Tasks'     },
  { to: '/journal',   icon: BookOpen,        label: 'Journal'   },
  { to: '/workout',   icon: Dumbbell,        label: 'Workout'   },
  { to: '/diet',      icon: Salad,           label: 'Diet'      },
  { to: '/life',      icon: Sparkles,        label: 'Life'      },
  { to: '/reminders', icon: Bell,            label: 'Reminders' },
  { to: '/analytics', icon: BarChart2,       label: 'Analytics' },
  { to: '/detox',     icon: ShieldOff,       label: 'Detox'     },
];

const PRIMARY_NAV = NAV.slice(0, 4);
const MORE_NAV = NAV.slice(4);

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
            <input
              type="password"
              placeholder="Current password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="password"
              placeholder="New password"
              value={next}
              onChange={e => setNext(e.target.value)}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
            >
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
  const [showMoreSheet, setShowMoreSheet] = useState(false);

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

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--s0)' }}>

      {/* ── Sidebar ── */}
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
              onMouseEnter={e => { if (!(e.currentTarget as any)._active) e.currentTarget.style.color = '#e4e4e7'; }}
              onMouseLeave={e => { if (!(e.currentTarget as any)._active) e.currentTarget.style.color = '#71717a'; }}
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
                <button onClick={() => setShowTheme(false)} style={{ color: '#52525b' }}>
                  <X size={12} />
                </button>
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

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3"
          style={{ background: 'var(--s1)', borderBottom: '1px solid var(--b)' }}>
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="" className="w-7 h-7 rounded-lg" />
            <span className="text-[13px] font-bold text-head">Self Tracker</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowChangePw(true)} className="p-1.5 transition-colors" style={{ color: '#71717a' }}>
              <KeyRound size={15} />
            </button>
            <button onClick={toggleMode} className="p-1.5 transition-colors" style={{ color: '#71717a' }}>
              {isLight ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <button onClick={() => setShowTheme(s => !s)} className="p-1.5 transition-colors" style={{ color: '#71717a' }}>
              <Palette size={15} />
            </button>
          </div>
        </header>

        {showTheme && (
          <div className="md:hidden px-4 py-3" style={{ background: 'var(--s1)', borderBottom: '1px solid var(--b)' }}>
            <div className="flex flex-wrap gap-3 justify-center">
              {ACCENT_PRESETS.map(p => (
                <button key={p.id} title={p.label}
                  onClick={() => { setAccent(p); setShowTheme(false); }}
                  className="w-6 h-6 rounded-full transition-all"
                  style={{
                    background: p.main,
                    outline: accent.id === p.id ? `2px solid #f4f4f5` : 'none',
                    outlineOffset: '2px',
                  }} />
              ))}
            </div>
          </div>
        )}

        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 max-w-5xl w-full mx-auto">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50"
          style={{ background: 'var(--s1)', borderTop: '1px solid var(--b)' }}>
          <div className="flex items-center justify-around px-2 py-2"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>
            {PRIMARY_NAV.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={to === '/'}
                className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-medium tap"
                style={({ isActive }) => ({ color: isActive ? `rgb(var(--accent-rgb-light))` : '#52525b' })}>
                {({ isActive }) => (
                  <>
                    <div className="relative">
                      <Icon size={20} />
                      {isActive && (
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                          style={{ background: `rgb(var(--accent-rgb))` }} />
                      )}
                    </div>
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
            {/* More button */}
            <button onClick={() => setShowMoreSheet(s => !s)}
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-medium tap"
              style={{ color: showMoreSheet ? `rgb(var(--accent-rgb-light))` : '#52525b' }}>
              <MoreHorizontal size={20} />
              <span>More</span>
            </button>
          </div>
        </nav>

        {/* More sheet */}
        {showMoreSheet && (
          <div className="md:hidden fixed inset-0 z-40" onClick={() => setShowMoreSheet(false)}>
            <div className="absolute bottom-16 left-0 right-0 rounded-t-2xl p-4 slide-up"
              style={{ background: 'var(--s1)', border: '1px solid var(--b)', borderBottom: 'none' }}
              onClick={e => e.stopPropagation()}>
              <div className="w-8 h-1 rounded-full mx-auto mb-4" style={{ background: 'var(--s3)' }} />
              <div className="grid grid-cols-4 gap-3">
                {MORE_NAV.map(({ to, icon: Icon, label }) => (
                  <NavLink key={to} to={to}
                    onClick={() => setShowMoreSheet(false)}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium tap"
                    style={({ isActive }) => ({
                      background: isActive ? 'rgb(var(--accent-rgb) / 0.1)' : 'var(--s2)',
                      color: isActive ? 'rgb(var(--accent-rgb-light))' : '#a1a1aa',
                    })}>
                    <Icon size={22} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}
