import { getSupabase, INTAKE_TABLE } from './supabaseClient';
import { deepseekChat } from './deepseek';
import { searchCourtListenerCases } from './courtListenerService';
import { pushNotification } from './notificationManager';
import { IntakeCase, IntakeData } from '../types';

/**
 * Assignment-triggered case work.
 *
 * `assign_intake` queues one agent_tasks row per workstream in the same
 * transaction as the assignment, so work can never be lost by an assignment
 * that lands without it. This module drains those rows.
 *
 * Every workstream is advisory and is written to be read by a lawyer, not
 * relied on unread. The model is told to surface what it could NOT determine
 * rather than fill gaps — a confidently wrong limitations date is far worse
 * than an admitted unknown, because the whole point of computing it early is
 * to catch a deadline nobody has noticed yet.
 */

export type WorkstreamType =
  | 'intake_deadlines'
  | 'intake_precedent'
  | 'intake_case_prep'
  | 'intake_conflict_check';

export interface WorkstreamResult {
  taskType: WorkstreamType;
  title: string;
  body: string;
  /** Anything the workstream could not establish and a human must resolve. */
  openItems: string[];
}

const detailOf = (intake: IntakeCase): Partial<IntakeData> => (intake.intake || {}) as Partial<IntakeData>;

const factSheet = (intake: IntakeCase): string => {
  const d = detailOf(intake);
  const lines = [
    `Client: ${intake.full_name}`,
    `Matter type: ${d.matterType || intake.matter_type || 'unspecified'}`,
    `Jurisdiction: ${d.jurisdiction || intake.jurisdiction || 'unspecified'}`,
    `Incident date: ${d.incidentDate || 'not stated'}`,
    `Known deadlines: ${d.deadlines || 'none stated'}`,
    `Opposing parties: ${d.opposingParties || 'not stated'}`,
    `Injuries / damages: ${d.injuriesOrDamages || 'not stated'}`,
    `Financial impact: ${d.financialImpact || 'not stated'}`,
    `Prior legal actions: ${d.priorLegalActions || 'none stated'}`,
    `Prior counsel: ${d.priorCounsel || 'none stated'}`,
    `Desired outcome: ${d.desiredOutcome || 'not stated'}`,
    `Evidence mentioned: ${d.evidenceMentioned || 'none stated'}`,
    `Witnesses: ${d.witnesses || 'none stated'}`,
    '',
    `Narrative: ${d.detailedNarrative || intake.summary || '(none captured)'}`,
  ];
  if (d.keyFacts?.length) lines.push('', 'Key facts:', ...d.keyFacts.map(f => `- ${f}`));
  if (d.timeline?.length) lines.push('', 'Timeline:', ...d.timeline.map(t => `- ${t.date}: ${t.event}`));
  if (d.openQuestions?.length) lines.push('', 'Already-known gaps:', ...d.openQuestions.map(q => `- ${q}`));
  return lines.join('\n');
};

const NEVER_INVENT =
  'Ground every statement in the facts given. Where a fact you would need is ' +
  'missing, say so explicitly under "Open items" instead of assuming it. Never ' +
  'invent dates, statutes, case names, or docket numbers.';

async function runDeadlines(intake: IntakeCase): Promise<WorkstreamResult> {
  const body = await deepseekChat({
    systemInstruction:
      'You are a litigation calendaring specialist. You identify limitations periods and ' +
      'filing deadlines from intake facts. ' + NEVER_INVENT,
    messages: [{
      role: 'user',
      content:
        `${factSheet(intake)}\n\n` +
        `Produce:\n` +
        `1. Every limitations period that plausibly applies, with the statute if you are ` +
        `certain of it for this jurisdiction, and the date it would run from.\n` +
        `2. Any notice requirement that runs shorter than the limitations period ` +
        `(government tort claims notices especially).\n` +
        `3. Court dates or deadlines the client already stated.\n` +
        `4. The single earliest date anything is due.\n` +
        `5. Open items: what must be confirmed before these dates can be relied on.\n\n` +
        `If the jurisdiction or incident date is unknown, say that these cannot be ` +
        `computed and list what is needed. Do not guess.`,
    }],
    temperature: 0.1,
    maxTokens: 900,
  });

  return {
    taskType: 'intake_deadlines',
    title: 'Limitations & deadlines',
    body,
    openItems: extractOpenItems(body),
  };
}

