import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase powers the cross-device intake pipeline: a prospect completes a
// voice intake on THEIR phone, and the resulting case lands in the attorney's
// dashboard in real time.
//
// The anon key is designed to be public — it ships in the client bundle and is
// protected by Postgres row-level security. We prefer build-time env values and
// fall back to the project's known public credentials so the deployed app works
// out of the box. To point CaseBuddy at a different Supabase project, set
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (or SUPABASE_URL / SUPABASE_ANON_KEY).

const FALLBACK_URL = 'https://jpzkumgndqsdwimbvjku.supabase.co';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwemt1bWduZHFzZHdpbWJ2amt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NjA1NjYsImV4cCI6MjA4NzAzNjU2Nn0.IoN_MSuj8IjH8N_kKiffI5TxJlJUJXFm0vLkE9d3zCE';

const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || FALLBACK_URL;
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || FALLBACK_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
};

/** Table that holds incoming intake cases. */
export const INTAKE_TABLE = 'intake_cases';
