import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import type { User } from '../types';

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
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (!stored || !storedUser) {
      setLoading(false);
      return;
    }

    // Validate the stored token with the server on every app start.
    // If the server returns 401 (invalid/expired token, or session_gone after
    // a DB reset) we clear localStorage so the login screen appears.
    // On a network error (server cold-start, offline) we keep the cached user
    // so the app doesn't flash the login screen unnecessarily.
    api.get('/auth/me', { headers: { Authorization: `Bearer ${stored}` } })
      .then(({ data }) => {
        setToken(stored);
        setUser(data.user);
        // Keep cached user in sync with server
        localStorage.setItem('user', JSON.stringify(data.user));
      })
      .catch((err) => {
        if (!err.response) {
          // Network / cold-start — keep going with cached user
          try { setToken(stored); setUser(JSON.parse(storedUser)); } catch (_) {}
          return;
        }
        // 401 — token is bad or session is gone. Clear everything → login screen.
        try {
          const u = JSON.parse(storedUser);
          if (u?.username) localStorage.setItem('lastUsername', u.username);
        } catch (_) {}
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(username: string, password: string) {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('lastUsername', data.user.username);
    sessionStorage.removeItem('authMsg');
    setToken(data.token);
    setUser(data.user);
  }

  async function register(username: string, password: string) {
    const { data } = await api.post('/auth/register', { username, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('lastUsername', data.user.username);
    sessionStorage.removeItem('authMsg');
    setToken(data.token);
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
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
