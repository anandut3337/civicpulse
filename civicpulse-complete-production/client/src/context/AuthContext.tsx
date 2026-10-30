import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, apiErrorMessage, clearToken, getToken, setToken } from '../lib/api';
import type { ApiSuccess, User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { fullName: string; email: string; phone: string; password: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load, if we have a token, confirm it's still valid and hydrate the user.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<ApiSuccess<User>>('/auth/me')
      .then((res) => setUser(res.data.data))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await api.post<ApiSuccess<{ user: User; token: string }>>('/auth/login', { email, password });
      setToken(res.data.data.token);
      setUser(res.data.data.user);
    } catch (err) {
      throw new Error(apiErrorMessage(err, 'Could not sign in'));
    }
  };

  const register = async (input: { fullName: string; email: string; phone: string; password: string }) => {
    try {
      const res = await api.post<ApiSuccess<{ user: User; token: string }>>('/auth/register', input);
      setToken(res.data.data.token);
      setUser(res.data.data.user);
    } catch (err) {
      throw new Error(apiErrorMessage(err, 'Could not create your account'));
    }
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
