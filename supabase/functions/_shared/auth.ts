/**
 * Shared authentication utilities for edge functions
 * Phase 1B: Edge Function Authentication
 */

import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthResult {
  authorized: boolean;
  user: User | null;
  supabase: SupabaseClient | null;
  error?: string;
}

/**
 * Verify user authentication and return Supabase client
 */
export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return {
      authorized: false,
      user: null,
      supabase: null,
      error: 'No authorization header provided',
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
    return {
      authorized: false,
      user: null,
      supabase: null,
      error: 'Server configuration error',
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      authorized: false,
      user: null,
      supabase: null,
      error: error?.message || 'Unauthorized',
    };
  }

  return {
    authorized: true,
    user,
    supabase,
  };
}

/**
 * Create an unauthorized response
 */
export function unauthorizedResponse(message: string = 'Unauthorized', corsHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: 'Unauthorized',
      message,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 401,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Create a forbidden response (authenticated but not authorized)
 */
export function forbiddenResponse(message: string = 'Access denied', corsHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: 'Forbidden',
      message,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 403,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Verify user owns a specific resource
 */
export async function verifyResourceOwnership(
  supabase: SupabaseClient,
  table: string,
  resourceId: string,
  userId: string,
  idColumn: string = 'id',
  userColumn: string = 'user_id'
): Promise<{ authorized: boolean; error?: string }> {
  const { data, error } = await supabase
    .from(table)
    .select(userColumn)
    .eq(idColumn, resourceId)
    .single();

  if (error) {
    return {
      authorized: false,
      error: `Resource not found: ${error.message}`,
    };
  }

  const record = data as unknown as Record<string, unknown> | null;
  const ownerId = record && typeof record[userColumn] === 'string'
    ? record[userColumn]
    : null;

  if (ownerId !== userId) {
    return {
      authorized: false,
      error: 'You do not have access to this resource',
    };
  }

  return { authorized: true };
}
