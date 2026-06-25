# Automation Wiring Plan for CaseBuddy AI Law Firm

## Current State Analysis

The codebase has a robust foundation for AI-driven legal automation but several key connections are missing or incomplete:

### Existing Automation Infrastructure
- **BackgroundAgentEngine** (`services/backgroundAgentEngine.ts`): Scheduler-based task runner with priority queue
- **CaseMonitor** (`services/caseMonitor.ts`): Periodic case monitoring with configurable rules
- **AgentOrchestrator** (`services/agentOrchestrator.ts`): Multi-agent workflow execution engine
- **Workflows** (`services/workflows.ts`): 12 pre-defined workflow templates
- **CaseEventHooks** (`services/caseEventHooks.ts`): Event-triggered workflows (case creation, deadline proximity, intake)
- **NotificationManager** (`services/notificationManager.ts`): Smart notification system with batching
- **All operational from App.tsx**: Engines start on app mount

### Events Now Wired ✅
| Event | Hook | Workflow Triggered |
|-------|------|-------------------|
| Case Created | `onCaseCreated` | `new-case-intake` workflow |
| Case Updated (deadline) | `onCaseUpdated` | `trial-prep-30-days`, `jury-selection-prep` workflows |
| Discovery Received | `onDiscoveryReceived` | `discovery-response` workflow |
| Settlement Offer | `onSettlementOfferReceived` | `settlement-analysis` workflow |
| Deposition Scheduled | `onDepositionScheduled` | `witness-deposition-prep` workflow |
| Case Status Change | `onCaseStatusChanged` | `discovery-paralegal-pack`, `trial-prep-30-days` workflows |
| Intake Received | `onIntakeReceived` | Maya AI triage + notification |
| Evidence Concerns Found | `onEvidenceConcernsFound` | `evidence-intake` workflow |
| Deadline Added | `onDeadlineAdded` | Trial prep / jury selection / intake workflows |

### Gaps & Opportunities (Remaining)
These UI actions still need hooks:
| Component | Missing Hook | Suggested Workflow |
|-----------|--------------|------------------|
| `FoiaCenter.tsx` | No workflow when FOIA marked as submitted | N/A (single-agency requests) |
| `ClientUpdate.tsx` | Manual only, no automation | Could auto-draft based on case changes |
| `DraftingAssistant.tsx` | Manual only | Could auto-generate documents based on case stage |

## Completed Implementation

### Priority 1: Intake-to-Case Automation ✅
Modified `IntakeInbox.tsx` to trigger matter-type specific workflows after case conversion:
- Personal Injury → `medical-records-demand` workflow
- Criminal → `client-onboarding` workflow
- Immigration → `immigration-petition-prep` workflow
- Estate Probate → `estate-inventory` workflow
- Others → `client-onboarding` workflow

### Priority 2: Evidence-Driven Workflow Triggers ✅
Added `onEvidenceConcernsFound` hook to `caseEventHooks.ts` that triggers `evidence-intake` workflow.
Wired in `EvidenceVault.tsx` to call the hook when evidence analysis reveals concerns.

### Priority 3: Smart Deadline Management ✅
Added `onDeadlineAdded` hook to `caseEventHooks.ts` that triggers:
- Trial/hearing dates → `trial-prep-30-days` (at 30 days) and `jury-selection-prep` (at 10 days)
- Statute of limitations → `new-case-intake` (within 60 days)
Wired in `DeadlineTracker.tsx` for both manual deadline additions and SOL calculator results.

## Proposed Enhancements (Remaining)

### Priority 4: Workflow Chaining Based on Outcomes
In `agentOrchestrator.ts`, after workflow completion:
- Parse outputs for action keywords
- Auto-schedule follow-up workflows
- Update case with derived intelligence

### Priority 5: Background Research Scheduling
Add to `caseMonitor.ts`:
- Weekly similarity analysis between active cases
- Monthly precedent updates for each case type
- Quarterly strategy refresh workflows

## Implementation Notes

### Database/Storage Considerations
- Workflows persist to `cb_workflows` localStorage
- Background tasks persist to `cb_bg_tasks`
- Consider Supabase cloud sync for multi-device consistency
- Agent memory uses IndexedDB (`casebuddy_agent_memory`)

### Notification Strategy
- Critical alerts (deadline, strength drop) → immediate toast
- Workflow completion → notification center
- Agent status changes → optional toast

### Configuration Flags
All automation controlled via `config/agentConfig.ts`:
- `background.enabled` - Master toggle
- `monitoring.enabled` - Periodic checks
- `workflows.enabled` - Workflow execution
- Individual rule toggles per rule type

## Summary

The core automation engine has been strengthened with:
1. `onEvidenceConcernsFound` hook for evidence-driven workflows
2. `onDeadlineAdded` hook for smart deadline triggers
3. Matter-type specific workflow routing after intake conversion
4. Evidence concerns now auto-trigger Rex's credibility assessment