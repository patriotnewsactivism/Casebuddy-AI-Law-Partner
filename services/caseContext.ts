/**
 * caseContext — the firm's shared case file.
 *
 * Every AI agent (attorneys, paralegals, workflow steps) should see the same
 * complete picture of a case: what the client told Maya at intake, what the
 * documents and discovery say, what's been transcribed, and what work product
 * already exists. This module assembles all of that into one prompt-ready
 * brief so no agent ever works blind.
 *
 * Sources merged (all best-effort — a missing source never blocks the brief):
 *   • Case core fields          — utils/storage loadCases()
 *   • Maya's intake details     — localStorage `casebuddy_case_details_${caseId}`
 *                                 (written by intakePipelineService.populateCaseFromIntake)
 *   • Intake call transcript    — same key, `intakeTranscript` field
 *   • Document & discovery AI   — Supabase `documents` table via documentPipeline
 *   • Transcriptions            — localStorage `transcriptions_${caseId}`
 *   • Drafted work product      — localStorage `cb_drafted_docs`
 */

import type { Case } from '../types';
import { loadCases } from '../utils/storage';
import { getSupabase } from './supabaseClient';
import { getFirmId } from './caseStore';

// ─── intake details (Maya → case handoff) ────────────────────────────────────

export interface IntakeDetails {
  detailedNarrative?: string;
  keyFacts?: string[];
  timeline?: { date: string; event: string }[];
  parties?: { name: string; role: string }[];
  witnesses?: string;
  evidenceMentioned?: string;
  financialImpact?: string;
  priorLegalActions?: string;
  clientQuotes?: string[];
  openQuestions?: string[];
  emotionalState?: string;
  incidentDate?: string;
  jurisdiction?: string;
  intakeTranscript?: { speaker: string; text: string }[];
}

const detailsKey = (caseId: string) => `casebuddy_case_details_${caseId}`;
const syncedKey = (caseId: string) => `casebuddy_case_details_synced_${caseId}`;

export function getIntakeDetails(caseId: string): IntakeDetails | null {
  try {
    const raw = localStorage.getItem(detailsKey(caseId));
    return raw ? (JSON.parse(raw) as IntakeDetails) : null;
  } catch {
    return null;
  }
}

/**
 * ISO timestamp of the last confirmed successful write-through to the
 * Supabase `case_details` backup, or null if this browser has never
 * confirmed a sync for this case (e.g. offline, Supabase not configured,
 * or the write is still in flight).
 */
export function getLastSyncedAt(caseId: string): string | null {
  try {
    return localStorage.getItem(syncedKey(caseId));
  } catch {
    return null;
  }
}

function markSynced(caseId: string): void {
  try {
    localStorage.setItem(syncedKey(caseId), new Date().toISOString());
    // Same-tab components (e.g. CaseManager's status readout) don't get a
    // native `storage` event since that only fires cross-tab — dispatch our
    // own so any mounted listener can react immediately.
    window.dispatchEvent(new CustomEvent('casebuddy:case-details-synced', { detail: { caseId } }));
  } catch { /* best-effort */ }
}

/**
 * Fire-and-forget durable backup of intake details + transcript to Supabase
 * `case_details`. localStorage stays the synchronous fast path everything
 * else reads from — this just makes sure the data survives a cleared cache
 * or a different device/browser opening the case later.
 */
function persistCaseDetailsRemote(caseId: string, details: IntakeDetails): void {
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    const row = {
      case_id: caseId,
      firm_id: getFirmId(),
      detailed_narrative: details.detailedNarrative || '',
      key_facts: details.keyFacts || [],
      timeline: details.timeline || [],
      parties: details.parties || [],
      witnesses: details.witnesses || '',
      evidence_mentioned: details.evidenceMentioned || '',
      financial_impact: details.financialImpact || '',
      prior_legal_actions: details.priorLegalActions || '',
      client_quotes: details.clientQuotes || [],
      open_questions: details.openQuestions || [],
      emotional_state: details.emotionalState || '',
      incident_date: details.incidentDate || '',
      jurisdiction: details.jurisdiction || '',
      intake_transcript: details.intakeTranscript || [],
    };
    // Best-effort — never blocks or throws into the caller. Any existing
    // remote row is merged with this call's fields via a follow-up read so a
    // saveIntakeTranscript() call doesn't clobber narrative fields (and vice
    // versa) when the two writers fire independently.
    void supabase
      .from('case_details')
      .select('*')
      .eq('case_id', caseId)
      .maybeSingle()
      .then(({ data: existingRemote }: { data: any }) => {
        const merged = existingRemote ? { ...existingRemote, ...row } : row;
        return supabase.from('case_details').upsert(merged, { onConflict: 'case_id' });
      })
      .then((res: any) => {
        if (!res?.error) markSynced(caseId);
      })
      .catch(() => {});
  } catch {
    /* best-effort — localStorage write already succeeded */
  }
}

