/**
 * authService — Supabase Auth wrapper for CaseBuddy.
 *
 * Provides sign-up, sign-in, sign-out, password reset, and session management.
 * All /app/* routes are gated behind authentication via <AuthGate>.
 */

import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import type { User, Session, AuthError } from '@supabase/supabase-js';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

export interface AuthResult {
  success: boolean;
  error?: string;
}

// ─── Sign Up ──────────────────────────────────────────────────────────────────

export const signUp = async (
  email: string,
  password: string,
  displayName?: string
): Promise<AuthResult> => {
  const sb = getSupabase();
  if (!sb) return { success: false, error: 'Database not configured.' };

  const { error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName || email.split('@')[0] },
    },
  });

  if (error) return { success: false, error: friendlyError(error) };
  return { success: true };
};

// ─── Sign In ──────────────────────────────────────────────────────────────────

export const signIn = async (
  email: string,
  password: string
): Promise<AuthResult> => {
  const sb = getSupabase();
  if (!sb) return { success: false, error: 'Database not configured.' };

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { success: false, error: friendlyError(error) };
  return { success: true };
};

// ─── OAuth (Google) ───────────────────────────────────────────────────────────

export const signInWithGoogle = async (): Promise<AuthResult> => {
  const sb = getSupabase();
  if (!sb) return { success: false, error: 'Database not configured.' };

  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/app` },
  });
  if (error) return { success: false, error: friendlyError(error) };
  return { success: true };
};

// ─── Sign Out ─────────────────────────────────────────────────────────────────

export const signOut = async (): Promise<void> => {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
};

// ─── Password Reset ──────────────────────────────────────────────────────────

export const resetPassword = async (email: string): Promise<AuthResult> => {
  const sb = getSupabase();
  if (!sb) return { success: false, error: 'Database not configured.' };

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/app/settings`,
  });
  if (error) return { success: false, error: friendlyError(error) };
  return { success: true };
};

// ─── Session helpers ──────────────────────────────────────────────────────────

export const getSession = async (): Promise<Session | null> => {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
};

export const getUser = async (): Promise<User | null> => {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user;
};

export const onAuthStateChange = (
  callback: (user: User | null, session: Session | null) => void
): (() => void) => {
  const sb = getSupabase();
  if (!sb) return () => {};

  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null, session);
  });

  return () => data.subscription.unsubscribe();
};

// ─── Friendly error messages ─────────────────────────────────────────────────

const friendlyError = (error: AuthError): string => {
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login')) return 'Invalid email or password.';
  if (msg.includes('already registered')) return 'An account with this email already exists. Try signing in.';
  if (msg.includes('password')) return 'Password must be at least 6 characters.';
  if (msg.includes('rate limit')) return 'Too many attempts. Please wait a moment and try again.';
  if (msg.includes('email not confirmed')) return 'Please check your email and confirm your account first.';
  return error.message;
};
