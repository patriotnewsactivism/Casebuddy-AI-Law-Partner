import { LEGAL_SPECIALISTS, OPERATIONAL_AGENTS } from '../agents/personas';

export type CaseBuddyRouteKind = 'department' | 'specialist' | 'general';

export interface CaseBuddyRoute {
  kind: CaseBuddyRouteKind;
  id: string;
  agentId: string;
  name: string;
  title: string;
  emoji: string;
  workspaceRoute: string;
  reason: string;
  systemInstruction: string;
}

interface DepartmentDefinition {
  id: string;
  agentId: string;
  keywords: string[];
  instruction: string;
}

const DEPARTMENTS: DepartmentDefinition[] = [
  {
    id: 'discovery',
    agentId: 'doc',
    keywords: [
      'discovery', 'evidence', 'document review', 'production', 'bates', 'ocr',
      'transcript', 'transcription', 'recording', 'audio', 'video', 'exhibit',
      'contradiction', 'admission', 'smoking gun', 'privilege', 'redact', 'redaction',
    ],
    instruction: 'Focus on evidence organization, discovery analysis, document intelligence, chronology, provenance, Bates references, contradictions, admissions, and defensible next steps. Never invent evidence or citations.',
  },
  {
    id: 'drafting',
    agentId: 'doc',
    keywords: [
      'draft', 'write motion', 'motion', 'brief', 'memorandum', 'memo', 'letter',
      'demand letter', 'response', 'reply', 'complaint', 'answer', 'petition',
      'affidavit', 'declaration', 'interrogatory', 'request for production',
      'request for admission', 'subpoena', 'proposed order',
    ],
    instruction: 'Focus on high-quality legal work product. Separate factual assertions supplied by the user from assumptions, preserve placeholders for missing facts, and never fabricate authority.',
  },
  {
    id: 'research',
    agentId: 'lex',
    keywords: [
      'research', 'case law', 'precedent', 'statute', 'rule', 'authority', 'citation',
      'legal standard', 'elements', 'burden', 'jurisdiction', 'constitutional',
      'what does the law say', 'is this legal',
    ],
    instruction: 'Focus on legal research and issue spotting. Distinguish verified authority from general analysis. Never fabricate a case, statute, quotation, docket fact, or citation; when primary authority is not available in context, say what still needs verification.',
  },
  {
    id: 'deadlines',
    agentId: 'sol',
    keywords: [
      'deadline', 'due date', 'statute of limitation', 'limitations', 'sol', 'filing window',
      'appeal deadline', 'response due', 'calendar', 'hearing date', 'court date', 'time to file',
    ],
    instruction: 'Focus on deadlines, procedural timing, statutes of limitation, and calendar risk. Treat dates as high-stakes: show the calculation, state assumptions, identify the triggering event, and flag anything that requires jurisdiction-specific verification.',
  },
  {
    id: 'trial',
    agentId: 'rex',
    keywords: [
      'trial', 'hearing', 'deposition', 'cross examination', 'cross-examination',
      'direct examination', 'witness', 'impeach', 'impeachment', 'objection',
      'opening statement', 'closing argument', 'voir dire', 'oral argument',
    ],
    instruction: 'Focus on courtroom, hearing, deposition, witness, and argument preparation. Build practical outlines, anticipated opposition, impeachment paths, objections, and rehearsal plans tied to the actual record.',
  },
  {
    id: 'jury',
    agentId: 'jules',
    keywords: [
      'jury', 'juror', 'deliberation', 'verdict', 'persuasion', 'theme testing',
      'mock jury', 'bias', 'jury selection',
    ],
    instruction: 'Focus on jury-facing themes, persuasion risks, bias, deliberation dynamics, and presentation testing. Present predictions as uncertain scenario analysis, never as guaranteed outcomes.',
  },
  {
    id: 'filing-records',
    agentId: 'max',
    keywords: [
      'efile', 'e-file', 'e filing', 'e-filing', 'docket', 'court filing', 'file with court',
      'service of process', 'serve', 'record request', 'records request', 'foia', 'public records',
      'clerk', 'filing format',
    ],
    instruction: 'Focus on court filing, docket, service, and records workflows. Do not claim a filing was submitted or a docket was checked unless a connected tool actually performed that action.',
  },
  {
    id: 'intake',
    agentId: 'maya',
    keywords: [
      'intake', 'new client', 'new matter', 'new case', 'screen this case', 'case viability',
      'potential client', 'engagement', 'conflict check', 'lead qualification',
    ],
    instruction: 'Focus on structured matter intake. Ask only for information needed to identify parties, jurisdiction, posture, deadlines, objectives, adverse parties, and immediate risks. Do not overstate case viability.',
  },
  {
    id: 'client-operations',
    agentId: 'sierra',
    keywords: [
      'client update', 'email client', 'schedule', 'appointment', 'follow up', 'follow-up',
      'case status', 'client communication', 'office task', 'administrative', 'reminder',
    ],
    instruction: 'Focus on clear client communication and office execution. Draft communications and internal tasks, but do not send messages, change deadlines, or make external commitments without explicit approval.',
  },
];

