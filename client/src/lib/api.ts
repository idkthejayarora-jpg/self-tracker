import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Attach token from localStorage to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401 — only clear the session when the token itself is bad (expired or invalid).
// We intentionally ignore 'session_gone' (user not in DB) and 'Unauthorized'
// from routes like change-password — those are recoverable without a full logout.
// Matching Kaamkaro AI: only a cryptographically bad token forces a re-login.
const TOKEN_FATAL_ERRORS = new Set(['token_expired', 'invalid_token']);

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      const errCode: string = err.response?.data?.error ?? '';
      const isFatalTokenError = TOKEN_FATAL_ERRORS.has(errCode);

      if (isFatalTokenError) {
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
    }
    return Promise.reject(err);
  }
);

export default api;
