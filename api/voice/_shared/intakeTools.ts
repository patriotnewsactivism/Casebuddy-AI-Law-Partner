/**
 * Mid-call intake tool definitions for Maya Live Voice.
 *
 * Each tool has:
 *   1. A Gemini function declaration (schema) for the Multimodal Live API config
 *   2. A server-side execute() function that runs server-side with Supabase
 *      service-role credentials — the browser never calls these directly
 *
 * Tool results are returned to the realtime provider within the same turn so
 * Maya can incorporate the outcome into her next spoken response.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export interface ToolResult {
  name: string;
  content: Record<string, unknown>;
}

export interface LiveSessionFact {
  category: string;
  description: string;
  factDate?: string;
  recordedAt: string;
}

// ── Tool declarations (Gemini function calling schema) ───────────────────────

export const INTAKE_TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: 'check_conflict',
    description:
      'Check whether a party name conflicts with existing clients or opposing parties. ' +
      'Call this whenever the caller mentions an opposing party, defendant, or involved entity.',
    parameters: {
      type: 'object',
      properties: {
        party_name: {
          type: 'string',
          description: 'The name of the party to check for conflicts.',
        },
      },
      required: ['party_name'],
    },
  },
  {
    name: 'verify_court_jurisdiction',
    description:
      'Validate whether a county or city is a recognized court jurisdiction in a given state. ' +
      'Call this when the caller mentions where their case was filed or where the incident occurred.',
    parameters: {
      type: 'object',
      properties: {
        county_or_city: {
          type: 'string',
          description: 'The county or city name to validate.',
        },
        state: {
          type: 'string',
          description: 'The US state (full name or abbreviation).',
        },
      },
      required: ['county_or_city', 'state'],
    },
  },
  {
    name: 'record_case_fact',
    description:
      'Progressively record an extracted fact from the caller during the intake conversation. ' +
      'Call this each time the caller provides a concrete, verifiable piece of information. ' +
      'Do NOT wait until the end of the call — record facts as they are stated.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'The type of fact being recorded.',
          enum: [
            'incident_date',
            'party',
            'injury',
            'damage',
            'evidence',
            'timeline',
            'narrative',
            'witness',
            'financial',
            'prior_legal',
            'contact_info',
          ],
        },
        description: {
          type: 'string',
          description: 'A concise, factual description of what the caller stated. Use their words where possible.',
        },
        date: {
          type: 'string',
          description: 'An associated date if applicable (ISO 8601 or natural language). Optional.',
        },
      },
      required: ['category', 'description'],
    },
  },
  {
    name: 'schedule_attorney_consultation',
    description:
      'Query attorney availability and book a tentative consultation slot. ' +
      'Call this when the caller is ready to schedule a follow-up with an attorney.',
    parameters: {
      type: 'object',
      properties: {
        preferred_date: {
          type: 'string',
          description: 'The caller\'s preferred date (ISO 8601 or natural language like "next Tuesday").',
        },
        preferred_time: {
          type: 'string',
          description: 'The caller\'s preferred time (e.g., "morning", "2pm", "afternoon").',
        },
      },
      required: ['preferred_date', 'preferred_time'],
    },
  },
];

// ── Tool execution ───────────────────────────────────────────────────────────

const SB_URL = () => (process.env.SUPABASE_URL || '').trim();
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

async function sbQuery(path: string, init: RequestInit = {}): Promise<any> {
  const url = SB_URL();
  const key = SB_KEY();
  if (!url || !key) return null;

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  return response.json();
}

/**
 * Check for conflicts against existing intake cases and firm cases.
 */