const GENERIC_GUARDRAILS = `
You are part of CaseBuddy, an AI-assisted legal work platform. You are not a human attorney and must not claim to be one or claim that an attorney-client relationship exists.

Work from the supplied matter context. Distinguish facts in the record from user allegations, inferences, legal analysis, and facts that still require corroboration. Do not fabricate evidence, court records, quotations, authorities, citations, deadlines, or procedural events.

If the request is high-stakes or jurisdiction-dependent, identify what needs verification. If the user asks for a document, produce a strong working draft while marking missing facts or authority rather than inventing them. If a requested action would communicate externally, file something, spend money, delete evidence, or otherwise create a consequential side effect, prepare the action for review instead of claiming it was performed.
`;

function normalize(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function scorePhrases(text: string, phrases: string[]): number {
  let score = 0;
  for (const phrase of phrases) {
    const p = phrase.toLowerCase();
    if (text.includes(p)) score += p.includes(' ') ? 4 : 2;
  }
  return score;
}

function buildDepartmentRoute(definition: DepartmentDefinition, score: number): CaseBuddyRoute {
  const agent = OPERATIONAL_AGENTS.find(a => a.id === definition.agentId);
  return {
    kind: 'department',
    id: definition.id,
    agentId: definition.agentId,
    name: agent?.name ?? 'CaseBuddy',
    title: agent?.title ?? 'Legal Work Assistant',
    emoji: agent?.emoji ?? '⚖️',
    workspaceRoute: agent?.route ?? '/app',
    reason: score > 0 ? `Matched ${definition.id.replace(/-/g, ' ')} workflow` : 'General CaseBuddy routing',
    systemInstruction: `${GENERIC_GUARDRAILS}\n\nDEPARTMENT FOCUS:\n${definition.instruction}`,
  };
}

function scoreSpecialist(text: string, specialist: (typeof LEGAL_SPECIALISTS)[number]): number {
  let score = scorePhrases(text, [specialist.practiceArea, specialist.title]);
  score += scorePhrases(text, specialist.commonTopics);

  const topicWords = `${specialist.practiceArea} ${specialist.commonTopics.join(' ')}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length >= 5);

  for (const word of new Set(topicWords)) {
    if (text.includes(word)) score += 1;
  }
  return score;
}

export function routeCaseBuddyRequest(input: string): CaseBuddyRoute {
  const text = normalize(input);

  let bestDepartment: { definition: DepartmentDefinition; score: number } | null = null;
  for (const definition of DEPARTMENTS) {
    const score = scorePhrases(text, definition.keywords);
    if (!bestDepartment || score > bestDepartment.score) {
      bestDepartment = { definition, score };
    }
  }

  let bestSpecialist: { specialist: (typeof LEGAL_SPECIALISTS)[number]; score: number } | null = null;
  for (const specialist of LEGAL_SPECIALISTS) {
    const score = scoreSpecialist(text, specialist);
    if (!bestSpecialist || score > bestSpecialist.score) {
      bestSpecialist = { specialist, score };
    }
  }

  // Workflow intent wins ties because it tells us what the user wants done.
  if (bestDepartment && bestDepartment.score >= 2 && bestDepartment.score >= (bestSpecialist?.score ?? 0)) {
    return buildDepartmentRoute(bestDepartment.definition, bestDepartment.score);
  }

  if (bestSpecialist && bestSpecialist.score >= 2) {
    const specialist = bestSpecialist.specialist;
    return {
      kind: 'specialist',
      id: specialist.id,
      agentId: specialist.id,
      name: specialist.name,
      title: specialist.title,
      emoji: specialist.emoji,
      workspaceRoute: '/app/ai-team',
      reason: `Matched ${specialist.practiceArea}`,
      systemInstruction: `${GENERIC_GUARDRAILS}\n\nSPECIALIST PERSPECTIVE:\n${specialist.systemInstruction}`,
    };
  }

  const civil = LEGAL_SPECIALISTS.find(s => s.id === 'civil-litigation') ?? LEGAL_SPECIALISTS[0];
  return {
    kind: 'general',
    id: 'general-counsel',
    agentId: civil.id,
    name: 'CaseBuddy',
    title: 'Matter Intelligence & Legal Work Assistant',
    emoji: '⚖️',
    workspaceRoute: '/app/ai-team',
    reason: 'General legal matter routing',
    systemInstruction: `${GENERIC_GUARDRAILS}\n\nGENERAL COUNSEL PERSPECTIVE:\nUse the strongest relevant parts of this litigation perspective without pretending to be the fictional persona:\n${civil.systemInstruction}`,
  };
}
