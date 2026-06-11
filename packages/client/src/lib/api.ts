import { isDesktop } from './desktop';

let API_BASE = import.meta.env.VITE_API_URL ?? '';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Call once before rendering the app — loads server URL from Electron store. */
export async function initApiBase(): Promise<string> {
  if (isDesktop() && window.ldplCmms) {
    API_BASE = await window.ldplCmms.getServerUrl();
  }
  return API_BASE;
}

export function getApiBase(): string {
  return API_BASE;
}

export async function setApiBase(url: string): Promise<void> {
  API_BASE = url.replace(/\/$/, '');
  if (isDesktop() && window.ldplCmms) {
    await window.ldplCmms.setServerUrl(API_BASE);
  }
}

function getStoredTokens() {
  const raw = localStorage.getItem('ldpl_cmms_auth');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { accessToken: string; refreshToken: string; expiresAt: number };
  } catch {
    return null;
  }
}

export function setStoredAuth(accessToken: string, refreshToken: string, expiresIn: number) {
  localStorage.setItem(
    'ldpl_cmms_auth',
    JSON.stringify({ accessToken, refreshToken, expiresAt: Date.now() + expiresIn }),
  );
}

export function clearStoredAuth() {
  localStorage.removeItem('ldpl_cmms_auth');
  localStorage.removeItem('ldpl_cmms_user');
}

async function refreshAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens?.refreshToken) return null;

  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });

  if (!res.ok) {
    clearStoredAuth();
    return null;
  }

  const data = await res.json();
  setStoredAuth(data.accessToken, data.refreshToken, data.expiresIn);
  return data.accessToken as string;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (!options.skipAuth) {
    const tokens = getStoredTokens();
    if (tokens?.accessToken) {
      headers.Authorization = `Bearer ${tokens.accessToken}`;
    }
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && !options.skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string }).error ?? 'Request failed',
      res.status,
      data,
    );
  }

  return data as T;
}

export { ApiError };
