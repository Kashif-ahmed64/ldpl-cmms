import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch, clearStoredAuth, setStoredAuth } from '@/lib/api';
import type { AuthResponse, User } from '@/types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('ldpl_cmms_user');
    return raw ? (JSON.parse(raw) as User) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: User }>('/api/auth/me');
      setUser(data.user);
      localStorage.setItem('ldpl_cmms_user', JSON.stringify(data.user));
    } catch {
      clearStoredAuth();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const tokens = localStorage.getItem('ldpl_cmms_auth');
    if (tokens) {
      refreshUser().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [refreshUser]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiFetch<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      skipAuth: true,
    });
    setStoredAuth(data.accessToken, data.refreshToken, data.expiresIn);
    setUser(data.user);
    localStorage.setItem('ldpl_cmms_user', JSON.stringify(data.user));
  }, []);

  const logout = useCallback(async () => {
    const raw = localStorage.getItem('ldpl_cmms_auth');
    const refreshToken = raw ? (JSON.parse(raw) as { refreshToken: string }).refreshToken : undefined;
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // ignore logout errors
    }
    clearStoredAuth();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, logout, refreshUser }),
    [user, isLoading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
