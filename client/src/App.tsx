import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { useReminders } from './hooks/useReminders';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Journal from './pages/Journal';
import Workout from './pages/Workout';
import LifeProgress from './pages/LifeProgress';
import Reminders from './pages/Reminders';
import Analytics from './pages/Analytics';
import Diet from './pages/Diet';
import SocialDetox from './pages/SocialDetox';
import Habits from './pages/Habits';
import BodyStats from './pages/BodyStats';
import Sleep from './pages/Sleep';
import Finance from './pages/Finance';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();
  useReminders(!!user);

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="journal" element={<Journal />} />
        <Route path="workout" element={<Workout />} />
        <Route path="life" element={<LifeProgress />} />
        <Route path="reminders" element={<Reminders />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="diet" element={<Diet />} />
        <Route path="detox" element={<SocialDetox />} />
        <Route path="habits" element={<Habits />} />
        <Route path="body" element={<BodyStats />} />
        <Route path="sleep" element={<Sleep />} />
        <Route path="finance" element={<Finance />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
