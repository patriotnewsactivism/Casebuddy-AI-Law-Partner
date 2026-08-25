import type { CaseBuddyRoute } from './casebuddyRouter';

export interface SuggestedWorkflow {
  templateKey: string;
  label: string;
  description: string;
  reason: string;
  internalOnly: true;
}

function includesAny(text: string, values: string[]): boolean {
  return values.some(value => text.includes(value));
}

/**
 * Map a natural-language Ask CaseBuddy request to an existing multi-agent
 * workflow when the workflow adds real value.
 *
 * This function only proposes INTERNAL analysis/drafting workflows. Starting a
 * workflow does not authorize filing, service, external discovery production,
 * email delivery, purchases, deletion, or any other consequential side effect.
 */
export function suggestCaseBuddyWorkflow(
  rawText: string,
  route: Pick<CaseBuddyRoute, 'id' | 'kind'>,
): SuggestedWorkflow | null {
  const text = rawText.toLowerCase();

  if (includesAny(text, ['settlement', 'counteroffer', 'counter offer', 'settlement offer'])) {
    return {
      templateKey: 'settlement-analysis',
      label: 'Run settlement team analysis',
      description: 'Have research, jury, trial, and drafting specialists analyze value, risk, and a possible response.',
      reason: 'The request involves settlement valuation or negotiation strategy.',
      internalOnly: true,
    };
  }

  if (includesAny(text, ['deposition', 'depo ', 'depose', 'witness prep', 'prepare witness', 'cross examination', 'cross-examination'])) {
    return {
      templateKey: 'witness-deposition-prep',
      label: 'Run witness/deposition prep',
      description: 'Build credibility analysis, examination outlines, anticipated cross, and a preparation memo.',
      reason: 'The request calls for coordinated witness or deposition preparation.',
      internalOnly: true,
    };
  }

  if (includesAny(text, ['jury selection', 'voir dire', 'jury pool', 'juror bias', 'strike strategy'])) {
    return {
      templateKey: 'jury-selection-prep',
      label: 'Run jury-selection team',
      description: 'Analyze likely biases, voir dire areas, and strike/challenge strategy as an internal preparation exercise.',
      reason: 'The request involves jury selection or voir dire.',
      internalOnly: true,
    };
  }

  if (includesAny(text, ['foia', 'public records', 'open records', 'records request'])) {
    return {
      templateKey: 'foia-pipeline',
      label: 'Build records-request package',
      description: 'Analyze scope, identify likely agencies/authority, draft the request, and identify follow-up timing for review.',
      reason: 'The request involves public-records work.',
      internalOnly: true,
    };
  }

  if (
    route.id === 'discovery' ||
    includesAny(text, ['interrogatory', 'request for production', 'requests for production', 'request for admission', 'discovery response', 'discovery request'])
  ) {
    return {
      templateKey: 'discovery-response',
      label: 'Run discovery response team',
      description: 'Analyze the requests, identify responsive evidence, draft responses/objections, and identify the response deadline.',
      reason: 'The request requires coordinated discovery review and work product.',
      internalOnly: true,
    };
  }

  if (includesAny(text, ['trial prep', 'trial preparation', 'prepare for trial', 'trial readiness', 'trial brief'])) {
    return {
      templateKey: 'trial-prep-30-days',
      label: 'Run trial-readiness team',
      description: 'Assess readiness, draft trial-prep work product, analyze jury issues, organize witnesses/exhibits, and update research.',
      reason: 'The request is broad enough to benefit from a coordinated trial team.',
      internalOnly: true,
    };
  }

  if (route.id === 'intake' && includesAny(text, ['new case', 'new matter', 'full intake', 'open case', 'onboard'])) {
    return {
      templateKey: 'new-case-intake',
      label: 'Run full matter intake team',
      description: 'Extract case details, identify timing issues, perform preliminary research, and prepare onboarding work product.',
      reason: 'The request is a new-matter intake that benefits from coordinated handoffs.',
      internalOnly: true,
    };
  }

  if (route.id === 'discovery' && includesAny(text, ['evidence', 'exhibit', 'chain of custody', 'evidence binder'])) {
    return {
      templateKey: 'evidence-intake',
      label: 'Run evidence-intake team',
      description: 'Catalog evidence, prepare chain-of-custody work, and organize an internal evidence-binder plan.',
      reason: 'The request is about organizing newly received evidence.',
      internalOnly: true,
    };
  }

  return null;
}
