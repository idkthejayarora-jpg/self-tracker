import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, BookOpen, Bell, BarChart2, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/journal', icon: BookOpen, label: 'Journal' },
  { to: '/reminders', icon: Bell, label: 'Reminders' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-gray-900 border-r border-gray-800 py-6 px-3">
        <div className="mb-8 px-3">
          <h1 className="text-lg font-bold text-brand-400">Self Tracker</h1>
          <p className="text-xs text-gray-500 mt-1">@{user?.username}</p>
        </div>
        <nav className="flex-1 space-y-1">
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
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors mt-auto"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
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
                `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs transition-colors ${
                  isActive ? 'text-brand-400' : 'text-gray-500'
                }`
              }
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
