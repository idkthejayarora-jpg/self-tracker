import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      // Don't auto-redirect for the startup validation call — AuthContext handles that itself
      const url: string = err.config?.url || '';
      if (url.includes('/auth/me')) return Promise.reject(err);

      // Preserve username so the login page can pre-fill it
      try {
        const stored = localStorage.getItem('user');
        if (stored) {
          const u = JSON.parse(stored);
          if (u?.username) localStorage.setItem('lastUsername', u.username);
        }
      } catch (_) {}

      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
