import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard, CheckSquare, BookOpen, Bell, BarChart2,
  Dumbbell, Sparkles, LogOut, Sun, Moon, Palette, X, Salad, KeyRound,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, ACCENT_PRESETS } from '../contexts/ThemeContext';
import api from '../lib/api';

const NAV = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tasks',     icon: CheckSquare,     label: 'Tasks'     },
  { to: '/journal',   icon: BookOpen,        label: 'Journal'   },
  { to: '/workout',   icon: Dumbbell,        label: 'Workout'   },
  { to: '/diet',      icon: Salad,           label: 'Diet'      },
  { to: '/life',      icon: Sparkles,        label: 'Life'      },
  { to: '/reminders', icon: Bell,            label: 'Reminders' },
  { to: '/analytics', icon: BarChart2,       label: 'Analytics' },
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

  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* ── Sidebar ── */}
      <aside className="hidden md:flex flex-col w-56 border-r py-5 px-3"
        style={{ backgroundColor: 'var(--s1)', borderColor: 'var(--border)' }}>

        {/* Logo */}
        <div className="mb-6 px-2 flex items-center gap-2.5">
          <div className="relative shrink-0">
            <img src="/logo.svg" alt="Self Tracker" className="w-9 h-9 rounded-xl" />
            <div className="absolute inset-0 rounded-xl opacity-30 blur-md -z-10"
              style={{ background: `rgb(var(--accent-rgb))` }} />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight tracking-tight">Self Tracker</h1>
            <p className="text-[11px] text-slate-500">@{user?.username}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => isActive
                ? 'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all'
                : 'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors'
              }
              style={({ isActive }) => isActive ? {
                background: `linear-gradient(90deg, rgb(var(--accent-rgb) / 0.25), rgb(var(--accent-rgb) / 0.08))`,
                borderLeft: `2px solid rgb(var(--accent-rgb))`,
                paddingLeft: '10px',
              } : {}}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom controls */}
        <div className="mt-auto pt-3 space-y-0.5" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={toggleMode}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
            style={{ '--hover-bg': 'var(--s2)' } as any}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            {isLight ? <Moon size={15} /> : <Sun size={15} />}
            {isLight ? 'Dark mode' : 'Light mode'}
          </button>

          <button onClick={() => setShowTheme(s => !s)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <Palette size={15} />
            <span className="flex-1 text-left">Theme</span>
            <span className="w-3 h-3 rounded-full shrink-0 ring-1 ring-white/20" style={{ backgroundColor: accent.main }} />
          </button>

          {showTheme && (
            <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--s2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Accent</span>
                <button onClick={() => setShowTheme(false)} className="text-slate-500 hover:text-slate-300">
                  <X size={12} />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {ACCENT_PRESETS.map(p => (
                  <button key={p.id} title={p.label}
                    onClick={() => { setAccent(p); setShowTheme(false); }}
                    className={`w-5 h-5 rounded-full transition-all hover:scale-110 ${accent.id === p.id ? 'scale-125 ring-2 ring-white/60' : ''}`}
                    style={{ backgroundColor: p.main }} />
                ))}
              </div>
            </div>
          )}

          <button onClick={() => setShowChangePw(true)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <KeyRound size={15} />
            Password
          </button>

          <button onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-red-400 transition-colors"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3"
          style={{ backgroundColor: 'var(--s1)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="" className="w-7 h-7 rounded-lg" />
            <span className="text-sm font-bold text-white">Self Tracker</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowChangePw(true)} className="p-1.5 text-slate-400 hover:text-slate-200">
              <KeyRound size={15} />
            </button>
            <button onClick={toggleMode} className="p-1.5 text-slate-400 hover:text-slate-200">
              {isLight ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <button onClick={() => setShowTheme(s => !s)} className="p-1.5 text-slate-400 hover:text-slate-200">
              <Palette size={15} />
            </button>
          </div>
        </header>

        {showTheme && (
          <div className="md:hidden bg-gray-900 border-b border-gray-800 px-4 py-3">
            <div className="flex flex-wrap gap-2.5 justify-center">
              {ACCENT_PRESETS.map(p => (
                <button
                  key={p.id}
                  title={p.label}
                  onClick={() => { setAccent(p); setShowTheme(false); }}
                  className={`w-6 h-6 rounded-full transition-all ${accent.id === p.id ? 'ring-2 ring-white scale-125' : ''}`}
                  style={{ backgroundColor: p.main }}
                />
              ))}
            </div>
          </div>
        )}

        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 max-w-5xl w-full mx-auto">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 flex justify-around py-2 px-1 z-50"
          style={{ backgroundColor: 'var(--s1)', borderTop: '1px solid var(--border)', paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl text-[10px] transition-all min-w-0"
              style={({ isActive }) => isActive
                ? { color: `rgb(var(--accent-rgb-light))` }
                : { color: '#475569' }
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`p-1 rounded-lg transition-all ${isActive ? 'bg-white/5' : ''}`}>
                    <Icon size={18} />
                  </div>
                  <span className="truncate">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}
