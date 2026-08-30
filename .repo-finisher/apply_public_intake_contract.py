from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# ── intakeStore: public writes send a routing capability, never firm_id ──────
replace_once(
    "services/intakeStore.ts",
    "  firmId?: string;\n  completion: 'partial' | 'complete' | 'abandoned';",
    "  routeToken?: string;\n  completion: 'partial' | 'complete' | 'abandoned';",
)
replace_once(
    "services/intakeStore.ts",
    "  recordingSeconds?: number;\n  clientInviteId?: string;\n}",
    "  recordingSeconds?: number;\n}",
)
replace_once(
    "services/intakeStore.ts",
    "  const firmId = resolveIntakeFirmIdOrNull(args.firmId);\n  if (!firmId) {\n    console.warn('[intakeStore] progress not saved — no firm could be resolved');\n    return null;\n  }\n\n  const intake = args.intake || {};",
    "  const routeToken = (\n    args.routeToken ||\n    ((import.meta.env.VITE_PUBLIC_INTAKE_TOKEN as string | undefined) || '')\n  ).trim();\n\n  const intake = args.intake || {};",
)
replace_once(
    "services/intakeStore.ts",
    "  if (args.recordingSeconds) payload.recording_seconds = args.recordingSeconds;\n  if (args.clientInviteId) payload.client_invite_id = args.clientInviteId;\n\n  const { data, error } = await supabase.rpc('upsert_public_intake', {\n    p_resume_token: args.resumeToken,\n    p_firm_id: firmId,",
    "  if (args.recordingSeconds) payload.recording_seconds = args.recordingSeconds;\n\n  const { data, error } = await supabase.rpc('upsert_public_intake', {\n    p_resume_token: args.resumeToken,\n    p_route_token: routeToken,",
)

# ── clientInviteStore: public response is minimized; completion is token-bound ─
replace_once(
    "services/clientInviteStore.ts",
    "  client_phone: string;\n  notes: string;\n  is_client_invite: boolean;",
    "  client_phone: string;\n  invite_status: string;\n  intake_mode: 'voice' | 'chat' | 'form' | '';\n  preferred_language: 'en' | 'es';\n  is_client_invite: boolean;",
)
replace_once(
    "services/clientInviteStore.ts",
    "    client_phone: isClientInvite ? String(row.client_phone || '') : '',\n    notes: isClientInvite ? String(row.notes || '') : '',\n    is_client_invite: isClientInvite,",
    "    client_phone: isClientInvite ? String(row.client_phone || '') : '',\n    invite_status: isClientInvite ? String(row.invite_status || '') : '',\n    intake_mode: isClientInvite && ['voice', 'chat', 'form'].includes(String(row.intake_mode || ''))\n      ? String(row.intake_mode) as 'voice' | 'chat' | 'form'\n      : '',\n    preferred_language: row.preferred_language === 'es' ? 'es' : 'en',\n    is_client_invite: isClientInvite,",
)
replace_once(
    "services/clientInviteStore.ts",
    "export const markInviteCompleted = async (inviteId: string, intakeCaseId: string): Promise<void> => {",
    "export const markInviteCompleted = async (token: string, intakeCaseId: string): Promise<void> => {",
)
replace_once(
    "services/clientInviteStore.ts",
    "  const { error } = await supabase.rpc('complete_client_invite', {\n    p_invite_id: inviteId,\n    p_intake_case_id: intakeCaseId,",
    "  const { error } = await supabase.rpc('complete_client_invite', {\n    p_token: token.trim(),\n    p_intake_case_id: intakeCaseId,",
)

