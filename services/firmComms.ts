import { IntakeData, IntakeScore } from '../types';
import { sendEmail } from './integrationService';
import { agentIdentity, agentEmail, FIRM_EMAIL } from '../agents/firmEmail';
import { getSpecialistById } from '../agents/personas';

// Automated firm correspondence. These run best-effort: a failed send (e.g.
// email not configured in this environment) must never break the user flow, so
// every function swallows errors and reports a boolean.

const esc = (s: string): string =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const row = (label: string, value?: string): string =>
  value && value.trim()
    ? `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;white-space:nowrap;font-size:13px;">${label}</td><td style="padding:4px 0;color:#1a1a1a;font-size:13px;">${esc(value)}</td></tr>`
    : '';

const list = (heading: string, items?: string[]): string =>
  items && items.length
    ? `<h3 style="font-size:14px;color:#333;margin:18px 0 6px;">${heading}</h3><ul style="margin:0;padding-left:18px;font-size:13px;color:#1a1a1a;">${items
        .map(i => `<li style="margin:2px 0;">${esc(i)}</li>`)
        .join('')}</ul>`
    : '';

const intakeReportHtml = (intake: IntakeData, score: IntakeScore): string => {
  const timeline =
    intake.timeline && intake.timeline.length
      ? `<h3 style="font-size:14px;color:#333;margin:18px 0 6px;">Timeline</h3><ul style="margin:0;padding-left:18px;font-size:13px;color:#1a1a1a;">${intake.timeline
          .map(t => `<li style="margin:2px 0;">${t.date ? `<strong>${esc(t.date)}:</strong> ` : ''}${esc(t.event)}</li>`)
          .join('')}</ul>`
      : '';
  const parties =
    intake.parties && intake.parties.length
      ? `<h3 style="font-size:14px;color:#333;margin:18px 0 6px;">Parties</h3><ul style="margin:0;padding-left:18px;font-size:13px;color:#1a1a1a;">${intake.parties
          .map(p => `<li style="margin:2px 0;">${esc(p.name)}${p.role ? ` — ${esc(p.role)}` : ''}</li>`)
          .join('')}</ul>`
      : '';

  return `
    <div style="background:#faf8f2;border:1px solid #e7e0cf;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
      <span style="font-size:12px;color:#8a6d1b;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;">
        Score ${score.score}/100 · ${score.disposition} · ${score.urgency} urgency
      </span>
    </div>
    <table style="border-collapse:collapse;margin-bottom:8px;">
      ${row('Client', intake.fullName)}
      ${row('Contact', intake.contact)}
      ${row('Matter', intake.matterType)}
      ${row('Jurisdiction', intake.jurisdiction)}
      ${row('Incident date', intake.incidentDate)}
      ${row('Opposing', intake.opposingParties)}
      ${row('Deadlines', intake.deadlines)}
      ${row('Injuries / damages', intake.injuriesOrDamages)}
      ${row('Financial impact', intake.financialImpact)}
      ${row('Desired outcome', intake.desiredOutcome)}
      ${row('Prior counsel', intake.priorCounsel)}
      ${row('Witnesses', intake.witnesses)}
      ${row('Evidence', intake.evidenceMentioned)}
      ${row('Prior legal action', intake.priorLegalActions)}
    </table>

    ${intake.detailedNarrative ? `<h3 style="font-size:14px;color:#333;margin:18px 0 6px;">Narrative</h3><p style="font-size:13px;color:#1a1a1a;white-space:pre-line;">${esc(intake.detailedNarrative)}</p>` : ''}
    ${list('Key facts', intake.keyFacts)}
    ${timeline}
    ${parties}
    ${list('In their own words', (intake.clientQuotes || []).map(q => `“${q}”`))}
    ${list('Follow-up needed', intake.openQuestions)}
  `;
};

/**
 * A short, warm, client-facing recap of what they told Maya — NOT the
 * internal score/urgency/routing details (those stay confidential to the
 * firm). Grounded only in fields the client actually gave.
 */
