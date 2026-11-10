import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setToken, setUnauthorizedHandler, type User } from './api';
import { secure } from './storage';
import { syncReminders } from './notifications';

const TOKEN_KEY = 'solace.token';

interface AuthState {
  ready: boolean;
  user: User | null;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (name: string, email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  update: (patch: Partial<User>) => Promise<User>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const signOut = useCallback(async () => {
    setToken(null);
    setUser(null);
    await secure.del(TOKEN_KEY);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
    (async () => {
      const saved = await secure.get(TOKEN_KEY);
      if (saved) {
        setToken(saved);
        try {
          const { user } = await api.get<{ user: User }>('/me');
          setUser(user);
        } catch {
          // Offline on launch: keep the token, the next request will retry.
        }
      }
      setReady(true);
    })();
  }, [signOut]);

  const accept = useCallback(async (res: { token: string; user: User }) => {
    setToken(res.token);
    await secure.set(TOKEN_KEY, res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      user,
      signOut,
      signIn: async (email, password) => accept(await api.post('/auth/login', { email, password })),
      signUp: async (name, email, password) => accept(await api.post('/auth/signup', { name, email, password })),
      update: async (patch) => {
        // Show the change at once (a new voice, a setting); the server confirms it in the background.
        const before = user;
        setUser((u) => (u ? { ...u, ...patch } : u));
        let saved: User;
        try {
          saved = (await api.patch<{ user: User }>('/me', patch)).user;
        } catch (e) {
          setUser(before);
          throw e;
        }
        setUser(saved);
        if (patch.reminders) syncReminders(saved.reminders).catch(() => {});
        return saved;
      },
      refresh: async () => {
        const { user } = await api.get<{ user: User }>('/me');
        setUser(user);
      },
    }),
    [ready, user, signOut, accept],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
