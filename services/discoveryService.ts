/**
 * Discovery Service — CRUD, AI response generation, bulk import, statistics
 * 
 * Works with the `discovery_requests` table in Supabase and the
 * `discovery-response` edge function for AI-generated responses.
 */

import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { edgeFn } from './edgeFunctionClient';

// ─── Types ────────────────────────────────────────────────────────────

export type DiscoveryRequestType =
  | 'interrogatory'
  | 'request_for_production'
  | 'request_for_admission'
  | 'deposition';

export interface DiscoveryRequest {
  id: string;
  case_id: string;
  request_type: DiscoveryRequestType;
  request_number: string;
  question: string;
  response: string | null;
  objections: string[];
  privilege_log: string | null;
  status: 'pending' | 'drafted' | 'reviewed' | 'finalized' | 'served' | 'objected';
  served_date: string | null;
  response_due_date: string | null;
  response_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryStats {
  total: number;
  pending: number;
  drafted: number;
  reviewed: number;
  finalized: number;
  served: number;
  overdue: number;
  byType: Record<DiscoveryRequestType, number>;
}

export interface CreateDiscoveryInput {
  request_type: DiscoveryRequestType;
  request_number?: string;
  question: string;
  served_date?: string;
  response_due_date?: string;
  notes?: string;
}

export interface ParsedDiscoveryItem {
  request_number: string;
  question: string;
}

// ─── CRUD ─────────────────────────────────────────────────────────────

/**
 * Get all discovery requests for a case.
 */
export async function getDiscoveryRequests(
  caseId: string,
  options?: { type?: DiscoveryRequestType; status?: string }
): Promise<DiscoveryRequest[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  let query = supabase
    .from('discovery_requests')
    .select('*')
    .eq('case_id', caseId)
    .order('request_number', { ascending: true });

  if (options?.type) query = query.eq('request_type', options.type);
  if (options?.status) query = query.eq('status', options.status);

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching discovery requests:', error);
    return [];
  }

  return (data || []) as DiscoveryRequest[];
}

/**
 * Create a single discovery request.
 */
export async function createDiscoveryRequest(
  caseId: string,
  input: CreateDiscoveryInput
): Promise<DiscoveryRequest | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('discovery_requests')
    .insert({
      case_id: caseId,
      user_id: user.id,
      request_type: input.request_type,
      request_number: input.request_number || `REQ-${Date.now()}`,
      question: input.question,
      status: 'pending',
      objections: [],
      served_date: input.served_date || null,
      response_due_date: input.response_due_date || null,
      notes: input.notes || null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Error creating discovery request:', error);
    throw new Error(error.message);
  }

  return data as DiscoveryRequest;
}

/**
 * Update a discovery request.
 */
export async function updateDiscoveryRequest(
  id: string,
  updates: Partial<Pick<DiscoveryRequest, 'question' | 'response' | 'objections' | 'status' | 'notes' | 'response_date' | 'privilege_log'>>
): Promise<DiscoveryRequest | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('discovery_requests')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('Error updating discovery request:', error);
    throw new Error(error.message);
  }

  return data as DiscoveryRequest;
}

/**
 * Delete a discovery request.
 */
export async function deleteDiscoveryRequest(id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase
    .from('discovery_requests')
    .delete()
    .eq('id', id);

  if (error) console.error('Error deleting discovery request:', error);
}

// ─── AI Response Generation ──────────────────────────────────────────

/**
 * Generate AI responses for selected discovery requests.
 * Groups requests by type and calls the edge function for each group.
 */
