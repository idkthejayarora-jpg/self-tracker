import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

type Mode = 'login' | 'register' | 'reset';

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState(() => localStorage.getItem('lastUsername') || '');
  const [password, setPassword] = useState('');
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

  // Clear any stuck localStorage state (stale token, cached user, etc.)
  function clearStuckSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.clear();
    setError('');
    setSuccess('Session cleared — try logging in again.');
  }

  async function handleLoginRegister(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!username.trim()) { setError('Username is required'); return; }
    if (!password)        { setError('Password is required'); return; }
    setLoading(true);
    try {
      if (mode === 'login') await login(username.trim(), password);
      else                  await register(username.trim(), password);
      navigate('/');
    } catch (err: any) {
      // Show the server's error message directly — don't auto-switch modes or
      // second-guess the server. Wrong password should say wrong password, not
      // silently flip to register mode.
      const msg: string = err.response?.data?.error || '';
      if (!err.response) {
        setError('Cannot reach the server. Check your connection and try again.');
      } else if (err.response.status === 409) {
        setError('That username is already taken — try a different one.');
      } else if (err.response.status === 401) {
        setError('Incorrect username or password.');
      } else {
        setError(msg || 'Something went wrong. Please try again.');
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
        username: username.trim(),
        new_password: newPw,
      });
      setSuccess('Password reset! Signing you in…');
      setResetCode(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => switchMode('login'), 1800);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Reset failed. Check your recovery code and username.');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full rounded-xl px-3 py-2.5 text-sm border focus:outline-none';

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--s0)' }}>

      {/* ── PORTAL BACKGROUND ── */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        {/* Grid */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(217,119,87,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(217,119,87,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        {/* Portal scan line */}
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, #d9775760, transparent)',
          boxShadow: '0 0 12px #d97757',
          animation: 'portal-scan 4s linear infinite',
        }} />
        {/* Corner decorations */}
        <div style={{ position: 'absolute', top: 20, left: 20, width: 40, height: 40, borderTop: '2px solid #d9775740', borderLeft: '2px solid #d9775740' }} />
        <div style={{ position: 'absolute', top: 20, right: 20, width: 40, height: 40, borderTop: '2px solid #d9775740', borderRight: '2px solid #d9775740' }} />
        <div style={{ position: 'absolute', bottom: 20, left: 20, width: 40, height: 40, borderBottom: '2px solid #d9775740', borderLeft: '2px solid #d9775740' }} />
        <div style={{ position: 'absolute', bottom: 20, right: 20, width: 40, height: 40, borderBottom: '2px solid #d9775740', borderRight: '2px solid #d9775740' }} />
        {/* Radial glow center */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(217,119,87,0.06) 0%, transparent 70%)',
        }} />
      </div>

      <div className="w-full max-w-sm space-y-5" style={{ position: 'relative', zIndex: 1 }}>

        {/* Logo + heading */}
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full overflow-hidden shadow-lg"
            style={{ width: 80, height: 80, background: '#e3dfda', boxShadow: '0 0 0 3px rgba(217,119,87,0.2), 0 8px 32px rgba(0,0,0,0.3)' }}>
            <img src={localStorage.getItem('custom_logo') ?? '/logo.png'} alt="logo"
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center top' }} />
          </div>
          <div className="text-center">
            <p className="text-[9px] font-black tracking-[0.35em] mb-1" style={{ color: '#d97757', opacity: 0.6 }}>ACCESS PORTAL</p>
            <h1 className="text-2xl font-bold text-head tracking-tight">Self Tracker</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--t-faint)' }}>Your personal command room</p>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-xl p-1 gap-1" style={{ background: 'var(--s2)', border: '1px solid var(--b)' }}>
          {(['login', 'register', 'reset'] as Mode[]).map(m => (
            <button key={m} type="button" onClick={() => switchMode(m)}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize"
              style={{
                background: mode === m ? 'var(--s3)' : 'transparent',
                color: mode === m ? 'rgb(var(--accent-rgb-light))' : 'var(--t-faint)',
              }}>
              {m === 'reset' ? 'Forgot password' : m === 'login' ? 'Sign in' : 'Register'}
            </button>
          ))}
        </div>

        {/* Form card */}
        <div className="card px-5 py-5" style={{ position: 'relative', zIndex: 1, border: '1px solid #d9775730', boxShadow: '0 0 40px #d9775715' }}>

          {/* ── Sign in / Register ── */}
          {(mode === 'login' || mode === 'register') && (
            <form onSubmit={handleLoginRegister} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold" style={{ color: 'var(--t-faint)' }}>USERNAME</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="your_username" required autoFocus autoCapitalize="none" autoCorrect="off"
                  className={inputCls} style={{ marginTop: 4 }} />
              </div>

              <div>
                <label className="text-[11px] font-semibold" style={{ color: 'var(--t-faint)' }}>PASSWORD</label>
                <div className="relative mt-1">
                  <input type={showPw ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required
                    className={inputCls} style={{ paddingRight: 40 }} />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 tap"
                    style={{ color: 'var(--t-faint)' }}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {mode === 'register' && (
                  <p className="text-[10px] mt-1" style={{ color: 'var(--t-faint)' }}>Minimum 4 characters</p>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                  style={{ background: 'rgb(239 68 68 / 0.08)', color: '#e07b62', border: '1px solid rgb(239 68 68 / 0.2)' }}>
                  <AlertCircle size={13} className="shrink-0" />{error}
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                  style={{ background: 'rgb(34 197 94 / 0.08)', color: '#8fbb7e', border: '1px solid rgb(34 197 94 / 0.2)' }}>
                  <CheckCircle2 size={13} className="shrink-0" />{success}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 tap"
                style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
                {loading ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Sign in' : 'Create account')}
              </button>

              {mode === 'login' && (
                <p className="text-center text-xs" style={{ color: 'var(--t-faint)' }}>
                  No account?{' '}
                  <button type="button" onClick={() => switchMode('register')}
                    className="underline tap" style={{ color: 'rgb(var(--accent-rgb-light))' }}>
                    Register here
                  </button>
                  {' · '}
                  <button type="button" onClick={() => switchMode('reset')}
                    className="underline tap" style={{ color: 'rgb(var(--accent-rgb-light))' }}>
                    Forgot password
                  </button>
                </p>
              )}
            </form>
          )}

          {/* ── Reset password ── */}
          {mode === 'reset' && (
            <form onSubmit={handleReset} className="space-y-3">
              <p className="text-xs mb-1" style={{ color: 'var(--t-faint)' }}>
                Enter your username, the <code className="text-[11px]" style={{ color: 'rgb(var(--accent-rgb-light))' }}>RESET_SECRET</code> from
                your server environment, and a new password.
              </p>

              <div>
                <label className="text-[11px] font-semibold" style={{ color: 'var(--t-faint)' }}>USERNAME</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="your_username" required autoCapitalize="none"
                  className={inputCls} style={{ marginTop: 4 }} />
              </div>

              <div>
                <label className="text-[11px] font-semibold" style={{ color: 'var(--t-faint)' }}>RECOVERY CODE</label>
                <input type="password" value={resetCode} onChange={e => setResetCode(e.target.value)}
                  placeholder="Server RESET_SECRET value" required
                  className={inputCls} style={{ marginTop: 4 }} />
              </div>

              <div>
                <label className="text-[11px] font-semibold" style={{ color: 'var(--t-faint)' }}>NEW PASSWORD</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                  placeholder="••••••••" required minLength={4}
                  className={inputCls} style={{ marginTop: 4 }} />
              </div>

              <div>
                <label className="text-[11px] font-semibold" style={{ color: 'var(--t-faint)' }}>CONFIRM PASSWORD</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  placeholder="••••••••" required
                  className={inputCls} style={{ marginTop: 4 }} />
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                  style={{ background: 'rgb(239 68 68 / 0.08)', color: '#e07b62', border: '1px solid rgb(239 68 68 / 0.2)' }}>
                  <AlertCircle size={13} className="shrink-0" />{error}
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                  style={{ background: 'rgb(34 197 94 / 0.08)', color: '#8fbb7e', border: '1px solid rgb(34 197 94 / 0.2)' }}>
                  <CheckCircle2 size={13} className="shrink-0" />{success}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 tap"
                style={{ background: `rgb(var(--accent-rgb))`, color: '#fff' }}>
                {loading ? 'Resetting…' : 'Reset password'}
              </button>

              <p className="text-center text-xs" style={{ color: 'var(--t-faint)' }}>
                Remember it?{' '}
                <button type="button" onClick={() => switchMode('login')}
                  className="underline tap" style={{ color: 'rgb(var(--accent-rgb-light))' }}>
                  Sign in
                </button>
              </p>
            </form>
          )}
        </div>

        {/* Stuck? Clear session escape hatch */}
        <div className="text-center">
          <button type="button" onClick={clearStuckSession}
            className="inline-flex items-center gap-1.5 text-[11px] tap"
            style={{ color: 'var(--t-faint)' }}>
            <RefreshCw size={11} /> Clear stuck session
          </button>
        </div>

      </div>
    </div>
  );
}
