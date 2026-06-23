// clientInviteStore.ts — Per-client intake invite system
// ─────────────────────────────────────────────────────────────────────────────
// The attorney generates a unique short token for a specific prospective client.
// That token becomes their personal intake URL: casebuddy.live/intake/1x2c1
//
// Privacy model:
//   • token is short (5 chars), random, URL-safe
//   • resolving a token returns ONLY firm_id + client metadata (name/email/notes)
//   • intake submission is tagged with both firm_id AND client_invite_id
//   • attorney can see: invited → opened → completed per client
//   • RLS: attorney can only manage invites where firm_id = their firm_id

import { getSupabase } from './supabaseClient';
import { getFirmId } from './caseStore';

export interface ClientInvite {
  id: string;
  created_at: string;
  firm_id: string;
  token: string;                         // e.g. "1x2c1" — the URL slug
  client_name: string;                   // pre-filled by attorney
  client_email: string;
  client_phone: string;
  notes: string;                         // internal notes for the intake
  status: 'pending' | 'opened' | 'completed' | 'expired';
  opened_at: string | null;
  completed_at: string | null;
  intake_case_id: string | null;         // links to intake_cases.id once done
}

// ── Generate a 5-char URL-safe token ─────────────────────────────────────────
function generateClientToken(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // no ambiguous chars (0/O, 1/l/I)
  const arr = new Uint8Array(5);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

// ── Create a new invite for a specific client ─────────────────────────────────
export const createClientInvite = async (opts: {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  notes?: string;
}): Promise<ClientInvite | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const firmId = getFirmId();
  const token = generateClientToken();

  const { data, error } = await supabase
    .from('client_invites')
    .insert({
      firm_id:      firmId,
      token,
      client_name:  opts.clientName.trim(),
      client_email: opts.clientEmail?.trim() || '',
      client_phone: opts.clientPhone?.trim() || '',
      notes:        opts.notes?.trim() || '',
      status:       'pending',
    })
    .select()
    .single();

  if (error) { console.error('[clientInviteStore] create failed:', error.message); return null; }
  return data as ClientInvite;
};

// ── Resolve a client token from the public intake URL ─────────────────────────
// Called from PublicIntake — no auth needed.
// Returns only what Maya needs: firm_id (to tag the submission) + client hints
export interface ResolvedClientInvite {
  firm_id: string;
  invite_id: string;
  client_name: string;   // Maya can greet them by name
  client_email: string;
  client_phone: string;
  notes: string;         // attorney's internal notes — shown to Maya as context
}

export const resolveClientToken = async (token: string): Promise<ResolvedClientInvite | null> => {
  const supabase = getSupabase();
  if (!supabase || !token) return null;

  const { data, error } = await supabase
    .from('client_invites')
    .select('id, firm_id, client_name, client_email, client_phone, notes, status')
    .eq('token', token)
    .maybeSingle();

  if (error || !data) return null;

  // Mark as opened (idempotent — only update if still pending)
  if (data.status === 'pending') {
    await supabase
      .from('client_invites')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('id', data.id);
  }

  return {
    firm_id:      data.firm_id,
    invite_id:    data.id,
    client_name:  data.client_name,
    client_email: data.client_email,
    client_phone: data.client_phone,
    notes:        data.notes,
  };
};

// ── Mark invite as completed after successful submission ──────────────────────
export const markInviteCompleted = async (inviteId: string, intakeCaseId: string): Promise<void> => {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase
    .from('client_invites')
    .update({
      status:        'completed',
      completed_at:  new Date().toISOString(),
      intake_case_id: intakeCaseId,
    })
    .eq('id', inviteId);
};

// ── Fetch all invites for the current firm (attorney dashboard) ───────────────
export const fetchClientInvites = async (): Promise<ClientInvite[]> => {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('client_invites')
    .select('*')
    .eq('firm_id', getFirmId())
    .order('created_at', { ascending: false });

  if (error) { console.error('[clientInviteStore] fetch failed:', error.message); return []; }
  return (data || []) as ClientInvite[];
};

// ── Delete an invite ──────────────────────────────────────────────────────────
export const deleteClientInvite = async (id: string): Promise<void> => {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from('client_invites').delete().eq('id', id);
};
