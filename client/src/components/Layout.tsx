import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard, CheckSquare, BookOpen, Bell, BarChart2,
  Dumbbell, Sparkles, LogOut, Sun, Moon, Palette, X, Salad,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, ACCENT_PRESETS } from '../contexts/ThemeContext';

const NAV = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tasks',    icon: CheckSquare,     label: 'Tasks'     },
  { to: '/journal',  icon: BookOpen,        label: 'Journal'   },
  { to: '/workout',  icon: Dumbbell,        label: 'Workout'   },
  { to: '/diet',     icon: Salad,           label: 'Diet'      },
  { to: '/life',     icon: Sparkles,        label: 'Life'      },
  { to: '/reminders',icon: Bell,            label: 'Reminders' },
  { to: '/analytics',icon: BarChart2,       label: 'Analytics' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { toggleMode, isLight, accent, setAccent } = useTheme();
  const [showTheme, setShowTheme] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-gray-900 border-r border-gray-800 py-5 px-3">
        {/* Logo + app name */}
        <div className="mb-6 px-2 flex items-center gap-2.5">
          <img src="/logo.svg" alt="Self Tracker" className="w-9 h-9 rounded-xl shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Self Tracker</h1>
            <p className="text-xs text-gray-500">@{user?.username}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Theme controls */}
        <div className="mt-auto space-y-1 pt-3 border-t border-gray-800">
          {/* Dark/light toggle */}
          <button
            onClick={toggleMode}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            {isLight ? <Moon size={16} /> : <Sun size={16} />}
            {isLight ? 'Dark mode' : 'Light mode'}
          </button>

          {/* Accent picker toggle */}
          <button
            onClick={() => setShowTheme(s => !s)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            <Palette size={16} />
            <span className="flex-1 text-left">Accent color</span>
            <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: accent.main }} />
          </button>

          {showTheme && (
            <div className="bg-gray-800 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-300 font-medium">Pick accent</span>
                <button onClick={() => setShowTheme(false)} className="text-gray-500 hover:text-gray-300">
                  <X size={13} />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {ACCENT_PRESETS.map(p => (
                  <button
                    key={p.id}
                    title={p.label}
                    onClick={() => { setAccent(p); setShowTheme(false); }}
                    className={`w-5 h-5 rounded-full transition-all ${accent.id === p.id ? 'ring-2 ring-white scale-125' : 'hover:scale-110'}`}
                    style={{ backgroundColor: p.main }}
                  />
                ))}
              </div>
            </div>
          )}

          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="" className="w-7 h-7 rounded-lg" />
            <span className="text-sm font-bold text-white">Self Tracker</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleMode} className="p-1.5 text-gray-400 hover:text-gray-200">
              {isLight ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button onClick={() => setShowTheme(s => !s)} className="p-1.5 text-gray-400 hover:text-gray-200">
              <Palette size={16} />
            </button>
          </div>
        </header>

        {/* Mobile accent picker dropdown */}
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

        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 max-w-5xl w-full mx-auto">
          <Outlet />
        </main>

        {/* Bottom nav (mobile) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 flex justify-around py-2 z-50">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs transition-colors ${
                  isActive ? 'text-brand-400' : 'text-gray-500'
                }`
              }
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
