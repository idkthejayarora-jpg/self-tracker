import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Attach token from localStorage to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401 — clear the session and fire a DOM event.
// AuthContext listens for this event and sets user→null, which lets
// React's ProtectedRoute naturally navigate to /login.
// We DO NOT do window.location.href here — that causes a hard reload
// which re-mounts the app and creates redirect loops.
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      // Save username so the login form can pre-fill it
      try {
        const stored = localStorage.getItem('user');
        if (stored) {
          const u = JSON.parse(stored);
          if (u?.username) localStorage.setItem('lastUsername', u.username);
        }
      } catch (_) {}

      localStorage.removeItem('token');
      localStorage.removeItem('user');

      // Signal React — AuthContext clears user state → ProtectedRoute redirects
      window.dispatchEvent(new Event('auth:logout'));
    }
    return Promise.reject(err);
  }
);

export default api;
