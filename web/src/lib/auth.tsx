import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, errorText } from './api';

export interface Me {
  id: string;
  role: 'professional' | 'patient';
  name: string;
  email: string;
  timezone?: string;
  response_hours?: string;
  professional_name?: string;
  patient_id?: string;
  first_name?: string;
  allow_self_measurements?: boolean;
  allow_body_photos?: boolean;
  habits?: { key: string; name: string; unit: string; target: number | null }[];
  [k: string]: any;
}

interface AuthState {
  me: Me | null;
  loading: boolean;
  error: string | null;
  appName: string;
  emailConfigured: boolean;
  signupEnabled: boolean;
  demoMode: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as never);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ me: null as Me | null, loading: true, error: null as string | null, appName: 'NutriAR', emailConfigured: false, signupEnabled: false, demoMode: false });
  const refresh = useCallback(async () => {
    try {
      const r = await api.get('/api/auth/me');
      setState({ me: r.user, loading: false, error: null, appName: r.appName, emailConfigured: !!r.emailConfigured, signupEnabled: !!r.signupEnabled, demoMode: !!r.demoMode });
      document.title = r.appName;
    } catch (e) {
      // Un error del servidor o de red no equivale a "sesión cerrada": se informa y se permite reintentar.
      setState((s) => ({ ...s, me: null, loading: false, error: e instanceof ApiError && e.status === 401 ? null : errorText(e) }));
    }
  }, []);
  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => undefined);
    setState((s) => ({ ...s, me: null }));
    location.href = '/ingresar';
  }, []);
  useEffect(() => {
    refresh();
    const h = () => setState((s) => ({ ...s, me: null }));
    window.addEventListener('nutriar:unauthorized', h);
    return () => window.removeEventListener('nutriar:unauthorized', h);
  }, [refresh]);
  return <Ctx.Provider value={{ ...state, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
