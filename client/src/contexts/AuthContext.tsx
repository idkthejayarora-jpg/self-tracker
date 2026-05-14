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
    // Validate token against server — catches DB-wiped-on-redeploy silently
    api.get('/auth/me', { headers: { Authorization: `Bearer ${stored}` } })
      .then(({ data }) => {
        setToken(stored);
        setUser(data.user);
      })
      .catch((err) => {
        const errCode = err.response?.data?.error;
        // Preserve username so login page can pre-fill it
        try {
          const u = JSON.parse(storedUser);
          if (u?.username) localStorage.setItem('lastUsername', u.username);
        } catch (_) {}
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Tag the error so Login page can show an appropriate message
        if (errCode === 'session_gone') {
          sessionStorage.setItem('authMsg', 'server_restart');
        }
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
