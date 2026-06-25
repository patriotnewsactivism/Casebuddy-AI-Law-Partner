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

### Events Currently Wired ✅
| Event | Hook | Workflow Triggered |
|-------|------|-------------------|
| Case Created | `onCaseCreated` | `new-case-intake` workflow |
| Case Updated (deadline) | `onCaseUpdated` | `trial-prep-30-days`, `jury-selection-prep` workflows |
| Discovery Received | `onDiscoveryReceived` | `discovery-response` workflow |
| Settlement Offer | `onSettlementOfferReceived` | `settlement-analysis` workflow |
| Deposition Scheduled | `onDepositionScheduled` | `witness-deposition-prep` workflow |
| Case Status Change | `onCaseStatusChanged` | `discovery-paralegal-pack`, `trial-prep-30-days` workflows |
| Intake Received | `onIntakeReceived` | Maya AI triage + notification |

### Monitoring Rules Currently Active ✅
- Deadline proximity alerts (30, 14, 7, 3, 1 days)
- Case strength decline detection
- Daily background analysis per active case
- Stale case detection (30+ days without updates)
- Deposition approaching (5 days)

## Gaps & Opportunities

### 1. Missing Event Hooks
These UI actions don't trigger background workflows:

| Component | Missing Hook | Suggested Workflow |
|-----------|--------------|------------------|
| `EvidenceVault.tsx` | No auto-trigger on evidence upload completion | `evidence-intake` workflow |
| `FoiaCenter.tsx` | No workflow when FOIA marked as submitted | N/A (single-agency requests) |
| `DeadlineTracker.tsx` | No trigger when deadlines are added | Suggest scheduling follow-ups |
| `ClientUpdate.tsx` | Manual only, no automation | Could auto-draft based on case changes |
| `DraftingAssistant.tsx` | Manual only | Could auto-generate documents based on case stage |

### 2. Incomplete Automation Loops

#### 2.1 Intake → Case Conversion Missing
- When intake is marked "routed" or accepted, it creates a case
- **Missing**: Auto-trigger `client-onboarding` workflow after case creation
- **Missing**: Auto-trigger workflow based on matter type (e.g., `medical-records-demand` for PI)

#### 2.2 Evidence Analysis → Next Steps
- Evidence is analyzed but results aren't automatically actioned
- **Missing**: Auto-flag concerning evidence to Rex for credibility assessment
- **Missing**: Auto-suggest document drafting based on evidence content

#### 2.3 Workflow Completion → Automatic Actions
- Workflows complete but require manual follow-up
- **Missing**: Auto-email drafted docs to client (requires email integration)
- **Missing**: Auto-schedule related deadlines
- **Missing**: Auto-update case status based on workflow outcomes

### 3. Background Task Scheduling Gaps

The `backgroundEngine.schedule()` function exists but isn't called for:
- **Evidence**: Schedule follow-ups when concerning evidence is found
- **Deadlines**: Auto-schedule deadline monitoring tasks when cases are created
- **Cross-case learning**: Schedule weekly similarity analysis between cases
- **Document expiration**: Track statute of limitations on evidence documents

### 4. Agent-to-Agent Automation

Current workflows execute sequentially/parallel but lack:
- **Conditional branching**: If Doc drafts a motion, auto-assign to Rex for objections
- **Feedback loops**: If analysis shows weakness, auto-assign follow-up research
- **Escalation**: If win probability drops below threshold, auto-alert attorney

## Proposed Enhancements

### Priority 1: Complete Intake-to-Case Automation

```typescript
// In IntakeInbox.tsx handleConvertToCase
const handleConvertToCase = (intake: IntakeCase) => {
  // ... existing code ...
  
  // NEW: Trigger matter-type specific workflow
  const wf = createWorkflow(intake.matter_type === 'Personal Injury' 
    ? 'medical-records-demand' 
    : 'client-onboarding', newCase.id);
  if (wf) orchestrator.executeWorkflowAsync(wf);
};
```

### Priority 2: Evidence-Driven Workflow Triggers

```typescript
// In EvidenceVault.tsx after analysis
const evidenceWorkflowTriggers = {
  medical_records: 'medical-records-demand',
  police_report: 'evidence-intake',
  financial: 'foia-pipeline', // For government financial records
};

if (analysis.concerns?.length > 0) {
  onEvidenceConcernsFound(activeCase.id, analysis).catch(() => {});
}
```

### Priority 3: Smart Deadline Management

Auto-wire from DeadlineTracker:
- When court date is added → schedule trial prep workflow
- When SOL deadline is added → schedule case intake workflow
- When any deadline passes → auto-alert + suggest next steps

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

The core automation engine is built but needs:
1. More event hooks wired to UI interactions
2. Smart deadline scheduling from case creation
3. Matter-type specific workflow routing after intake conversion
4. Evidence-driven next-step suggestions
5. Workflow outcome parsing for follow-up automation