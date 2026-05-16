import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import type { User } from '../types';

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

// ── Decode a JWT payload without verifying the signature ──────────────────────
// We only use this to read the expiry — the server still verifies the signature
// on every API call. This lets us avoid a startup network roundtrip.
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  // Add 30s buffer to avoid edge-case race conditions
  return payload.exp * 1000 < Date.now() - 30_000;
}

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

  // ── Startup: decode stored token client-side ──────────────────────────────
  // Kaamkaro AI approach: trust the JWT without a server call.
  // The server verifies the signature on every API call anyway.
  // This means Railway redeploys / brief server errors do NOT log you out.
  useEffect(() => {
    const stored = localStorage.getItem('token');
    if (!stored) {
      setLoading(false);
      return;
    }

    // If the token is expired, clear it immediately
    if (isTokenExpired(stored)) {
      clearSession();
      setLoading(false);
      return;
    }

    // Token looks valid — restore session from localStorage
    const storedUser = localStorage.getItem('user');
    try {
      const parsed: User = storedUser ? JSON.parse(storedUser) : null;
      if (parsed) {
        setToken(stored);
        setUser(parsed);
      } else {
        // User object missing but token present — try to get user from payload
        const payload = decodeJwtPayload(stored);
        if (payload && payload.id && payload.username) {
          const u: User = { id: payload.id as number, username: payload.username as string };
          setToken(stored);
          setUser(u);
          localStorage.setItem('user', JSON.stringify(u));
        } else {
          clearSession();
        }
      }
    } catch {
      clearSession();
    }

    setLoading(false);
  }, [clearSession]);

  // ── Listen for 401s from any API call ────────────────────────────────────
  // The axios interceptor in lib/api.ts dispatches 'auth:logout' on token errors.
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