# ── PublicIntake: carry the route token to every write, never public notes ────
replace_once(
    "components/PublicIntake.tsx",
    "  submitIntake, saveIntakeProgress, resumeIntake, newResumeToken,",
    "  saveIntakeProgress, resumeIntake, newResumeToken,",
)
replace_once(
    "components/PublicIntake.tsx",
    "          // If mode wasn't explicitly set in URL, check notes metadata tag\n          if (!modeParam) {\n            const match = (invite.notes || '').match(/\\[mode:(voice|chat|form)\\]/);\n            if (match && ['voice', 'chat', 'form'].includes(match[1])) {\n              setMode(match[1] as any);\n            }\n          }",
    "          // If mode wasn't explicitly set in URL, use the bounded mode\n          // metadata returned by the public token resolver. Internal notes are\n          // deliberately never exposed to the browser.\n          if (!modeParam && invite.intake_mode) {\n            setMode(invite.intake_mode);\n          }",
)
replace_once(
    "components/PublicIntake.tsx",
    "        } else {\n          console.warn('[PublicIntake] Unknown token — intake will use default firm_id');\n        }",
    "        } else {\n          console.warn('[PublicIntake] Unknown or expired intake token');\n          setSubmitError('This intake link is invalid or expired. Please request a new link from the firm.');\n        }",
)
replace_once(
    "components/PublicIntake.tsx",
    "  const cleanNotes = clientInvite?.notes ? clientInvite.notes.replace(/\\[mode:(voice|chat|form)\\]/g, '').trim() : '';\n\n  // Force Maya to English unless the attorney explicitly noted they are hispanic/spanish speaking\n  const isHispanic = clientInvite?.notes?.toLowerCase().match(/\\b(hispanic|spanish)\\b/);\n  const storedLang = (isHispanic ? 'es' : 'en') as SupportedLanguage;",
    "  // Only the bounded language preference returned by the token resolver is\n  // public. Free-form attorney notes stay server-side.\n  const storedLang = (clientInvite?.preferred_language || 'en') as SupportedLanguage;",
)
replace_once(
    "components/PublicIntake.tsx",
    "Email on file: ${clientInvite.client_email}` : ''}${cleanNotes ? `\nAttorney notes: ${cleanNotes}` : ''}\n\nOpen with:",
    "Email on file: ${clientInvite.client_email}` : ''}\n\nOpen with:",
)

# Every checkpoint/finalization uses the URL capability token. Existing rows can
# still resume with only the resume token, but new rows cannot be created by a
# caller-selected firm id.
text_path = Path("components/PublicIntake.tsx")
text = text_path.read_text()
old_count = text.count("firmId: firmId ?? undefined,")
if old_count != 4:
    raise SystemExit(f"Expected 4 PublicIntake firmId checkpoint args, found {old_count}")
text = text.replace("firmId: firmId ?? undefined,", "routeToken: token,")
old_count = text.count("clientInviteId: clientInvite?.invite_id || undefined,")
if old_count != 3:
    raise SystemExit(f"Expected 3 PublicIntake clientInviteId checkpoint args, found {old_count}")
text = text.replace("clientInviteId: clientInvite?.invite_id || undefined,\n", "")
text_path.write_text(text)

# Non-voice public flows must use the same authorization RPC instead of direct
# anonymous table INSERT.
replace_once(
    "components/PublicIntake.tsx",
    "        const result = await submitIntake({\n          firmId:         firmId ?? undefined,\n          clientInviteId: clientInvite?.invite_id,\n          intake,\n          score: finalScore,\n          transcript: transcriptForSave,\n        });\n        intakeId = result?.id;",
    "        const id = await saveIntakeProgress({\n          resumeToken: resumeTokenRef.current,\n          routeToken: token,\n          completion: 'complete',\n          intake,\n          score: finalScore,\n          transcript: transcriptForSave,\n        });\n        intakeId = id || undefined;",
)
replace_once(
    "components/PublicIntake.tsx",
    "      if (clientInvite?.invite_id && intakeId) {\n        void markInviteCompleted(clientInvite.invite_id, intakeId);",
    "      if (clientInvite?.invite_id && token && intakeId) {\n        void markInviteCompleted(token, intakeId);",
)

# ── Generic /start intake: use the same RPC. The service falls back to the
# deployment's public intake token, or authenticated membership inside SQL.
replace_once(
    "components/IntakePage.tsx",
    "import { submitIntake } from '../services/intakeStore';",
    "import { saveIntakeProgress, newResumeToken } from '../services/intakeStore';",
)
replace_once(
    "components/IntakePage.tsx",
    "      await submitIntake({ intake: intakeData, score: intakeScore, transcript: transcriptForSave });",
    "      await saveIntakeProgress({\n        resumeToken: newResumeToken(),\n        completion: 'complete',\n        intake: intakeData,\n        score: intakeScore,\n        transcript: transcriptForSave,\n      });",
)

# ── Environment template: the general public intake token is a shareable
# capability, not a secret. It replaces firm_id as anonymous write authority.
replace_once(
    ".env.example",
    "VITE_FIRM_ID=\nVITE_STRIPE_PUBLISHABLE_KEY=",
    "VITE_FIRM_ID=\n# Shareable public intake capability for /intake and /start. This is browser-\n# readable by design; the server maps it to firm ownership. Never use firm_id\n# itself as anonymous write authorization.\nVITE_PUBLIC_INTAKE_TOKEN=\nVITE_STRIPE_PUBLISHABLE_KEY=",
)

print("Applied public intake authorization contract client changes")
