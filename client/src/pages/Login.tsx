import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') await login(username, password);
      else await register(username, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-2">
          <img src="/logo.svg" alt="Self Tracker" className="w-12 h-12 rounded-2xl" />
          <h1 className="text-3xl font-bold text-white">Self Tracker</h1>
        </div>
        <p className="text-gray-400 mb-8">Track tasks, journal, streaks & more.</p>

        <form onSubmit={submit} className="bg-gray-900 rounded-2xl p-6 space-y-4 border border-gray-800">
          <h2 className="text-lg font-semibold text-white">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h2>

          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors"
          >
            {loading ? '...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <button
            type="button"
            onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}
            className="w-full text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            {mode === 'login' ? 'No account? Register' : 'Have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
