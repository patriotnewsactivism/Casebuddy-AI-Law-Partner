// Firm email identities. Every AI employee has a real inbox at the firm domain
// (firstname@casebuddy.live); the firm itself is firm@casebuddy.live.
//
// Archive BCC (if any) is firm-configured server-side via the FIRM_ARCHIVE_BCC
// env var read in api/email/send.ts / netlify/functions/email-send.ts — it is
// intentionally NOT hardcoded here or anywhere in source. A personal address
// must never be baked into the codebase or shown to clients in email footers.

import { OPERATIONAL_AGENTS, LEGAL_SPECIALISTS } from './personas';

export const FIRM_DOMAIN = 'casebuddy.live';
export const FIRM_NAME = 'CaseBuddy Law';
export const FIRM_EMAIL = `firm@${FIRM_DOMAIN}`;

export interface EmailIdentity {
  email: string;
  name: string;
}

const firstName = (fullName: string): string =>
  fullName.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');

/** The email address for an agent id, e.g. "maya" -> maya@casebuddy.live. */
export const agentEmail = (agentId?: string): string => {
  if (!agentId || agentId === 'firm') return FIRM_EMAIL;
  const op = OPERATIONAL_AGENTS.find(a => a.id === agentId);
  if (op) return `${firstName(op.name)}@${FIRM_DOMAIN}`;
  const spec = LEGAL_SPECIALISTS.find(s => s.id === agentId);
  if (spec) return `${firstName(spec.name)}@${FIRM_DOMAIN}`;
  return FIRM_EMAIL;
};

/** Full sender identity (display name + address) for an agent or the firm. */
export const agentIdentity = (agentId?: string): EmailIdentity => {
  if (!agentId || agentId === 'firm') return { email: FIRM_EMAIL, name: FIRM_NAME };
  const op = OPERATIONAL_AGENTS.find(a => a.id === agentId);
  if (op) return { email: agentEmail(agentId), name: `${op.name} · ${op.title}, ${FIRM_NAME}` };
  const spec = LEGAL_SPECIALISTS.find(s => s.id === agentId);
  if (spec) return { email: agentEmail(agentId), name: `${spec.name}, ${spec.title} · ${FIRM_NAME}` };
  return { email: FIRM_EMAIL, name: FIRM_NAME };
};

/** The whole firm directory, for pickers and "to:" suggestions. */
export const firmDirectory = (): { id: string; name: string; email: string; title: string }[] => [
  { id: 'firm', name: FIRM_NAME, email: FIRM_EMAIL, title: 'Main line' },
  ...OPERATIONAL_AGENTS.map(a => ({ id: a.id, name: a.name, email: agentEmail(a.id), title: a.title })),
  ...LEGAL_SPECIALISTS.map(s => ({ id: s.id, name: s.name, email: agentEmail(s.id), title: s.title })),
];