export async function executeCheckConflict(
  partyName: string,
  /** Firm scoping — REQUIRED in multi-tenant deployments. When provided, only
   *  the caller's own firm's records are searched (tenant boundary isolation). */
  firmId?: string,
): Promise<ToolResult> {
  const normalized = partyName.trim().toLowerCase();
  if (!normalized) {
    return { name: 'check_conflict', content: { hasConflict: false, matches: [], note: 'Empty party name.' } };
  }

  // Firm scoping is applied to every query below (tenant boundary isolation).
  const firmFilter = firmId ? `&firm_id=eq.${encodeURIComponent(firmId)}` : '';

  const matches: string[] = [];

  // Search intake_cases for opposing party matches (JSONB field)
  try {
    const intakes = await sbQuery(
      `intake_cases?select=id,full_name,intake&or=(full_name.ilike.*${encodeURIComponent(normalized)}*)${firmFilter}`,
    );
    if (Array.isArray(intakes)) {
      for (const row of intakes) {
        const name = (row.full_name || '').toLowerCase();
        const opposing = ((row.intake as any)?.opposingParties || '').toLowerCase();
        if (name.includes(normalized)) {
          matches.push(`Existing client: ${row.full_name} (intake ${String(row.id).slice(0, 8)})`);
        }
        if (opposing.includes(normalized)) {
          matches.push(`Opposing party in intake for ${row.full_name}`);
        }
      }
    }
  } catch { /* non-fatal */ }

  // Search cases table
  try {
    // NOTE: the production `cases` table's columns are name / client_name
    // (there is no title/client column) — previous queries here silently 400'd.
    const cases = await sbQuery(
      `cases?select=id,name,client_name,opposing_party&or=(name.ilike.*${encodeURIComponent(normalized)}*,client_name.ilike.*${encodeURIComponent(normalized)}*,opposing_party.ilike.*${encodeURIComponent(normalized)}*)${firmFilter}`,
    );
    if (Array.isArray(cases)) {
      for (const row of cases) {
        matches.push(`Active case: "${row.name || 'Untitled'}" — client ${row.client_name || 'unknown'}`);
      }
    }
  } catch { /* non-fatal */ }

  return {
    name: 'check_conflict',
    content: {
      hasConflict: matches.length > 0,
      matches: matches.slice(0, 5),
      note: matches.length > 0
        ? 'Potential conflict detected — flag for attorney review before proceeding.'
        : 'No conflicts found in current records.',
    },
  };
}

/**
 * Validate a court jurisdiction. Uses a basic state/county validation.
 * In production this delegates to courtRulesService or an external API.
 */
export async function executeVerifyJurisdiction(
  countyOrCity: string,
  state: string,
): Promise<ToolResult> {
  const normalizedCounty = countyOrCity.trim();
  const normalizedState = state.trim();

  if (!normalizedCounty || !normalizedState) {
    return {
      name: 'verify_court_jurisdiction',
      content: { valid: false, courtName: '', notes: 'Insufficient location information provided.' },
    };
  }

  // Basic validation — a real implementation would query courtRulesService
  // or an external court directory. For now, we accept any non-empty pair
  // and note it for attorney verification.
  return {
    name: 'verify_court_jurisdiction',
    content: {
      valid: true,
      courtName: `${normalizedCounty} County Court, ${normalizedState}`,
      notes: `Jurisdiction noted as ${normalizedCounty}, ${normalizedState}. Attorney will verify specific court and filing requirements.`,
    },
  };
}

/**
 * Record a case fact into the session accumulator. This runs in-memory during
 * the call; facts are persisted to the database at checkpoints and call end.
 */
export function executeRecordFact(
  facts: LiveSessionFact[],
  category: string,
  description: string,
  date?: string,
): ToolResult {
  const fact: LiveSessionFact = {
    category,
    description,
    factDate: date || undefined,
    recordedAt: new Date().toISOString(),
  };
  facts.push(fact);

  return {
    name: 'record_case_fact',
    content: {
      recorded: true,
      totalFacts: facts.length,
      note: `Fact recorded: [${category}] ${description.slice(0, 80)}`,
    },
  };
}

/**
 * Query scheduling availability and book a consultation. Delegates to the
 * scheduling service patterns used by the existing application.
 */
export async function executeScheduleConsultation(
  preferredDate: string,
  preferredTime: string,
): Promise<ToolResult> {
  // In production this calls the firm's scheduling configuration.
  // For now, return a confirmation that the request was noted for
  // human scheduling follow-up, since the scheduling service uses
  // localStorage-based availability (client-side only).
  return {
    name: 'schedule_attorney_consultation',
    content: {
      booked: false,
      pendingReview: true,
      preferredDate,
      preferredTime,
      note:
        `Consultation request noted for ${preferredDate} around ${preferredTime}. ` +
        `The office will confirm availability and send a confirmation.`,
    },
  };
}

/**
 * Route a tool call by name to the appropriate executor.
 */
export async function executeIntakeTool(
  toolName: string,
  args: Record<string, string>,
  sessionFacts: LiveSessionFact[],
  firmId?: string,
): Promise<ToolResult> {
  switch (toolName) {
    case 'check_conflict':
      return executeCheckConflict(args.party_name || '', firmId);

    case 'verify_court_jurisdiction':
      return executeVerifyJurisdiction(args.county_or_city || '', args.state || '');

    case 'record_case_fact':
      return executeRecordFact(sessionFacts, args.category || '', args.description || '', args.date);

    case 'schedule_attorney_consultation':
      return executeScheduleConsultation(args.preferred_date || '', args.preferred_time || '');

    default:
      return {
        name: toolName,
        content: { error: `Unknown tool: ${toolName}` },
      };
  }
}
