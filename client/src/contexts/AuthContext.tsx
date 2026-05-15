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

    // Validate token on startup. The server auto-restores the user row if the DB
    // was wiped (as long as the JWT signature is still valid), so this call should
    // almost always succeed for a legitimately logged-in user.
    api.get('/auth/me', { headers: { Authorization: `Bearer ${stored}` } })
      .then(({ data }) => {
        setToken(stored);
        setUser(data.user);
        // Keep stored user in sync with server response
        localStorage.setItem('user', JSON.stringify(data.user));
      })
      .catch((err) => {
        if (!err.response) {
          // Network error / server cold-start — trust localStorage and keep going
          try { setToken(stored); setUser(JSON.parse(storedUser)); } catch (_) {}
          return;
        }
        // Genuine 401 (expired / invalid token) — clear and go to login
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
