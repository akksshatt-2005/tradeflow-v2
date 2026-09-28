/**
 * Trade Flow v2 - Resilient API Client
 * 
 * Complies with:
 * - Rule A4: Single hop, direct VITE_API_URL
 * - Rule B2 & C3: 15m Access JWT with ONE shared in-flight refresh promise on 401 retry
 * - Rule C1: Flatten validation arrays into readable error messages
 * - Rule C2: Silently ignore AbortError from cancelled requests
 * - Rule F1: Pre-warm GET /health
 * - Rule F2: 90-second Render wake-up handling with exponential backoff
 * - Rule F3: Client-side Idempotency Key injection
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : 'https://tradeflow-v2-96zx.onrender.com');

// Token state in memory
let inMemoryAccessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

// Server state subscriber
export interface ServerState {
  isWakingUp: boolean;
  isOnline: boolean;
  elapsedSeconds: number;
  maxRetrySeconds: number;
  error: string | null;
}

let serverState: ServerState = {
  isWakingUp: false,
  isOnline: true,
  elapsedSeconds: 0,
  maxRetrySeconds: 90,
  error: null
};

type StateListener = (state: ServerState) => void;
const listeners: StateListener[] = [];

export function subscribeServerState(listener: StateListener): () => void {
  listeners.push(listener);
  listener(serverState);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx > -1) listeners.splice(idx, 1);
  };
}

function updateServerState(updates: Partial<ServerState>) {
  serverState = { ...serverState, ...updates };
  listeners.forEach(l => l(serverState));
}

export function setAccessToken(token: string | null) {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem('tradeflow_refresh_token');
}

export function setStoredRefreshToken(token: string | null) {
  if (token) {
    localStorage.setItem('tradeflow_refresh_token', token);
  } else {
    localStorage.removeItem('tradeflow_refresh_token');
  }
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'idem-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();
}

/**
 * Rule F1: Pre-warm server on load
 */
export async function prewarmServer(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      updateServerState({ isOnline: true, isWakingUp: false, error: null });
      return true;
    }
  } catch (_) {
    updateServerState({ isOnline: false, isWakingUp: true });
  }
  return false;
}

/**
 * Rule C1: Flatten validation error arrays or messages
 */
function extractErrorMessage(data: any, fallback: string): string {
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (data.error) {
    if (Array.isArray(data.error)) {
      return data.error.map((e: any) => typeof e === 'string' ? e : e.message || JSON.stringify(e)).join(', ');
    }
    if (typeof data.error === 'string') return data.error;
  }
  if (data.message) {
    if (Array.isArray(data.message)) {
      return data.message.join(', ');
    }
    return data.message;
  }
  return fallback;
}

/**
 * Rule B2 & C3: Shared in-flight token refresh promise
 */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    return null;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (!response.ok) {
        setAccessToken(null);
        setStoredRefreshToken(null);
        return null;
      }

      const data = await response.json();
      setAccessToken(data.accessToken);
      setStoredRefreshToken(data.refreshToken);
      return data.accessToken;
    } catch (_) {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export interface RequestOptions extends RequestInit {
  companyId?: string;
  isRetry?: boolean;
  idempotencyKey?: string;
}

/**
 * Resilient API Request Handler (Rules A4, B2, C1, C2, C3, F2, F3)
 */
export async function apiRequest<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const fullUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const method = (options.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach access token
  if (inMemoryAccessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  }

  // Attach active company header (Phase 0 Task 4)
  if (options.companyId && !headers.has('x-company-id')) {
    headers.set('x-company-id', options.companyId);
  }

  // Inject ONE stable Idempotency-Key per action and reuse across all retries (Rule F3)
  if (isMutation) {
    if (!options.idempotencyKey) {
      options.idempotencyKey = (headers.get('Idempotency-Key') || headers.get('x-idempotency-key')) || generateIdempotencyKey();
    }
    headers.set('Idempotency-Key', options.idempotencyKey);
  }

  const startTime = Date.now();
  const maxRetryMs = 90 * 1000; // 90 seconds (Rule F2)
  let delay = 2000;

  while (Date.now() - startTime < maxRetryMs) {
    try {
      const res = await fetch(fullUrl, {
        ...options,
        headers
      });

      // If 401 Unauthorized: Attempt token refresh once (Rule C3)
      if (res.status === 401 && !options.isRetry && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/signup')) {
        const newAccessToken = await refreshAccessToken();
        if (newAccessToken) {
          headers.set('Authorization', `Bearer ${newAccessToken}`);
          return apiRequest<T>(endpoint, { ...options, isRetry: true, headers });
        } else {
          // Token refresh failed -> trigger logout
          setAccessToken(null);
          setStoredRefreshToken(null);
          window.dispatchEvent(new CustomEvent('tradeflow:unauthorized'));
          throw new Error('Session expired. Please log in again.');
        }
      }

      // If successful or client error (4xx)
      if (res.status < 500) {
        if (serverState.isWakingUp) {
          updateServerState({ isWakingUp: false, isOnline: true, elapsedSeconds: 0, error: null });
        }

        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await res.json() : await res.text();

        if (!res.ok) {
          const errorMsg = extractErrorMessage(data, `HTTP Error ${res.status}`);
          throw new Error(errorMsg);
        }

        return data as T;
      }

      // If 502/503/504 Render gateway booting
      console.warn(`[API Client] Server returned HTTP ${res.status}. Waiting for boot...`);
    } catch (err: any) {
      // Rule C2: Ignore AbortError from cancelled requests
      if (err.name === 'AbortError') {
        throw err;
      }

      if (err.message && (err.message.includes('Session expired') || !err.message.includes('fetch'))) {
        throw err;
      }

      // Network / Cold start error
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      if (!serverState.isWakingUp) {
        updateServerState({
          isWakingUp: true,
          isOnline: false,
          elapsedSeconds: elapsedSec,
          error: null
        });
      } else {
        updateServerState({ elapsedSeconds: elapsedSec });
      }
    }

    const remaining = maxRetryMs - (Date.now() - startTime);
    if (remaining <= 0) break;

    const wait = Math.min(delay, remaining);
    await new Promise(r => setTimeout(r, wait));
    delay = Math.min(delay * 1.5, 6000);
  }

  // 90s timeout (Rule F2)
  updateServerState({
    isWakingUp: false,
    isOnline: false,
    elapsedSeconds: 90,
    error: 'Server wake-up timed out after 90 seconds. Please click Retry.'
  });

  throw new Error('The server is taking longer than expected to wake up. Please click Retry.');
}

export const api = {
  get: <T = any>(url: string, opts: RequestOptions = {}) => apiRequest<T>(url, { ...opts, method: 'GET' }),
  post: <T = any>(url: string, body: any, opts: RequestOptions = {}) => apiRequest<T>(url, { ...opts, method: 'POST', body: JSON.stringify(body) }),
  put: <T = any>(url: string, body: any, opts: RequestOptions = {}) => apiRequest<T>(url, { ...opts, method: 'PUT', body: JSON.stringify(body) }),
  delete: <T = any>(url: string, opts: RequestOptions = {}) => apiRequest<T>(url, { ...opts, method: 'DELETE' })
};

export default api;
