import { CaseStatus } from '../types';
import type { IntakeData, IntakeCase, Case, IntakeScore } from '../types';
import { loadCases, saveCases } from '../utils/storage';
import { deepseekChat } from './deepseek';
import { LEGAL_SPECIALISTS, getSpecialistById } from '../agents/personas';

export function convertIntakeToCase(intake: IntakeData, score: IntakeScore): Case {
  const specialist = getSpecialistById(score.recommendedAgentId);
  const caseType = intake.matterType || specialist?.practiceArea || 'General Practice';

  const title =
    caseType + ' — ' + (intake.summary || intake.detailedNarrative || 'New Case').slice(0, 60);

  const winProbability = Math.min(Math.round(score.score * 0.7), 95);

  return {
    id: `case_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    client: intake.fullName || 'Unknown Client',
    status: CaseStatus.PRE_TRIAL,
    opposingCounsel: intake.opposingParties || 'Unknown',
    judge: 'TBD',
    nextCourtDate: intake.deadlines || '',
    summary: intake.detailedNarrative || intake.summary || '',
    winProbability,
    caseType,
    assignedSpecialistId: score.recommendedAgentId,
    updatedAt: new Date().toISOString(),
  };
}

export function autoCreateCaseFromIntake(intake: IntakeData, score: IntakeScore): Case {
  const newCase = convertIntakeToCase(intake, score);
  // Persist the full intake detail (narrative, timeline, parties, witnesses,
  // evidence, quotes, open questions) to the shared case file BEFORE saving
  // the case, so agent workflows kicked off by case creation read everything.
  populateCaseFromIntake(newCase.id, intake);
  const cases = loadCases();
  cases.unshift(newCase);
  saveCases(cases);
  return newCase;
}

export async function generateEngagementLetter(intake: IntakeData, caseData: Case): Promise<string> {
  const specialist = caseData.assignedSpecialistId
    ? getSpecialistById(caseData.assignedSpecialistId)
    : undefined;

  const prompt = `You are drafting a professional legal engagement letter for a law firm.

CLIENT:
- Name: ${intake.fullName || 'Client'}
- Contact: ${intake.contact || 'Not provided'}
- Matter type: ${caseData.caseType || 'General Legal Matter'}
- Summary: ${caseData.summary || ''.slice(0, 300)}

ATTORNEY ASSIGNED: ${specialist ? `${specialist.name} (${specialist.practiceArea})` : 'Assigned Attorney'}

FIRM: CaseBuddy Law Firm (AI-powered legal practice)
ADDRESS: [Firm Address - to be filled]
PHONE: [Firm Phone - to be filled]

Generate a complete engagement letter in markdown format that includes:
1. A professional header with firm name and date
2. Salutation to the client by name
3. Scope of representation section referencing the client's specific matter
4. Fee structure placeholder (mark as "[Fee structure to be discussed and agreed upon]")
5. Responsibilities of both the attorney and client
6. Communication expectations
7. Confidentiality statement
8. Termination clause
9. Signature block with date lines for both attorney and client

Keep the tone warm but professional. Make it specific to the client's described matter — do not use generic boilerplate where their facts fit. Do not fill in fictional fees or dates beyond today's date.

Return ONLY the engagement letter in valid markdown. No preamble, no commentary.`;

  try {
    const result = await deepseekChat({
      systemInstruction: `You are a legal document drafting specialist. Write a complete, professional engagement letter in markdown.`,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 2048,
    });
    return result || '';
  } catch {
    return `# Engagement Letter\n\n## ${caseData.caseType}\n\n**Date:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\nDear ${intake.fullName || 'Client'},\n\nThis letter confirms our engagement to represent you in connection with your ${caseData.caseType?.toLowerCase() || 'legal matter'}.\n\n[Fee structure to be discussed and agreed upon]\n\nPlease review and sign below to confirm our representation.\n\n---\n\nClient Signature: ________________________ Date: ________\n\nAttorney Signature: _____________________ Date: ________`;
  }
}

