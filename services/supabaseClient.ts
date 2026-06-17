import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase powers authentication, cross-device case sync, and the intake
// pipeline. The anon key is designed to be public — it ships in the client
// bundle and is protected by Postgres Row Level Security (RLS).
//
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local or
// Vercel environment variables. No hardcoded fallbacks — if they're missing
// the app runs in local-only mode.

const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,        // Keep user signed in across reloads
        autoRefreshToken: true,       // Silently refresh expired JWTs
        detectSessionInUrl: true,     // Handle OAuth redirect callbacks
      },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
};

/** Table that holds incoming intake cases. */
export const INTAKE_TABLE = 'intake_cases';
