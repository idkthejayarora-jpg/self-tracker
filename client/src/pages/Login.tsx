import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

type Mode = 'login' | 'register' | 'reset';

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState(() => localStorage.getItem('lastUsername') || '');
  const [password, setPassword] = useState('');
  const [serverRestart, setServerRestart] = useState(() => sessionStorage.getItem('authMsg') === 'server_restart');
  const [showPw, setShowPw] = useState(false);

  // Reset-specific
  const [resetCode, setResetCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function switchMode(m: Mode) {
    setMode(m);
    setError('');
    setSuccess('');
  }

  async function handleLoginRegister(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') await login(username, password);
      else await register(username, password);
      navigate('/');
    } catch (err: any) {
      const msg: string = err.response?.data?.error || '';
      // If login fails because user doesn't exist (DB wiped), guide them to register
      if (mode === 'login' && (msg === 'Invalid credentials' || err.response?.status === 401)) {
        setError('');
        setServerRestart(true);
        switchMode('register');
      } else {
        setError(msg || 'Something went wrong. Check your connection.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPw !== confirmPw) { setError("New passwords don't match"); return; }
    if (newPw.length < 4)    { setError('Password must be at least 4 characters'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset', {
        secret: resetCode,
        username,
        new_password: newPw,
      });
      setSuccess('Password reset! You can now sign in.');
      setResetCode(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => switchMode('login'), 1800);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Reset failed. Check your recovery code.');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full rounded-xl px-3 py-2.5 text-sm border focus:outline-none';

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--s0)' }}>
      <div className="w-full max-w-sm space-y-5">

        {/* Logo + heading */}
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-2xl overflow-hidden shadow-lg"
            style={{ width: 80, height: 80, background: '#e3dfda', boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }}>
            <img src="/logo.png" alt="logo"
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center top' }} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-head tracking-tight">Self Tracker</h1>
            <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>Track tasks, journal, streaks & more</p>
          </div>
        </div>

        {/* Server restart banner */}
        {serverRestart && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ background: 'rgb(245 158 11 / 0.10)', color: '#fbbf24', border: '1px solid rgb(245 158 11 / 0.25)' }}>
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>
              <strong>Server was restarted</strong> — your account data was cleared.
              Just re-register with your usual username &amp; password to continue.
            </span>
          </div>
        )}

        {/* Mode tabs */}
        <div className="flex rounded-xl p-1 gap-1" style={{ background: 'var(--s2)', border: '1px solid var(--b)' }}>
          {(['login', 'register', 'reset'] as Mode[]).map(m => (
            <button key={m} type="button" onClick={() => switchMode(m)}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize"
              style={{
                background: mode === m ? 'var(--s3)' : 'transparent',
                color: mode === m ? 'rgb(var(--accent-rgb-light))' : '#71717a',
              }}>
              {m === 'reset' ? 'Reset' : m === 'login' ? 'Sign in' : 'Register'}
            </button>
          ))}
        </div>

        {/* Form card */}
        <div className="card px-5 py-5">

          {/* ── Sign in / Register ── */}
          {(mode === 'login' || mode === 'register') && (
            <form onSubmit={handleLoginRegister} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold" style={{ color: '#71717a' }}>USERNAME</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="your_username" required autoFocus autoCapitalize="none"
                  className={inputCls} style={{ marginTop: 4 }} />
              </div>

              <div>
                <label className="text-[11px] font-semibold" style={{ color: '#71717a' }}>PASSWORD</label>
                <div className="relative mt-1">
                  <input type={showPw ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required
                    className={inputCls} style={{ paddingRight: 40 }} />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 tap"
                    style={{ color: '#52525b' }}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                  style={{ background: 'rgb(239 68 68 / 0.08)', color: '#f87171', border: '1px solid rgb(239 68 68 / 0.2)' }}>
                  <AlertCircle size={13} />{error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 tap"
                style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
                {loading ? '...' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>

              {mode === 'login' && (
                <p className="text-center text-xs" style={{ color: '#52525b' }}>
                  Forgot your password?{' '}
                  <button type="button" onClick={() => switchMode('reset')}
                    className="underline tap" style={{ color: 'rgb(var(--accent-rgb-light))' }}>
                    Reset it
                  </button>
                </p>
              )}
            </form>
          )}

          {/* ── Reset password ── */}
          {mode === 'reset' && (
            <form onSubmit={handleReset} className="space-y-3">
              <p className="text-xs mb-1" style={{ color: '#71717a' }}>
                Enter your username, the recovery code set in your server environment
                (<code className="text-[11px]" style={{ color: 'rgb(var(--accent-rgb-light))' }}>RESET_SECRET</code>),
                and your new password.
              </p>

              <div>
                <label className="text-[11px] font-semibold" style={{ color: '#71717a' }}>USERNAME</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="your_username" required autoCapitalize="none"
                  className={inputCls} style={{ marginTop: 4 }} />
              </div>

              <div>
                <label className="text-[11px] font-semibold" style={{ color: '#71717a' }}>RECOVERY CODE</label>
                <input type="password" value={resetCode} onChange={e => setResetCode(e.target.value)}
                  placeholder="Server RESET_SECRET value" required
                  className={inputCls} style={{ marginTop: 4 }} />
              </div>

              <div>
                <label className="text-[11px] font-semibold" style={{ color: '#71717a' }}>NEW PASSWORD</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                  placeholder="••••••••" required minLength={4}
                  className={inputCls} style={{ marginTop: 4 }} />
              </div>

              <div>
                <label className="text-[11px] font-semibold" style={{ color: '#71717a' }}>CONFIRM PASSWORD</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  placeholder="••••••••" required
                  className={inputCls} style={{ marginTop: 4 }} />
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                  style={{ background: 'rgb(239 68 68 / 0.08)', color: '#f87171', border: '1px solid rgb(239 68 68 / 0.2)' }}>
                  <AlertCircle size={13} />{error}
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                  style={{ background: 'rgb(34 197 94 / 0.08)', color: '#4ade80', border: '1px solid rgb(34 197 94 / 0.2)' }}>
                  <CheckCircle2 size={13} />{success}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 tap"
                style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
                {loading ? 'Resetting...' : 'Reset password'}
              </button>

              <p className="text-center text-xs" style={{ color: '#52525b' }}>
                Remember it?{' '}
                <button type="button" onClick={() => switchMode('login')}
                  className="underline tap" style={{ color: 'rgb(var(--accent-rgb-light))' }}>
                  Sign in
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