export async function generateDiscoveryResponses(
  caseId: string,
  requestIds: string[],
  options?: { jurisdiction?: string; caseContext?: string }
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  // Fetch the selected requests
  const { data: requests } = await supabase
    .from('discovery_requests')
    .select('*')
    .in('id', requestIds);

  if (!requests || requests.length === 0) return;

  // Group by type for better AI context
  const byType = new Map<string, typeof requests>();
  for (const req of requests) {
    const group = byType.get(req.request_type) || [];
    group.push(req);
    byType.set(req.request_type, group);
  }

  // Generate responses for each type group
  for (const [requestType, group] of byType) {
    try {
      const result = await edgeFn.discoveryResponse({
        caseId,
        requestType: requestType as any,
        requests: group.map(r => ({
          id: r.id,
          request_number: r.request_number,
          question: r.question,
          response: r.response,
          objections: r.objections,
        })),
        jurisdiction: options?.jurisdiction,
        caseContext: options?.caseContext,
      });

      // Update each request with its generated response
      for (const resp of result.responses) {
        await supabase
          .from('discovery_requests')
          .update({
            response: resp.response,
            objections: resp.objections || [],
            privilege_log: resp.privilegeLog || null,
            notes: resp.notes || null,
            status: 'drafted',
            updated_at: new Date().toISOString(),
          })
          .eq('id', resp.id);
      }
    } catch (err) {
      console.error(`Error generating ${requestType} responses:`, err);
      // Mark requests as errored
      for (const req of group) {
        await supabase
          .from('discovery_requests')
          .update({
            notes: `AI generation error: ${err instanceof Error ? err.message : 'Unknown error'}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', req.id);
      }
    }
  }
}

// ─── Bulk Import ─────────────────────────────────────────────────────

/**
 * Bulk import multiple discovery requests at once.
 */
export async function bulkImportDiscoveryRequests(
  caseId: string,
  items: CreateDiscoveryInput[]
): Promise<DiscoveryRequest[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const rows = items.map(item => ({
    case_id: caseId,
    user_id: user.id,
    request_type: item.request_type,
    request_number: item.request_number || `REQ-${Date.now()}`,
    question: item.question,
    status: 'pending',
    objections: [],
    served_date: item.served_date || null,
    response_due_date: item.response_due_date || null,
    notes: item.notes || null,
  }));

  const { data, error } = await supabase
    .from('discovery_requests')
    .insert(rows)
    .select('*');

  if (error) throw new Error(error.message);
  return (data || []) as DiscoveryRequest[];
}

/**
 * Parse a pasted discovery document into individual requests using AI.
 */
export async function parseDiscoveryDocument(
  caseId: string,
  documentText: string,
  expectedType: DiscoveryRequestType
): Promise<ParsedDiscoveryItem[]> {
  try {
    const result = await edgeFn.chat({
      message: `Parse the following ${expectedType} document into individual requests.
Return a JSON array where each element has { "request_number": "...", "question": "..." }.
Only return the JSON array, no other text.

Document:
${documentText.slice(0, 30000)}`,
      caseId,
    });

    // Extract JSON from the response
    const jsonMatch = result.response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((item: any, idx: number) => ({
      request_number: item.request_number || `${expectedType.charAt(0).toUpperCase()}-${idx + 1}`,
      question: item.question || item.text || '',
    })).filter((item: ParsedDiscoveryItem) => item.question.trim());
  } catch (err) {
    console.error('Error parsing discovery document:', err);
    return [];
  }
}

// ─── Statistics ──────────────────────────────────────────────────────

/**
 * Get discovery statistics for a case.
 */
export async function getDiscoveryStats(caseId: string): Promise<DiscoveryStats> {
  const requests = await getDiscoveryRequests(caseId);

  const now = new Date();
  const stats: DiscoveryStats = {
    total: requests.length,
    pending: 0,
    drafted: 0,
    reviewed: 0,
    finalized: 0,
    served: 0,
    overdue: 0,
    byType: {
      interrogatory: 0,
      request_for_production: 0,
      request_for_admission: 0,
      deposition: 0,
    },
  };

  for (const req of requests) {
    // Count by status
    if (req.status in stats) {
      (stats as any)[req.status]++;
    }

    // Count by type
    if (req.request_type in stats.byType) {
      stats.byType[req.request_type]++;
    }

    // Check overdue
    if (
      req.response_due_date &&
      !req.response_date &&
      req.status !== 'served' &&
      req.status !== 'finalized' &&
      new Date(req.response_due_date) < now
    ) {
      stats.overdue++;
    }
  }

  return stats;
}
