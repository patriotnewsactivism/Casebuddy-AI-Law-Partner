/**
 * Discovery Service — manage discovery requests, generate AI responses,
 * and track deadlines using Supabase + Edge Functions.
 */

import { getSupabase } from './supabaseClient';
import { edgeFn, DiscoveryResponseRequest, DiscoveryResponseResult } from './edgeFunctionClient';

// ─── Types ────────────────────────────────────────────────────────────

export type DiscoveryRequestType =
  | 'interrogatory'
  | 'request_for_production'
  | 'request_for_admission'
  | 'deposition';

export interface DiscoveryRequest {
  id: string;
  case_id: string;
  user_id: string;
  request_type: DiscoveryRequestType;
  request_number: string;
  question: string;
  response: string | null;
  objections: string[];
  served_date: string | null;
  response_due_date: string | null;
  response_date: string | null;
  status: string;
  privilege_log_entry: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryStats {
  total: number;
  pending: number;
  drafted: number;
  finalized: number;
  overdue: number;
  byType: Record<DiscoveryRequestType, number>;
}

// ─── CRUD ─────────────────────────────────────────────────────────────

/**
 * Fetch all discovery requests for a case.
 */
export async function getDiscoveryRequests(caseId: string): Promise<DiscoveryRequest[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('discovery_requests')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching discovery requests:', error);
    return [];
  }

  return data as DiscoveryRequest[];
}

/**
 * Create a new discovery request.
 */
export async function createDiscoveryRequest(
  caseId: string,
  request: {
    request_type: DiscoveryRequestType;
    request_number: string;
    question: string;
    served_date?: string;
    response_due_date?: string;
    notes?: string;
  }
): Promise<DiscoveryRequest | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('discovery_requests')
    .insert({
      case_id: caseId,
      user_id: user.id,
      request_type: request.request_type,
      request_number: request.request_number,
      question: request.question,
      served_date: request.served_date || null,
      response_due_date: request.response_due_date || null,
      notes: request.notes || null,
      status: 'pending',
      objections: [],
      privilege_log_entry: false,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Error creating discovery request:', error);
    return null;
  }

  return data as DiscoveryRequest;
}

/**
 * Update a discovery request.
 */
export async function updateDiscoveryRequest(
  id: string,
  updates: Partial<Omit<DiscoveryRequest, 'id' | 'case_id' | 'user_id' | 'created_at'>>
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
    return null;
  }

  return data as DiscoveryRequest;
}

/**
 * Delete a discovery request.
 */
export async function deleteDiscoveryRequest(id: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase
    .from('discovery_requests')
    .delete()
    .eq('id', id);

  return !error;
}

/**
 * Bulk import discovery requests (e.g., from a parsed document).
 */
export async function bulkImportDiscoveryRequests(
  caseId: string,
  requests: Array<{
    request_type: DiscoveryRequestType;
    request_number: string;
    question: string;
    served_date?: string;
    response_due_date?: string;
  }>
): Promise<DiscoveryRequest[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const rows = requests.map(r => ({
    case_id: caseId,
    user_id: user.id,
    request_type: r.request_type,
    request_number: r.request_number,
    question: r.question,
    served_date: r.served_date || null,
    response_due_date: r.response_due_date || null,
    status: 'pending',
    objections: [],
    privilege_log_entry: false,
  }));

  const { data, error } = await supabase
    .from('discovery_requests')
    .insert(rows)
    .select('*');

  if (error) {
    console.error('Error bulk importing:', error);
    return [];
  }

  return data as DiscoveryRequest[];
}

// ─── AI-Powered ──────────────────────────────────────────────────────

/**
 * Generate AI-drafted responses for selected discovery requests.
 * Uses the discovery-response edge function.
 */
export async function generateDiscoveryResponses(
  caseId: string,
  requestIds: string[],
  options?: {
    caseContext?: string;
    jurisdiction?: string;
  }
): Promise<DiscoveryResponseResult | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  // Fetch the requests
  const { data: requests } = await supabase
    .from('discovery_requests')
    .select('*')
    .in('id', requestIds);

  if (!requests?.length) return null;

  // Group by type for proper handling
  const byType = requests.reduce((acc: Record<string, typeof requests>, r: any) => {
    const type = r.request_type || 'interrogatory';
    if (!acc[type]) acc[type] = [];
    acc[type].push(r);
    return acc;
  }, {});

  // Call edge function for each type
  const allResponses: DiscoveryResponseResult['responses'] = [];

  for (const [type, typeRequests] of Object.entries(byType)) {
    const result = await edgeFn.discoveryResponse({
      caseId,
      requestType: type as DiscoveryRequestType,
      requests: (typeRequests as any[]).map(r => ({
        id: r.id,
        request_number: r.request_number,
        question: r.question,
        response: r.response,
        objections: r.objections || [],
      })),
      caseContext: options?.caseContext,
      jurisdiction: options?.jurisdiction,
    });

    allResponses.push(...result.responses);
  }

  // Save responses back to database
  for (const resp of allResponses) {
    await supabase
      .from('discovery_requests')
      .update({
        response: resp.response,
        objections: resp.objections || [],
        status: 'drafted',
        notes: resp.notes || null,
        privilege_log_entry: !!resp.privilegeLog,
        updated_at: new Date().toISOString(),
      })
      .eq('id', resp.id);
  }

  return { responses: allResponses };
}

/**
 * Analyze evidence for a specific document.
 */
export async function analyzeEvidence(caseId: string, documentId: string) {
  return edgeFn.evidenceAnalysis({
    caseId,
    documentId,
    analysisType: 'comprehensive',
  });
}

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
    finalized: 0,
    overdue: 0,
    byType: {
      interrogatory: 0,
      request_for_production: 0,
      request_for_admission: 0,
      deposition: 0,
    },
  };

  for (const r of requests) {
    // Status counts
    if (r.status === 'pending') stats.pending++;
    else if (r.status === 'drafted') stats.drafted++;
    else if (r.status === 'finalized' || r.status === 'served') stats.finalized++;

    // Overdue check
    if (r.response_due_date && !r.response_date) {
      if (new Date(r.response_due_date) < now) stats.overdue++;
    }

    // Type counts
    if (r.request_type in stats.byType) {
      stats.byType[r.request_type as DiscoveryRequestType]++;
    }
  }

  return stats;
}

/**
 * Parse a discovery document (PDF/text) into individual requests using AI.
 * Useful for importing opposing party's discovery requests in bulk.
 */
export async function parseDiscoveryDocument(
  caseId: string,
  documentText: string,
  requestType: DiscoveryRequestType
): Promise<Array<{ request_number: string; question: string }>> {
  // Use the document-aware chat edge function to parse
  const result = await edgeFn.documentChat({
    caseId,
    message: `Parse the following ${requestType.replace(/_/g, ' ')} document into individual requests. Return a JSON array where each item has "request_number" (string) and "question" (string). Only return the JSON array, no other text.\n\nDocument:\n${documentText.slice(0, 50000)}`,
  });

  try {
    // Extract JSON from response
    const jsonMatch = result.response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    console.error('Failed to parse discovery document response');
  }

  return [];
}
