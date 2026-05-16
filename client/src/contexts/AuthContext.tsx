import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import type { User } from '../types';

// Use plain axios (not the api instance) for the startup check so we don't
// trigger our own auth:logout interceptor during the initial validation.
const rawAxios = axios.create({ baseURL: '/api' });

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Clear session helper ──────────────────────────────────────────────────
  const clearSession = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  // ── Startup: validate stored token once ──────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('token');
    if (!stored) {
      setLoading(false);
      return;
    }

    rawAxios
      .get('/auth/me', { headers: { Authorization: `Bearer ${stored}` } })
      .then(({ data }) => {
        // Token is valid — restore session
        setToken(stored);
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      })
      .catch(() => {
        // Token is invalid OR server error — always clear and go to login.
        // We don't try to "keep going" with a cached user because that leads
        // to a state where the app looks logged in but every API call fails.
        clearSession();
      })
      .finally(() => setLoading(false));
  }, [clearSession]);

  // ── Listen for 401s from any API call ────────────────────────────────────
  // The axios interceptor in lib/api.ts dispatches 'auth:logout' on any 401.
  // We handle it here so React state stays in sync without a hard page reload.
  useEffect(() => {
    const handler = () => clearSession();
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [clearSession]);

  // ── Login ─────────────────────────────────────────────────────────────────
  async function login(username: string, password: string) {
    const { data } = await rawAxios.post('/auth/login', { username, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('lastUsername', data.user.username);
    setToken(data.token);
    setUser(data.user);
  }

  // ── Register ──────────────────────────────────────────────────────────────
  async function register(username: string, password: string) {
    const { data } = await rawAxios.post('/auth/register', { username, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('lastUsername', data.user.username);
    setToken(data.token);
    setUser(data.user);
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  function logout() {
    clearSession();
  }

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
