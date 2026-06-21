import React, { useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppContext } from '../App';
import { isSupabaseConfigured } from '../services/supabaseClient';

/** Gates the internal /app/* tool behind a signed-in Supabase session. */
const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { user, authLoading } = useContext(AppContext);
  const location = useLocation();

  // No Supabase project configured at all — there's no backend to authenticate
  // against, so fail open rather than locking the app out entirely.
  if (!isSupabaseConfigured) return <>{children}</>;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <Loader2 className="animate-spin text-gold-500" size={32} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default RequireAuth;
