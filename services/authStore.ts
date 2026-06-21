/**
 * authStore — thin wrapper around Supabase Auth (email + password).
 *
 * Every function degrades gracefully when Supabase isn't configured so the
 * app never throws for users running without a backend.
 */

import { getSupabase, isSupabaseConfigured } from './supabaseClient';

export interface AuthResult {
  ok: boolean;
  error?: string;
}

export const isAuthAvailable = (): boolean => isSupabaseConfigured;

export const signUp = async (
  email: string,
  password: string
): Promise<AuthResult & { needsEmailConfirmation?: boolean }> => {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Authentication is not configured for this deployment.' };

  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, needsEmailConfirmation: !data.session };
};

export const signIn = async (email: string, password: string): Promise<AuthResult> => {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Authentication is not configured for this deployment.' };

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};

export const signOut = async (): Promise<void> => {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
};

export const sendPasswordResetEmail = async (email: string): Promise<AuthResult> => {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Authentication is not configured for this deployment.' };

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};

export const updatePassword = async (newPassword: string): Promise<AuthResult> => {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Authentication is not configured for this deployment.' };

  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};
