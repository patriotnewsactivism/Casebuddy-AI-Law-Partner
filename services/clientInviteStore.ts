// clientInviteStore.ts — Per-client intake invite system
// Public token resolution goes through a scoped SECURITY DEFINER RPC so anon
// callers never receive table-wide SELECT/UPDATE access.

import { getSupabase } from './supabaseClient';
import { getFirmId } from './caseStore';

export interface ClientInvite {
  id: string;
  created_at: string;
  firm_id: string;
  token: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  notes: string;
  status: 'pending' | 'opened' | 'completed' | 'expired';
  opened_at: string | null;
  completed_at: string | null;
  intake_case_id: string | null;
}

function generateClientToken(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

export const createClientInvite = async (opts: {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  notes?: string;
}): Promise<ClientInvite | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('client_invites')
    .insert({
      firm_id: getFirmId(),
      token: generateClientToken(),
      client_name: opts.clientName.trim(),
      client_email: opts.clientEmail?.trim() || '',
      client_phone: opts.clientPhone?.trim() || '',
      notes: opts.notes?.trim() || '',
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('[clientInviteStore] create failed:', error.message);
    return null;
  }
  return data as ClientInvite;
};

export interface ResolvedClientInvite {
  firm_id: string;
  invite_id: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  notes: string;
}

export const resolveClientToken = async (token: string): Promise<ResolvedClientInvite | null> => {
  const supabase = getSupabase();
  if (!supabase || !token) return null;

  const { data, error } = await supabase.rpc('resolve_public_intake_token', {
    p_token: token.trim(),
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.is_client_invite || !row?.invite_id) return null;

  return {
    firm_id: String(row.firm_id || ''),
    invite_id: String(row.invite_id),
    client_name: String(row.client_name || ''),
    client_email: String(row.client_email || ''),
    client_phone: String(row.client_phone || ''),
    notes: String(row.notes || ''),
  };
};

export const markInviteCompleted = async (inviteId: string, intakeCaseId: string): Promise<void> => {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase.rpc('complete_client_invite', {
    p_invite_id: inviteId,
    p_intake_case_id: intakeCaseId,
  });
  if (error) console.warn('[clientInviteStore] completion update failed:', error.message);
};

export const fetchClientInvites = async (): Promise<ClientInvite[]> => {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('client_invites')
    .select('*')
    .eq('firm_id', getFirmId())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[clientInviteStore] fetch failed:', error.message);
    return [];
  }
  return (data || []) as ClientInvite[];
};

export const deleteClientInvite = async (id: string): Promise<void> => {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from('client_invites').delete().eq('id', id);
};