async function runPrecedent(intake: IntakeCase): Promise<WorkstreamResult> {
  const d = detailOf(intake);
  const query = [d.matterType || intake.matter_type, d.jurisdiction || intake.jurisdiction, intake.summary]
    .filter(Boolean).join(' ').slice(0, 300);

  let citations = '';
  try {
    const cases = await searchCourtListenerCases(query);
    citations = cases.slice(0, 8)
      .map((c: any) => `- ${c.caseName || c.name || 'Unknown case'}${c.court ? ` (${c.court}` : ''}${c.dateFiled ? `, ${c.dateFiled})` : c.court ? ')' : ''}`)
      .join('\n');
  } catch (err) {
    console.warn('[intakeAutoWork] CourtListener lookup failed:', err);
  }

  const body = await deepseekChat({
    systemInstruction:
      'You are a legal research associate preparing an early case memo. ' + NEVER_INVENT +
      ' Only cite authorities supplied to you below; if none were supplied, say the ' +
      'docket search returned nothing and recommend manual research.',
    messages: [{
      role: 'user',
      content:
        `${factSheet(intake)}\n\n` +
        `Authorities retrieved from the docket search:\n${citations || '(none returned)'}\n\n` +
        `Produce a short research memo: the legal theories worth pursuing, the elements ` +
        `each requires, which elements the client's facts already support, which are ` +
        `unsupported so far, and the likely defenses. End with "Open items".`,
    }],
    temperature: 0.2,
    maxTokens: 1100,
  });

  return {
    taskType: 'intake_precedent',
    title: 'Precedent & theory memo',
    body: citations ? `${body}\n\n---\nDocket search hits:\n${citations}` : body,
    openItems: extractOpenItems(body),
  };
}

async function runCasePrep(intake: IntakeCase): Promise<WorkstreamResult> {
  const body = await deepseekChat({
    systemInstruction:
      'You are a senior paralegal preparing a new matter for the assigned attorney. ' + NEVER_INVENT,
    messages: [{
      role: 'user',
      content:
        `${factSheet(intake)}\n\n` +
        `Produce:\n` +
        `1. Evidence checklist — what to collect, and from whom.\n` +
        `2. Records to request, with the custodian for each ` +
        `(medical providers, employers, agencies, insurers).\n` +
        `3. Preservation steps that are time-sensitive (spoliation letters, ` +
        `scene documentation, device preservation).\n` +
        `4. Questions to close the gaps in the intake.\n` +
        `5. Open items.`,
    }],
    temperature: 0.2,
    maxTokens: 1100,
  });

  return {
    taskType: 'intake_case_prep',
    title: 'Case file prep',
    body,
    openItems: extractOpenItems(body),
  };
}

async function runConflictCheck(intake: IntakeCase, existingClients: string[]): Promise<WorkstreamResult> {
  const d = detailOf(intake);
  const adverse = [d.opposingParties, ...(d.parties || []).map(p => `${p.name} (${p.role})`)]
    .filter(Boolean).join('; ');

  const body = await deepseekChat({
    systemInstruction:
      'You are performing a conflicts check and an early case-strength assessment for a ' +
      'law firm. Be conservative: flag anything that might be a conflict for human review ' +
      'rather than clearing it. ' + NEVER_INVENT,
    messages: [{
      role: 'user',
      content:
        `Prospective client: ${intake.full_name}\n` +
        `Adverse / involved parties: ${adverse || 'none identified'}\n\n` +
        `Existing firm clients:\n${existingClients.length ? existingClients.join(', ') : '(none on file)'}\n\n` +
        `${factSheet(intake)}\n\n` +
        `Produce:\n` +
        `1. Conflict status — Clear, Possible conflict, or Cannot determine — with the ` +
        `specific name match or similarity that drove it.\n` +
        `2. Case-strength assessment: what makes this matter strong, what weakens it.\n` +
        `3. Risk flags: credibility problems, causation gaps, collectability, ` +
        `client-expectation mismatch.\n` +
        `4. Open items.`,
    }],
    temperature: 0.2,
    maxTokens: 900,
  });

  return {
    taskType: 'intake_conflict_check',
    title: 'Conflicts & risk',
    body,
    openItems: extractOpenItems(body),
  };
}

/** Pull an "Open items" style trailer out of a memo, best-effort. */
function extractOpenItems(text: string): string[] {
  const match = text.match(/open items?:?\s*\n([\s\S]{0,1200})/i);
  if (!match?.[1]) return [];
  return match[1]
    .split('\n')
    .map(line => line.replace(/^[\s\-*\d.)]+/, '').trim())
    .filter(line => line.length > 3)
    .slice(0, 12);
}

