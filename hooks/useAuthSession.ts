import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '../services/supabaseClient';
import { adoptFirmIdFromUser } from '../services/caseStore';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthSession {
  session: Session | null;
  user: User | null;
  status: AuthStatus;
}

/** Single source of truth for the current Supabase auth session. Call once, in App. */
export const useAuthSession = (): AuthSession => {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(isSupabaseConfigured ? 'loading' : 'unauthenticated');

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setStatus('unauthenticated');
      return;
    }

    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setStatus(data.session ? 'authenticated' : 'unauthenticated');
      if (data.session?.user) adoptFirmIdFromUser(data.session.user);
    });

    const { data: subscription } = sb.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setStatus(newSession ? 'authenticated' : 'unauthenticated');
      if (newSession?.user && event === 'SIGNED_IN') adoptFirmIdFromUser(newSession.user);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, status };
};
