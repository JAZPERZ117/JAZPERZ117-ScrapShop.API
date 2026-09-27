const TOKEN_KEY = 'scrapshop_token';
const USER_KEY = 'scrapshop_user';
const EXPIRES_KEY = 'scrapshop_auth_expires';
const REMEMBER_DAYS = 30;

// The bearer token for authenticated API calls (see src/pages/Users.jsx) — same storage
// getStoredAuth reads the user object from, just the token half of the pair.
export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function getStoredAuth() {
  // "จดจำการเข้าสู่ระบบ 30 วัน" (Settings) sets this expiry when the session is remembered —
  // once it's past, treat the stored session as gone instead of leaving it valid forever.
  const expiresAt = localStorage.getItem(EXPIRES_KEY);
  if (expiresAt && Date.now() > Number(expiresAt)) {
    clearAuth();
    return null;
  }
  const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function storeAuth({ token, user }, remember) {
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, token);
  storage.setItem(USER_KEY, JSON.stringify(user));
  if (remember) {
    localStorage.setItem(EXPIRES_KEY, String(Date.now() + REMEMBER_DAYS * 24 * 60 * 60 * 1000));
  } else {
    localStorage.removeItem(EXPIRES_KEY);
  }
}

// Every context calls fetch('/api/...') directly, so this one wrapper is the single place a
// server-side session expiry (401) gets noticed. Without it, an expired token left the UI looking
// signed in while every refresh and save quietly failed — no data syncing, no error shown.
// Only acts when a token was actually sent: the login page's own pre-auth 401s are expected.
export function installSessionExpiryRedirect() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await originalFetch(input, init);
    const url = typeof input === 'string' ? input : input.url;
    const isAuthEndpoint = url.startsWith('/api/login') || url.startsWith('/api/pin-login');
    if (res.status === 401 && url.startsWith('/api/') && !isAuthEndpoint && getToken()) {
      clearAuth();
      window.location.assign('/login?expired=1');
    }
    return res;
  };
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}
