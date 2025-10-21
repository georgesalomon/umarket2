import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (error) {
          console.error('Error loading session', error);
          setSession(null);
          setUser(null);
        } else {
          setSession(data?.session ?? null);
          setUser(data?.session?.user ?? null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadInitialSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user,
      loading,
      accessToken: session?.access_token ?? null,
      signInWithGoogle: async () => {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
          },
        });
        if (error) throw error;
      },
      signOut: () => supabase.auth.signOut(),
    }),
    [session, user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