const clientSynopsisHtml = (intake: IntakeData): string => {
  const bits: string[] = [];
  if (intake.matterType) bits.push(`a <strong>${esc(intake.matterType)}</strong> matter`);
  if (intake.incidentDate) bits.push(`from around <strong>${esc(intake.incidentDate)}</strong>`);
  if (intake.opposingParties) bits.push(`involving ${esc(intake.opposingParties)}`);
  const openLine = bits.length
    ? `Here's a quick recap of what you shared with Maya: you reached out about ${bits.join(', ')}.`
    : `Here's a quick recap of what you shared with Maya.`;

  const narrative = intake.detailedNarrative || intake.summary;

  return `
    <p style="font-size:14px;">${openLine}</p>
    ${narrative ? `<div style="background:#faf8f2;border:1px solid #e7e0cf;border-radius:8px;padding:14px 16px;margin:16px 0;"><p style="font-size:13px;color:#1a1a1a;white-space:pre-line;margin:0;">${esc(narrative)}</p></div>` : ''}
    ${intake.desiredOutcome ? `<p style="font-size:13px;color:#444;">You mentioned you're hoping for: <strong>${esc(intake.desiredOutcome)}</strong>.</p>` : ''}
  `;
};

/**
 * On a new intake, confirm receipt directly with the prospective client:
 * a rehashed synopsis of what they told Maya, plus a plain confirmation that
 * it's now with the firm for review. Sent to the email address collected
 * during intake — best-effort, never blocks the intake flow.
 */
export const emailClientIntakeConfirmation = async (intake: IntakeData, score: IntakeScore): Promise<boolean> => {
  const to = (intake.email || '').trim();
  if (!to || !/.+@.+\..+/.test(to)) return false;
  try {
    const firstName = (intake.fullName || '').split(' ')[0] || 'there';
    const html = `
      <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
        <h2 style="color:#333;border-bottom:2px solid #c9a84c;padding-bottom:8px;">We've got your intake, ${esc(firstName)}</h2>
        <p style="font-size:14px;">Hi ${esc(firstName)}, thanks for taking the time to speak with Maya. Your intake is now with our team for review, and one of our attorneys will follow up with you soon${intake.phone ? ` at ${esc(intake.phone)}` : ''}.</p>
        ${clientSynopsisHtml(intake)}
        <p style="font-size:13px;color:#444;">${esc(score.clientMessage || "If anything above doesn't look right, or you'd like to add more detail, just reply to this email.")}</p>
        <hr style="margin-top:28px;border-color:#eee;" />
        <p style="font-size:11px;color:#999;">— Maya, Case Intake · CaseBuddy Law. This confirms receipt only and is not legal advice.</p>
      </div>`;
    await sendEmail({
      to: [to],
      subject: `We've received your intake, ${firstName} — here's a recap`,
      html,
      fromAgentId: 'maya',
      replyTo: agentIdentity('maya').email,
    });
    return true;
  } catch {
    return false;
  }
};

/**
 * On a new intake, Maya emails the routed specialist (and the firm line) a
 * complete handoff so the right attorney has the case on the record immediately.
 * Best-effort: returns false if email isn't configured or the send fails.
 */
export const emailIntakeHandoff = async (intake: IntakeData, score: IntakeScore): Promise<boolean> => {
  try {
    const specialist = getSpecialistById(score.recommendedAgentId);
    // Dedupe: when there's no routed specialist, both entries are FIRM_EMAIL and
    // the send path doesn't dedupe recipients — which would double-send.
    const to = Array.from(new Set([
      specialist ? agentEmail(specialist.id) : FIRM_EMAIL,
      FIRM_EMAIL,
    ]));
    const greetingName = specialist ? specialist.name.split(' ')[0] : 'team';
    const html = `
      <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
        <h2 style="color:#333;border-bottom:2px solid #c9a84c;padding-bottom:8px;">New client intake — ${esc(intake.fullName)}</h2>
        <p style="font-size:14px;">Hi ${esc(greetingName)}, I just finished an intake call and it's routing to your desk. Full report below — ${score.urgency === 'high' ? '<strong>flagged high urgency.</strong>' : 'please review when you can.'}</p>
        ${intakeReportHtml(intake, score)}
        <hr style="margin-top:28px;border-color:#eee;" />
        <p style="font-size:11px;color:#999;">— Maya, Case Intake · CaseBuddy Law. Attorney-client privileged &amp; confidential.</p>
      </div>`;
    await sendEmail({
      to,
      subject: `New intake — ${intake.fullName} · ${intake.matterType} (score ${score.score})`,
      html,
      fromAgentId: 'maya',
      replyTo: agentIdentity('maya').email,
    });
    return true;
  } catch {
    return false;
  }
};