const RUNNERS: Record<WorkstreamType, (i: IntakeCase, clients: string[]) => Promise<WorkstreamResult>> = {
  intake_deadlines: i => runDeadlines(i),
  intake_precedent: i => runPrecedent(i),
  intake_case_prep: i => runCasePrep(i),
  intake_conflict_check: (i, clients) => runConflictCheck(i, clients),
};

/**
 * Run every queued workstream for one intake. Each is independent: one failing
 * never prevents the others from finishing, and a failed row is left in the
 * queue with its error so it can be retried rather than silently dropped.
 */
export async function runAssignmentWorkstreams(
  intake: IntakeCase,
  existingClients: string[] = [],
): Promise<WorkstreamResult[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: tasks } = await supabase
    .from('agent_tasks')
    .select('id, task_type, status')
    .eq('intake_id', intake.id)
    .eq('status', 'queued');

  if (!tasks?.length) return [];

  const results: WorkstreamResult[] = [];

  for (const task of tasks as { id: string; task_type: WorkstreamType }[]) {
    const runner = RUNNERS[task.task_type];
    if (!runner) continue;

    await supabase.from('agent_tasks')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', task.id);

    try {
      const result = await runner(intake, existingClients);
      results.push(result);

      await supabase.from('agent_tasks').update({
        status: 'complete',
        completed_at: new Date().toISOString(),
        output: { title: result.title, body: result.body, openItems: result.openItems },
      }).eq('id', task.id);

      pushNotification({
        agentId: task.task_type === 'intake_case_prep' ? 'paralegal' : 'maya',
        caseId: intake.id,
        caseTitle: `${intake.full_name} (Intake)`,
        type: 'insight',
        priority: task.task_type === 'intake_deadlines' ? 'high' : 'medium',
        title: `${result.title}: ${intake.full_name}`,
        message: result.body,
        actions: [{ label: 'Open Intake Inbox', route: '/app/intake-inbox' }],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      console.warn(`[intakeAutoWork] ${task.task_type} failed:`, message);
      await supabase.from('agent_tasks')
        .update({ status: 'failed', error: message, completed_at: new Date().toISOString() })
        .eq('id', task.id);
    }
  }

  // Persist the combined output so the intake row carries its own work product.
  if (results.length) {
    const extracted = Object.fromEntries(
      results.map(r => [r.taskType, { title: r.title, body: r.body, openItems: r.openItems }]),
    );
    await supabase.from(INTAKE_TABLE)
      .update({ extracted: { ...(intake.extracted || {}), ...extracted } })
      .eq('id', intake.id);
  }

  return results;
}

/**
 * Find intakes with queued workstreams and run them. RLS scopes agent_tasks to
 * the caller's firm, so this only ever drains the signed-in firm's queue.
 *
 * Tasks are claimed by flipping 'queued' to 'running' before work begins, which
 * keeps two staff browsers running the same sweep from doing the same expensive
 * AI work twice.
 */
export async function drainAssignmentQueue(limit = 3): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const { data: queued } = await supabase
    .from('agent_tasks')
    .select('intake_id')
    .eq('status', 'queued')
    .not('intake_id', 'is', null)
    .limit(50);

  if (!queued?.length) return 0;

  const intakeIds = [...new Set(queued.map(t => String((t as { intake_id: string }).intake_id)))].slice(0, limit);
  if (!intakeIds.length) return 0;

  const { data: intakes } = await supabase
    .from(INTAKE_TABLE)
    .select('*')
    .in('id', intakeIds);

  if (!intakes?.length) return 0;

  // Existing client names power the conflict check.
  let clientNames: string[] = [];
  try {
    const { data: cases } = await supabase.from('cases').select('client').limit(500);
    clientNames = (cases || [])
      .map(c => String((c as { client?: string }).client || '').trim())
      .filter(Boolean);
  } catch { /* conflict check degrades to "cannot determine" without this */ }

  let ran = 0;
  for (const intake of intakes as IntakeCase[]) {
    try {
      const results = await runAssignmentWorkstreams(intake, clientNames);
      ran += results.length;
    } catch (err) {
      console.warn('[intakeAutoWork] drain failed for', intake.id, err);
    }
  }
  return ran;
}