export async function generateIntakeConfirmation(intake: IntakeData, score: IntakeScore): Promise<string> {
  const urgencyNote = score.urgency === 'high'
    ? 'our team will prioritize your case and'
    : score.urgency === 'low'
    ? 'our team will reach out'
    : 'our team will review your case and';

  const prompt = `Write a warm, professional confirmation message for a new legal client. This message should make them feel heard and cared for. Use a friendly but professional tone — like an email from a real law firm, not a generic receipt.

CLIENT NAME: ${intake.fullName || 'Client'}
CONTACT: ${intake.contact || 'provided'}
MATTER: ${intake.matterType || 'legal matter'}
SUMMARY OF WHAT THEY SHARED: ${(intake.summary || '').slice(0, 200)}
URGENCY: ${score.urgency}
CLIENT MESSAGE FROM SCORING: ${score.clientMessage || 'We appreciate you reaching out.'}

Write as the law firm contacting the client. Include:
1. A warm greeting by name
2. Acknowledgment that we've received their case details and understand what's going on
3. Mention that ${urgencyNote} shortly (make it feel human, not robotic)
4. The client message from scoring (weave it in naturally)
5. A sign-off from the firm

Keep the whole message warm and personal — 3-4 short paragraphs. Return ONLY the message text. No markdown headers, no subject line.`;

  try {
    const result = await deepseekChat({
      systemInstruction: `You are a warm, professional legal intake coordinator. Write a personal confirmation message to a new client. Be warm, specific to their case, and make them feel their call mattered.`,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 1024,
    });
    return result || score.clientMessage;
  } catch {
    return `Dear ${intake.fullName || 'Valued Client'},\n\nThank you for taking the time to share your situation with us. We've received everything you told Maya and ${urgencyNote} soon.\n\n${score.clientMessage}\n\nWarm regards,\nThe CaseBuddy Law Team`;
  }
}

export function populateCaseFromIntake(caseId: string, intake: IntakeData): void {
  try {
    const key = `casebuddy_case_details_${caseId}`;
    const data: Record<string, any> = {};

    if (intake.detailedNarrative) data.detailedNarrative = intake.detailedNarrative;
    if (intake.keyFacts && intake.keyFacts.length > 0) data.keyFacts = intake.keyFacts;
    if (intake.timeline && intake.timeline.length > 0) data.timeline = intake.timeline;
    if (intake.parties && intake.parties.length > 0) data.parties = intake.parties;
    if (intake.witnesses) data.witnesses = intake.witnesses;
    if (intake.evidenceMentioned) data.evidenceMentioned = intake.evidenceMentioned;
    if (intake.financialImpact) data.financialImpact = intake.financialImpact;
    if (intake.priorLegalActions) data.priorLegalActions = intake.priorLegalActions;
    if (intake.clientQuotes && intake.clientQuotes.length > 0) data.clientQuotes = intake.clientQuotes;
    if (intake.openQuestions && intake.openQuestions.length > 0) data.openQuestions = intake.openQuestions;
    if (intake.emotionalState) data.emotionalState = intake.emotionalState;
    if (intake.incidentDate) data.incidentDate = intake.incidentDate;
    if (intake.jurisdiction) data.jurisdiction = intake.jurisdiction;

    localStorage.setItem(key, JSON.stringify(data));

    // Durable backup — see caseContext.ts persistCaseDetailsRemote(). Import
    // is done lazily here (not at module top) to avoid a circular import,
    // since caseContext.ts itself doesn't depend on this module.
    import('./caseContext').then(({ saveIntakeTranscript, getIntakeDetails }) => {
      // Re-save through the same path so the Supabase write-through fires;
      // pass through any transcript already on this case so we don't
      // overwrite it with an empty array if this call fires first.
      const already = getIntakeDetails(caseId);
      if (already?.intakeTranscript?.length) {
        saveIntakeTranscript(caseId, already.intakeTranscript);
      }
    }).catch(() => {});
  } catch {}
}
