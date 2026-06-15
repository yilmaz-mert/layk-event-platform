// Mobile-specific auth provider that uses the SecureStore-backed Supabase
// client from supabase-mobile.ts.  The @layk/core AuthProvider uses the web
// singleton (no secure storage), so we duplicate the minimal logic here using
// the mobile client — keeping the public interface identical so screens are
// drop-in compatible with @layk/core's useAuth shape.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase-mobile';
import type { UserProfile } from '../types';

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

export function MobileAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Safety valve: if Supabase never fires INITIAL_SESSION (e.g. missing env
    // vars or a storage-adapter failure on web), clear loading after 8 s so
    // the Login screen renders instead of hanging indefinitely.
    const safetyTimer = setTimeout(() => setLoading(false), 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        clearTimeout(safetyTimer);
        setSession(currentSession);
        if (currentSession) {
          fetchProfile(currentSession.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      },
    );

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  async function fetchProfile(userId: string, attempt = 1): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, role, approval_status')
        .eq('id', userId)
        .single();

      if ((error || !data) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000));
        return fetchProfile(userId, attempt + 1);
      }

      if (data?.approval_status === 'rejected') {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setProfile((data as UserProfile) ?? null);
      setLoading(false);
    } catch {
      setProfile(null);
      setLoading(false);
    }
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthMobile() {
  return useContext(AuthContext);
}
