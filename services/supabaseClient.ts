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

/**
 * Referral token for the public intake route. It is intentionally attached as
 * an HTTP header instead of trusting a browser-supplied firm_id. Postgres can
 * inspect this header and resolve the receiving firm through
 * resolve_public_intake_token(). The token is opaque and contains no user UUID.
 */
const publicIntakeTokenFromLocation = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    const match = window.location.pathname.match(/^\/intake\/([^/]+)\/?$/i);
    if (!match?.[1]) return '';
    const token = decodeURIComponent(match[1]).trim();
    return token.length >= 5 && token.length <= 128 ? token : '';
  } catch {
    return '';
  }
};

export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    const intakeToken = publicIntakeTokenFromLocation();
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,        // Keep user signed in across reloads
        autoRefreshToken: true,       // Silently refresh expired JWTs
        detectSessionInUrl: true,     // Handle OAuth redirect callbacks
      },
      realtime: { params: { eventsPerSecond: 5 } },
      global: {
        headers: intakeToken ? { 'X-Intake-Token': intakeToken } : {},
      },
    });
  }
  return client;
};

/** Table that holds incoming intake cases. */
export const INTAKE_TABLE = 'intake_cases';
