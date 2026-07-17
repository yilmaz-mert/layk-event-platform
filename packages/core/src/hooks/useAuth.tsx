import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string;
  role: 'admin' | 'user';
  approval_status: 'pending' | 'approved' | 'rejected';
  is_private: boolean;
  privacy_changed_at?: string;
}

interface AuthContextValue {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession);
        if (currentSession) {
          fetchProfile(currentSession.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string, attempt = 1): Promise<void> {
    const maxAttempts = 3;

    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, approval_status, is_private')
      .eq('id', userId)
      .single();

    // Correct non-blocking async delay that preserves the loading lifecycle
    if ((error || !data) && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return fetchProfile(userId, attempt + 1);
    }

    if (data && data.approval_status === 'rejected') {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    setProfile(data ?? null);
    setLoading(false);
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
