import { getSupabase, INTAKE_TABLE } from './supabaseClient';
import { sendEmail } from './integrationService';
import { pushNotification } from './notificationManager';
import { fetchAbandonedIntakes } from './intakeStore';
import { IntakeCase, IntakeData } from '../types';

/**
 * Abandoned-intake recovery.
 *
 * When a caller drops off before Maya finishes, the partial record already
 * carries whatever she had collected. Maya's live procedure takes name, phone
 * and email *before* the story, so a mid-story drop-off almost always leaves a
 * contactable person — which is what makes recovery worth doing at all.
 *
 * Two things happen, deliberately in this order:
 *   1. the firm is notified, so a human can act immediately;
 *   2. the prospect gets one emailed invitation to pick up where they left off.
 *
 * The prospect is emailed at most MAX_FOLLOWUPS times. Chasing someone who has
 * declined twice is not lead recovery, it is harassment, and for a law firm it
 * is a bar-complaint risk.
 */

/** How long a call must be silent before it counts as abandoned. */
export const ABANDON_IDLE_MINUTES = 10;

/** Hard cap on automated emails to one prospect. */
export const MAX_FOLLOWUPS = 2;

/** Minimum gap between the first and second attempt. */
export const FOLLOWUP_SPACING_HOURS = 24;

export const resumeLink = (resumeToken: string): string => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/intake?resume=${encodeURIComponent(resumeToken)}`;
};

const firstName = (fullName: string): string => {
  const trimmed = (fullName || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'prospective client') return 'there';
  return trimmed.split(/\s+/)[0];
};

/** Best contact address we hold, preferring an explicit email field. */
export const contactEmail = (intake: IntakeCase): string | null => {
  const detail = (intake.intake || {}) as Partial<IntakeData>;
  const candidates = [detail.email, intake.contact, detail.contact];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value.includes('@') && value.length > 4) return value;
  }
  return null;
};

const followupHtml = (intake: IntakeCase, link: string): string => `
  <div style="font-family: Georgia, serif; max-width: 620px; margin: 0 auto; color: #1a1a1a; line-height: 1.6;">
    <h2 style="color: #333; border-bottom: 2px solid #c9a84c; padding-bottom: 8px;">Let's finish where we left off</h2>
    <p>Hi ${firstName(intake.full_name)},</p>
    <p>
      We started going through your matter earlier and got cut off before I had
      the full picture. Nothing you told me was lost &mdash; I still have it.
    </p>
    <p>
      When you have a few minutes, you can pick up exactly where we stopped:
    </p>
    <p style="margin: 24px 0;">
      <a href="${link}"
         style="background:#c9a84c;color:#1a1a1a;padding:12px 22px;border-radius:4px;
                text-decoration:none;font-weight:bold;">Continue my intake</a>
    </p>
    <p>
      If your situation has a court date or a filing deadline coming up, please
      say so as soon as you can &mdash; timing matters more than anything else
      in these cases.
    </p>
    <p>&mdash; Maya, Client Intake</p>
    <hr style="margin-top: 32px; border-color: #eee;" />
    <p style="font-size: 12px; color: #777;">
      This message is about an intake you started with our firm. It is not legal
      advice, and no attorney-client relationship is created by it.
    </p>
  </div>
`;

/** Tell the firm a prospect dropped off, whether or not we can email them. */
export function notifyFirmOfAbandonedIntake(intake: IntakeCase): void {
  const detail = (intake.intake || {}) as Partial<IntakeData>;
  const reachable = contactEmail(intake);
  const known = [
    detail.matterType || intake.matter_type,
    detail.jurisdiction || intake.jurisdiction,
    detail.summary || intake.summary,
  ].filter(Boolean).join(' · ');

  pushNotification({
    agentId: 'maya',
    caseId: intake.id,
    caseTitle: `${intake.full_name} (unfinished intake)`,
    type: 'insight',
    priority: intake.urgency === 'high' ? 'high' : 'medium',
    title: `Unfinished intake: ${intake.full_name}`,
    message:
      `This caller stopped before the intake was complete.\n\n` +
      `Contact: ${intake.contact || 'not captured'}\n` +
      `What we have: ${known || 'very little — they left early'}\n` +
      (reachable
        ? `Maya can email them a link to resume.`
        : `No usable email captured — this one needs a human to reach out.`),
    actions: [{ label: 'Open Intake Inbox', route: '/app/intake-inbox' }],
  });
}

const eligibleForEmail = (intake: IntakeCase): boolean => {
  const count = Number(intake.followup_count || 0);
  if (count >= MAX_FOLLOWUPS) return false;

  const last = intake.followup_last_at;
  if (last) {
    const elapsedHours = (Date.now() - new Date(last).getTime()) / 3_600_000;
    if (elapsedHours < FOLLOWUP_SPACING_HOURS) return false;
  }
  return true;
};

/**
 * Reach back out about one unfinished intake. Always notifies the firm; emails
 * the prospect only when we hold an address, have a resume token, and have not
 * already exhausted the attempt cap.
 */
export async function followUpAbandonedIntake(
  intake: IntakeCase,
): Promise<{ notified: boolean; emailed: boolean; reason?: string }> {
  notifyFirmOfAbandonedIntake(intake);

  const token = intake.resume_token;
  const to = contactEmail(intake);

  if (!token) return { notified: true, emailed: false, reason: 'no resume token' };
  if (!to) return { notified: true, emailed: false, reason: 'no email captured' };
  if (!eligibleForEmail(intake)) return { notified: true, emailed: false, reason: 'attempt cap reached' };

  try {
    await sendEmail({
      to,
      subject: 'Picking your intake back up',
      html: followupHtml(intake, resumeLink(token)),
      fromAgentId: 'maya',
    });
  } catch (err) {
    console.warn('[intakeFollowup] email failed:', err);
    return { notified: true, emailed: false, reason: 'send failed' };
  }

  const supabase = getSupabase();
  if (supabase) {
    await supabase
      .from(INTAKE_TABLE)
      .update({
        followup_count: Number(intake.followup_count || 0) + 1,
        followup_last_at: new Date().toISOString(),
        completion_state: 'abandoned',
      })
      .eq('id', intake.id);
  }

  return { notified: true, emailed: true };
}

/**
 * Sweep every intake that has gone quiet and act on it. Safe to call
 * repeatedly — the attempt cap and spacing rules make it idempotent in effect.
 */
export async function sweepAbandonedIntakes(): Promise<{ reviewed: number; emailed: number }> {
  const stale = await fetchAbandonedIntakes(ABANDON_IDLE_MINUTES);
  let emailed = 0;

  for (const intake of stale) {
    try {
      const result = await followUpAbandonedIntake(intake);
      if (result.emailed) emailed += 1;
    } catch (err) {
      console.warn('[intakeFollowup] sweep failed for', intake.id, err);
    }
  }

  return { reviewed: stale.length, emailed };
}