/** Store the raw Maya call transcript alongside the extracted intake details. */
export function saveIntakeTranscript(
  caseId: string,
  transcript: { speaker: string; text: string }[]
): void {
  try {
    const existing = getIntakeDetails(caseId) ?? {};
    // 400 turns is a very long call already; keep a generous ceiling so we
    // never silently drop the end of a genuinely long intake.
    existing.intakeTranscript = transcript.slice(0, 2000);
    localStorage.setItem(detailsKey(caseId), JSON.stringify(existing));
    persistCaseDetailsRemote(caseId, existing);
  } catch { /* best-effort */ }
}

/**
 * Download the complete intake transcript for a case as a plain-text .txt
 * file. Reads from localStorage first (instant), falling back to the
 * Supabase `case_details` backup if this browser never had it locally
 * (e.g. case was accepted on a different device).
 */
export async function downloadIntakeTranscript(caseId: string, caseTitle: string): Promise<boolean> {
  let details = getIntakeDetails(caseId);

  if (!details?.intakeTranscript?.length) {
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data } = await supabase
          .from('case_details')
          .select('intake_transcript')
          .eq('case_id', caseId)
          .maybeSingle();
        if (data?.intake_transcript?.length) {
          details = { intakeTranscript: data.intake_transcript };
        }
      }
    } catch { /* fall through to failure below */ }
  }

  const transcript = details?.intakeTranscript;
  if (!transcript?.length) return false;

  const lines = [
    `CaseBuddy — Full Intake Transcript`,
    `Case: ${caseTitle}`,
    `Exported: ${new Date().toLocaleString()}`,
    '─'.repeat(60),
    '',
    ...transcript.map(t => `[${t.speaker === 'agent' ? 'Maya' : 'Client'}] ${t.text}`),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${caseTitle.replace(/[^a-z0-9]+/gi, '_')}_intake_transcript.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

// ─── brief assembly ──────────────────────────────────────────────────────────

const cap = (s: string | undefined | null, n: number): string => {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + ' …' : s;
};

const bullet = (items: string[] | undefined, max: number, capEach = 200): string =>
  (items ?? []).slice(0, max).map(i => `- ${cap(i, capEach)}`).join('\n');

function resolveCase(caseOrId: Case | string): Case | undefined {
  if (typeof caseOrId !== 'string') return caseOrId;
  try {
    return loadCases().find(c => c.id === caseOrId);
  } catch {
    return undefined;
  }
}

function coreSection(c: Case): string {
  const lines = [
    `Title: ${c.title}`,
    `Client: ${c.client}`,
    c.caseType ? `Matter type: ${c.caseType}` : '',
    `Status: ${c.status}`,
    c.judge && c.judge !== 'TBD' ? `Judge: ${c.judge}` : '',
    c.opposingCounsel && c.opposingCounsel !== 'Unknown' ? `Opposing party/counsel: ${c.opposingCounsel}` : '',
    c.nextCourtDate ? `Next court date / deadline: ${c.nextCourtDate}` : '',
    typeof c.winProbability === 'number' ? `Current win probability estimate: ${c.winProbability}%` : '',
    c.summary ? `Summary: ${cap(c.summary, 900)}` : '',
  ].filter(Boolean);
  return `## CASE\n${lines.join('\n')}`;
}

function intakeSection(caseId: string): string {
  const d = getIntakeDetails(caseId);
  if (!d) return '';
  const parts: string[] = [];
  if (d.detailedNarrative) parts.push(`Client's account (from Maya's intake call):\n${cap(d.detailedNarrative, 1800)}`);
  if (d.incidentDate) parts.push(`Incident date: ${d.incidentDate}`);
  if (d.jurisdiction) parts.push(`Jurisdiction: ${d.jurisdiction}`);
  if (d.keyFacts?.length) parts.push(`Key facts stated by client:\n${bullet(d.keyFacts, 12)}`);
  if (d.timeline?.length) {
    const tl = d.timeline.slice(0, 12).map(t => `- ${t.date}: ${cap(t.event, 160)}`).join('\n');
    parts.push(`Timeline as described:\n${tl}`);
  }
  if (d.parties?.length) {
    const ps = d.parties.slice(0, 10).map(p => `- ${p.name} (${p.role})`).join('\n');
    parts.push(`Parties involved:\n${ps}`);
  }
  if (d.witnesses) parts.push(`Witnesses: ${cap(d.witnesses, 300)}`);
  if (d.evidenceMentioned) parts.push(`Evidence the client mentioned: ${cap(d.evidenceMentioned, 400)}`);
  if (d.financialImpact) parts.push(`Financial impact: ${cap(d.financialImpact, 300)}`);
  if (d.priorLegalActions) parts.push(`Prior legal actions: ${cap(d.priorLegalActions, 300)}`);
  if (d.clientQuotes?.length) parts.push(`Client's own words:\n${bullet(d.clientQuotes, 5, 220)}`);
  if (d.openQuestions?.length) parts.push(`OPEN QUESTIONS to resolve (client didn't cover these — do not invent answers):\n${bullet(d.openQuestions, 8)}`);
  if (d.emotionalState) parts.push(`Client's presentation on the call: ${cap(d.emotionalState, 200)}`);
  if (!parts.length) return '';
  return `## CLIENT INTAKE (verified — grounded in what the client actually said)\n${parts.join('\n\n')}`;
}

function evidenceSection(caseId: string): string {
  try {
    const raw = localStorage.getItem(`evidence_${caseId}`);
    if (!raw) return '';
    const items: any[] = JSON.parse(raw);
    if (!Array.isArray(items) || items.length === 0) return '';
    const entries = items.slice(0, 10).map(e => {
      const bits = [
        `- ${e.name ?? e.fileName ?? 'Evidence item'}${e.type ? ` (${e.type})` : ''}: ${cap(e.summary, 300)}`,
        e.concerns?.length ? `  CONCERNS: ${e.concerns.slice(0, 3).join('; ')}` : '',
        e.tags?.length ? `  Tags: ${e.tags.slice(0, 6).join(', ')}` : '',
      ].filter(Boolean);
      return bits.join('\n');
    });
    return `## EVIDENCE VAULT (analyzed uploads)\n${entries.join('\n')}`;
  } catch {
    return '';
  }
}

function transcriptionsSection(caseId: string): string {
  try {
    const raw = localStorage.getItem(`transcriptions_${caseId}`);
    if (!raw) return '';
    const list: any[] = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return '';
    const entries = list.slice(0, 6).map(t => {
      const a = t.analysis;
      if (a?.summary) {
        const issues = (a.legalIssues ?? []).slice(0, 4).join('; ');
        return `- ${t.title ?? t.fileName ?? 'Transcription'}: ${cap(a.summary, 350)}${issues ? ` | Legal issues: ${issues}` : ''}`;
      }
      return `- ${t.title ?? t.fileName ?? 'Transcription'}: ${cap(t.text, 250)}`;
    });
    return `## TRANSCRIPTIONS & RECORDINGS\n${entries.join('\n')}`;
  } catch {
    return '';
  }
}

function workProductSection(caseId: string): string {
  try {
    const raw = localStorage.getItem('cb_drafted_docs');
    if (!raw) return '';
    const docs: any[] = JSON.parse(raw);
    const mine = docs.filter(d => d.caseId === caseId).slice(0, 10);
    if (!mine.length) return '';
    const entries = mine.map(d => `- ${d.docType} (by ${d.agentName}, ${new Date(d.createdAt).toLocaleDateString()})`);
    return `## EXISTING WORK PRODUCT (already drafted — build on it, don't duplicate)\n${entries.join('\n')}`;
  } catch {
    return '';
  }
}

async function documentsSection(caseId: string, timeoutMs: number): Promise<string> {
  try {
    const { getCaseDocuments } = await import('./documentPipeline');
    const docs = await Promise.race([
      getCaseDocuments(caseId),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    if (!docs?.length) return '';
    const analyzed = docs.filter(d => d.ai_analyzed || d.summary);
    const pool = analyzed.length ? analyzed : docs;
    const entries = pool.slice(0, 12).map(d => {
      const bits = [
        `### ${d.name}${d.bates_formatted ? ` [${d.bates_formatted}]` : ''}${d.document_type ? ` (${d.document_type})` : ''}`,
        d.summary ? `Summary: ${cap(d.summary, 400)}` : 'Not yet analyzed.',
        d.key_facts?.length ? `Key facts: ${d.key_facts.slice(0, 6).join('; ')}` : '',
        d.favorable_findings?.length ? `FAVORABLE: ${d.favorable_findings.slice(0, 4).join('; ')}` : '',
        d.adverse_findings?.length ? `ADVERSE: ${d.adverse_findings.slice(0, 4).join('; ')}` : '',
        d.action_items?.length ? `Action items: ${d.action_items.slice(0, 4).join('; ')}` : '',
      ].filter(Boolean);
      return bits.join('\n');
    });
    const omitted = docs.length > 12 ? `\n(${docs.length - 12} more documents on file — ask for specifics.)` : '';
    return `## DOCUMENTS & DISCOVERY (${docs.length} on file, AI-analyzed)\n${entries.join('\n\n')}${omitted}`;
  } catch {
    return '';
  }
}

export interface CaseBriefOptions {
  /** Include Supabase document/discovery analyses (network fetch). Default true. */
  includeDocuments?: boolean;
  /** Include the cross-agent Team Activity section. Default true. */
  includeTeamActivity?: boolean;
  /** The agent this brief is for — their own insights are excluded from Team Activity. */
  forAgentId?: string;
  /** Hard cap on brief length in characters. Default 9000. */
  maxChars?: number;
  /** Timeout for the document fetch. Default 5000ms. */
  documentTimeoutMs?: number;
}

/**
 * Assemble the complete case file as a prompt-ready markdown brief.
 * Accepts a Case or a caseId. Never throws; returns '' only if the case
 * cannot be found at all.
 */
export async function buildCaseBrief(
  caseOrId: Case | string,
  opts: CaseBriefOptions = {}
): Promise<string> {
  const c = resolveCase(caseOrId);
  const caseId = typeof caseOrId === 'string' ? caseOrId : caseOrId.id;
  const maxChars = opts.maxChars ?? 9000;

  const sections: string[] = [];
  if (c) sections.push(coreSection(c));
  sections.push(intakeSection(caseId));

  if (opts.includeDocuments !== false) {
    sections.push(await documentsSection(caseId, opts.documentTimeoutMs ?? 5000));
  }

  sections.push(evidenceSection(caseId));
  sections.push(transcriptionsSection(caseId));
  sections.push(workProductSection(caseId));

  // What every other agent has already found on this case — the shared
  // channel through which the AI team communicates across workflows.
  if (opts.includeTeamActivity !== false) {
    try {
      const { buildTeamContext } = await import('./agentMemory');
      const team = await buildTeamContext(caseId, opts.forAgentId);
      if (team) sections.push(team.trim());
    } catch { /* best-effort */ }
  }

  const brief = sections.filter(Boolean).join('\n\n');
  if (!brief) return '';
  return cap(`# CASE FILE\n${brief}`, maxChars);
}

/**
 * Synchronous brief — everything except the Supabase document fetch.
 * For hot paths that can't await (or offline mode).
 */
export function buildCaseBriefSync(caseOrId: Case | string, maxChars = 7000): string {
  const c = resolveCase(caseOrId);
  const caseId = typeof caseOrId === 'string' ? caseOrId : caseOrId.id;
  const sections = [
    c ? coreSection(c) : '',
    intakeSection(caseId),
    evidenceSection(caseId),
    transcriptionsSection(caseId),
    workProductSection(caseId),
  ].filter(Boolean);
  if (!sections.length) return '';
  return cap(`# CASE FILE\n${sections.join('\n\n')}`, maxChars);
}
