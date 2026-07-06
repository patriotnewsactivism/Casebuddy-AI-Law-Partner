# AI Agent Automation Enhancement Plan

## Executive Summary

Transform CaseBuddy's 8 operational agents (Maya, Lex, Doc, Rex, Sol, Sierra, Jules, Max) and 12 legal specialists into fully autonomous, proactive, and deeply reasoning AI employees through multi-agent orchestration, background processing, persistent memory, chain-of-thought reasoning, and intelligent task automation.

**Current State:**
- Agents are reactive (user must initiate every interaction)
- No persistent agent memory across sessions
- No proactive case monitoring or alerts
- Limited reasoning depth (single-shot inference)
- No inter-agent collaboration
- Manual task triggering only

**Target State:**
- Autonomous agents that proactively monitor cases, execute tasks, and alert users
- Multi-agent orchestration with workflow coordination
- Extended reasoning modes for complex analysis
- Persistent long-term memory per agent
- Background automation engine
- Real-time collaboration and hand-offs between agents

---

## Phase 1: Agent Memory & Context System

### 1.1 Persistent Agent Memory Architecture

**Goal:** Each agent maintains persistent memory of cases, interactions, insights, and learned patterns.

**Implementation:**

```typescript
// NEW: services/agentMemory.ts

interface AgentMemory {
  agentId: string;
  caseId: string;
  shortTermMemory: {
    recentActions: AgentAction[];
    workingContext: Record<string, any>;
    pendingTasks: Task[];
  };
  longTermMemory: {
    caseInsights: Insight[];
    patterns: Pattern[];
    recommendations: Recommendation[];
    interactionHistory: Interaction[];
  };
  relationships: {
    // Track collaboration with other agents
    handoffs: Handoff[];
    sharedContext: Record<string, any>;
  };
}

class AgentMemoryManager {
  // Load agent memory from localStorage + IndexedDB
  loadMemory(agentId: string, caseId: string): AgentMemory;
  
  // Update agent memory
  updateMemory(agentId: string, caseId: string, updates: Partial<AgentMemory>): void;
  
  // Retrieve relevant memories for context injection
  getRelevantContext(agentId: string, query: string, limit: number): MemoryFragment[];
  
  // Consolidate short-term to long-term (background task)
  consolidateMemory(agentId: string, caseId: string): Promise<void>;
}
```

**Storage Strategy:**
- **Short-term:** localStorage (fast access, ephemeral)
- **Long-term:** IndexedDB (structured, queryable, persistent)
- **Sync strategy:** Write-through cache with background consolidation

**Memory Injection:**
- Before each agent call, inject last 5 relevant interactions + top 10 insights
- Context window management: prioritize recent + high-relevance memories
- Automatic summarization when memory exceeds token budget

**Files to Create:**
- `services/agentMemory.ts` - Core memory manager
- `utils/indexedDBAdapter.ts` - IndexedDB wrapper for long-term storage
- `types.ts` - Add `AgentMemory`, `AgentAction`, `Insight`, `Pattern` types

**Files to Modify:**
- `components/LegalTeam.tsx` - Inject memory context into consultations
- `services/geminiService.ts` - Update `consultSpecialist` to use memory
- `components/AICopilot.tsx` - Load relevant memories before responses

---

### 1.2 Extended Reasoning Modes

**Goal:** Enable agents to "think deeply" on complex tasks via chain-of-thought, multi-step reasoning, and self-critique loops.

**Implementation:**

```typescript
// NEW: services/agentReasoning.ts

type ReasoningMode = 'standard' | 'deep-think' | 'expert-panel' | 'adversarial';

interface ReasoningConfig {
  mode: ReasoningMode;
  steps?: number;              // For chain-of-thought
  temperature?: number;
  maxTokens?: number;
  selfCritique?: boolean;      // Agent critiques its own output
  multiPerspective?: boolean;  // Run from multiple angles
}

async function deepReasoningChain(
  agentId: string,
  task: string,
  caseContext: string,
  config: ReasoningConfig
): Promise<ReasoningResult> {
  const agent = getAgentById(agentId);
  const memory = loadMemory(agentId, caseContext);
  
  switch (config.mode) {
    case 'deep-think':
      // Multi-step chain-of-thought with extended thinking
      return await chainOfThoughtReasoning(agent, task, memory, config);
    
    case 'expert-panel':
      // Simulate panel of 3-5 legal specialists debating
      return await expertPanelReasoning(task, caseContext, config);
    
    case 'adversarial':
      // Red team vs. blue team analysis
      return await adversarialReasoning(agent, task, memory, config);
    
    default:
      // Standard single-shot inference
      return await standardReasoning(agent, task, memory);
  }
}

async function chainOfThoughtReasoning(
  agent: Agent,
  task: string,
  memory: AgentMemory,
  config: ReasoningConfig
): Promise<ReasoningResult> {
  const steps: ReasoningStep[] = [];
  let workingContext = { task, facts: [], hypotheses: [] };
  
  // Step 1: Decompose task
  const decomposition = await deepseekChat({
    systemInstruction: `${agent.systemInstruction}\n\nDecompose this complex legal task into 3-5 sequential subtasks.`,
    messages: [{ role: 'user', content: task }],
    jsonMode: true
  });
  const subtasks = parseDeepSeekJson<string[]>(decomposition, []);
  
  // Step 2: Execute each subtask with reflection
  for (const subtask of subtasks) {
    const stepResult = await deepseekChat({
      systemInstruction: agent.systemInstruction,
      messages: [
        { role: 'user', content: subtask },
        { role: 'assistant', content: `Let me think step by step:\n\n` }
      ],
      temperature: 0.4,
      maxTokens: 2048
    });
    
    steps.push({ subtask, reasoning: stepResult });
    workingContext.facts.push(...extractFacts(stepResult));
  }
  
  // Step 3: Synthesize final answer
  const synthesis = await deepseekChat({
    systemInstruction: `${agent.systemInstruction}\n\nSynthesize the step-by-step analysis into a final recommendation.`,
    messages: [
      { role: 'user', content: task },
      { role: 'assistant', content: `Step-by-step analysis:\n${steps.map(s => s.reasoning).join('\n\n')}` },
      { role: 'user', content: 'Now provide your final synthesis and recommendation.' }
    ],
    temperature: 0.3
  });
  
  // Step 4: Self-critique (optional)
  let critique = null;
  if (config.selfCritique) {
    critique = await deepseekChat({
      systemInstruction: 'You are a critical legal reviewer. Identify weaknesses, gaps, and risks in this analysis.',
      messages: [
        { role: 'user', content: `Analysis:\n${synthesis}\n\nCritique this analysis. What's missing? What are the risks?` }
      ],
      temperature: 0.7
    });
  }
  
  return { steps, synthesis, critique, confidence: calculateConfidence(steps) };
}

async function expertPanelReasoning(
  task: string,
  caseContext: string,
  config: ReasoningConfig
): Promise<ReasoningResult> {
  // Run task through 3-5 relevant legal specialists simultaneously
  const relevantSpecialists = selectRelevantSpecialists(task, 3);
  
  const perspectives = await Promise.all(
    relevantSpecialists.map(specialist =>
      deepseekChat({
        systemInstruction: specialist.systemInstruction,
        messages: [{ role: 'user', content: `${task}\n\nCase Context: ${caseContext}` }],
        temperature: 0.7
      })
    )
  );
  
  // Synthesize panel consensus
  const consensus = await deepseekChat({
    systemInstruction: 'You are a senior legal strategist. Synthesize these expert perspectives into a unified recommendation.',
    messages: [
      {
        role: 'user',
        content: `Task: ${task}\n\nExpert Perspectives:\n${perspectives.map((p, i) => `${relevantSpecialists[i].name}: ${p}`).join('\n\n')}\n\nSynthesize into final recommendation.`
      }
    ],
    temperature: 0.4
  });
  
  return { perspectives, consensus, specialists: relevantSpecialists };
}
```

**Reasoning Mode Triggers:**
- **Standard:** Quick questions, simple drafts, routine tasks (<30s response time)
- **Deep-Think:** Complex motions, trial strategy, case-strength analysis (60-120s)
- **Expert-Panel:** Major decisions, settlement analysis, ethical dilemmas (90-180s)
- **Adversarial:** Risk assessment, attack surface analysis, pre-trial prep (120-240s)

**Files to Create:**
- `services/agentReasoning.ts` - Reasoning orchestrator
- `services/reasoningModes.ts` - Individual reasoning mode implementations
- `components/ReasoningIndicator.tsx` - UI component showing reasoning progress

**Files to Modify:**
- `components/LegalTeam.tsx` - Add reasoning mode selector
- `components/StrategyRoom.tsx` - Use deep-think for strategy generation
- `services/geminiService.ts` - Add reasoning mode parameter

---

## Phase 2: Autonomous Background Agents

### 2.1 Background Task Engine

**Goal:** Agents run proactively in background, monitoring cases, executing scheduled tasks, and alerting users to critical events.

**Implementation:**

```typescript
// NEW: services/backgroundAgentEngine.ts

interface BackgroundTask {
  id: string;
  agentId: string;
  caseId: string;
  taskType: 'monitor' | 'analyze' | 'draft' | 'alert' | 'research';
  schedule: 'immediate' | 'hourly' | 'daily' | 'on-event';
  trigger?: EventTrigger;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  createdAt: number;
  executedAt?: number;
}

class BackgroundAgentEngine {
  private taskQueue: PriorityQueue<BackgroundTask>;
  private activeWorkers: Map<string, Worker>;
  
  constructor() {
    this.taskQueue = new PriorityQueue();
    this.activeWorkers = new Map();
    this.startScheduler();
  }
  
  // Schedule a background task
  scheduleTask(task: BackgroundTask): string {
    const taskId = generateId();
    this.taskQueue.enqueue({ ...task, id: taskId });
    this.processQueue();
    return taskId;
  }
  
  // Process task queue
  private async processQueue(): Promise<void> {
    while (!this.taskQueue.isEmpty()) {
      const task = this.taskQueue.dequeue();
      await this.executeTask(task);
    }
  }
  
  // Execute individual task
  private async executeTask(task: BackgroundTask): Promise<void> {
    const agent = getAgentById(task.agentId);
    const memory = loadMemory(task.agentId, task.caseId);
    const caseContext = await loadCaseContext(task.caseId);
    
    try {
      task.status = 'running';
      
      switch (task.taskType) {
        case 'monitor':
          task.result = await this.monitorCase(agent, caseContext, memory);
          break;
        case 'analyze':
          task.result = await this.analyzeCase(agent, caseContext, memory);
          break;
        case 'draft':
          task.result = await this.draftDocument(agent, caseContext, memory);
          break;
        case 'alert':
          task.result = await this.checkAlerts(agent, caseContext, memory);
          break;
        case 'research':
          task.result = await this.conductResearch(agent, caseContext, memory);
          break;
      }
      
      task.status = 'completed';
      task.executedAt = Date.now();
      
      // Update agent memory with results
      updateMemory(task.agentId, task.caseId, {
        shortTermMemory: {
          recentActions: [{ type: task.taskType, result: task.result, timestamp: Date.now() }]
        }
      });
      
      // Notify user if result is urgent
      if (task.priority === 'urgent' || task.result.requiresAttention) {
        this.notifyUser(task);
      }
      
    } catch (error) {
      task.status = 'failed';
      console.error(`Background task ${task.id} failed:`, error);
    }
    
    // Persist task result
    await saveTaskResult(task);
  }
  
  // Monitor case for changes, deadlines, risks
  private async monitorCase(
    agent: Agent,
    caseContext: Case,
    memory: AgentMemory
  ): Promise<MonitorResult> {
    // Check deadlines (Sol's specialty)
    const deadlineAlerts = await checkDeadlines(caseContext);
    
    // Check case status changes
    const statusChanged = await detectStatusChange(caseContext, memory);
    
    // Identify new risks
    const newRisks = await identifyRisks(caseContext, memory);
    
    return { deadlineAlerts, statusChanged, newRisks, timestamp: Date.now() };
  }
  
  // Periodic case analysis
  private async analyzeCase(
    agent: Agent,
    caseContext: Case,
    memory: AgentMemory
  ): Promise<AnalysisResult> {
    return await deepReasoningChain(
      agent.id,
      'Analyze this case for strategic opportunities, risks, and next actions.',
      caseContext.summary,
      { mode: 'deep-think', steps: 5, selfCritique: true }
    );
  }
  
  // Auto-draft documents
  private async draftDocument(
    agent: Agent,
    caseContext: Case,
    memory: AgentMemory
  ): Promise<DraftResult> {
    // Doc agent pre-drafts common documents
    const systemInstruction = `${agent.systemInstruction}\n\nDraft this document based on case context. Mark sections [NEEDS REVIEW] where attorney input is required.`;
    
    const draft = await deepseekChat({
      systemInstruction,
      messages: [{ role: 'user', content: `Draft a discovery request for case: ${caseContext.title}` }],
      temperature: 0.4,
      maxTokens: 4096
    });
    
    return { draft, status: 'needs-review', timestamp: Date.now() };
  }
  
  // Start periodic scheduler
  private startScheduler(): void {
    setInterval(() => {
      this.runScheduledTasks();
    }, 60000); // Run every minute
  }
  
  private async runScheduledTasks(): Promise<void> {
    const scheduledTasks = await loadScheduledTasks();
    for (const task of scheduledTasks) {
      if (task.schedule === 'hourly' && isTimeToRun(task, 'hourly')) {
        this.scheduleTask(task);
      } else if (task.schedule === 'daily' && isTimeToRun(task, 'daily')) {
        this.scheduleTask(task);
      }
    }
  }
  
  // Notify user of urgent findings
  private notifyUser(task: BackgroundTask): void {
    const notification: Notification = {
      id: generateId(),
      agentId: task.agentId,
      caseId: task.caseId,
      title: `${getAgentById(task.agentId).name} Alert`,
      message: task.result.message || 'Task completed - requires your attention',
      priority: task.priority,
      timestamp: Date.now(),
      read: false
    };
    
    saveNotification(notification);
    showToast(notification);
  }
}

// Initialize background engine
export const backgroundEngine = new BackgroundAgentEngine();
```

**Background Task Types:**

1. **Case Monitoring (Sol, Maya, Max)**
   - Check deadlines every hour
   - Monitor court docket for updates
   - Track statute of limitations countdowns
   - Alert on filing deadlines 7 days, 3 days, 1 day out

2. **Proactive Analysis (Lex, Jules, Rex)**
   - Weekly case strength re-assessment
   - Jury pool analysis when voir dire approaches
   - Trial readiness checks 30/14/7 days before trial
   - Witness credibility re-evaluation

3. **Document Preparation (Doc, Sierra)**
   - Auto-draft routine motions when triggers fire
   - Pre-generate client update templates
   - Draft discovery responses when evidence is uploaded
   - Generate deposition outlines 3 days before scheduled date

4. **Research (Lex, Legal Specialists)**
   - Daily case law monitoring for relevant precedents
   - Jurisdiction-specific rule changes
   - Similar case tracking in the same court

**Files to Create:**
- `services/backgroundAgentEngine.ts` - Background task orchestrator
- `services/taskScheduler.ts` - Scheduling logic
- `utils/priorityQueue.ts` - Priority queue for task management
- `components/NotificationCenter.tsx` - UI for agent notifications
- `types.ts` - Add `BackgroundTask`, `MonitorResult`, `Notification` types

**Files to Modify:**
- `App.tsx` - Initialize background engine on app start
- `components/Dashboard.tsx` - Show active background tasks
- `components/AICopilot.tsx` - Surface background task results

---

### 2.2 Multi-Agent Orchestration & Hand-offs

**Goal:** Agents collaborate on complex tasks, hand off work to specialists, and coordinate workflows automatically.

**Implementation:**

```typescript
// NEW: services/agentOrchestrator.ts

interface AgentHandoff {
  fromAgentId: string;
  toAgentId: string;
  reason: string;
  context: Record<string, any>;
  timestamp: number;
}

interface Workflow {
  id: string;
  name: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  status: 'pending' | 'running' | 'completed' | 'failed';
}

interface WorkflowStep {
  agentId: string;
  action: string;
  inputs: Record<string, any>;
  outputs?: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
}

class AgentOrchestrator {
  // Execute multi-agent workflow
  async executeWorkflow(workflow: Workflow): Promise<WorkflowResult> {
    workflow.status = 'running';
    
    for (const step of workflow.steps) {
      step.status = 'running';
      
      try {
        const agent = getAgentById(step.agentId);
        const memory = loadMemory(step.agentId, workflow.context.caseId);
        
        // Execute step
        step.outputs = await this.executeStep(agent, step, memory, workflow.context);
        step.status = 'completed';
        
        // Pass outputs to next step
        if (workflow.steps.indexOf(step) < workflow.steps.length - 1) {
          const nextStep = workflow.steps[workflow.steps.indexOf(step) + 1];
          nextStep.inputs = { ...nextStep.inputs, ...step.outputs };
        }
        
      } catch (error) {
        step.status = 'failed';
        console.error(`Workflow step failed:`, error);
        
        // Attempt recovery or hand-off
        await this.handleStepFailure(workflow, step, error);
      }
    }
    
    workflow.status = 'completed';
    return { workflow, result: this.consolidateResults(workflow) };
  }
  
  // Execute individual workflow step
  private async executeStep(
    agent: Agent,
    step: WorkflowStep,
    memory: AgentMemory,
    context: Record<string, any>
  ): Promise<Record<string, any>> {
    // Inject previous step outputs into context
    const enrichedContext = { ...context, ...step.inputs };
    
    // Route to appropriate agent capability
    switch (step.action) {
      case 'analyze-case':
        return await analyzeCase(agent, enrichedContext);
      case 'draft-document':
        return await draftDocument(agent, enrichedContext);
      case 'research-law':
        return await researchLaw(agent, enrichedContext);
      case 'simulate-jury':
        return await simulateJury(agent, enrichedContext);
      default:
        throw new Error(`Unknown action: ${step.action}`);
    }
  }
  
  // Intelligent hand-off between agents
  async handoffToSpecialist(
    fromAgentId: string,
    task: string,
    caseContext: string
  ): Promise<HandoffResult> {
    // Determine best specialist for task
    const specialist = await selectBestSpecialist(task, caseContext);
    
    // Transfer context
    const handoff: AgentHandoff = {
      fromAgentId,
      toAgentId: specialist.id,
      reason: `Task requires expertise in ${specialist.practiceArea}`,
      context: { task, caseContext },
      timestamp: Date.now()
    };
    
    // Record handoff in both agents' memories
    updateMemory(fromAgentId, caseContext, {
      relationships: { handoffs: [handoff] }
    });
    updateMemory(specialist.id, caseContext, {
      relationships: { handoffs: [handoff] }
    });
    
    // Execute specialist consultation
    const result = await consultSpecialist(
      specialist.systemInstruction,
      [],
      task,
      caseContext
    );
    
    return { handoff, result, specialist };
  }
}

// Pre-defined workflows
export const WORKFLOWS: Record<string, Workflow> = {
  'new-case-intake': {
    id: 'new-case-intake',
    name: 'New Case Intake & Setup',
    trigger: { event: 'case-created' },
    steps: [
      { agentId: 'maya', action: 'extract-case-details', inputs: {} },
      { agentId: 'sol', action: 'calculate-deadlines', inputs: {} },
      { agentId: 'lex', action: 'preliminary-research', inputs: {} },
      { agentId: 'doc', action: 'draft-engagement-letter', inputs: {} },
      { agentId: 'sierra', action: 'schedule-initial-meeting', inputs: {} }
    ],
    status: 'pending'
  },
  
  'trial-prep-30-days': {
    id: 'trial-prep-30-days',
    name: '30-Day Trial Preparation',
    trigger: { event: 'trial-date-approaching', days: 30 },
    steps: [
      { agentId: 'rex', action: 'assess-trial-readiness', inputs: {} },
      { agentId: 'doc', action: 'draft-trial-brief', inputs: {} },
      { agentId: 'jules', action: 'analyze-jury-pool', inputs: {} },
      { agentId: 'rex', action: 'generate-witness-prep-schedule', inputs: {} },
      { agentId: 'max', action: 'organize-exhibit-list', inputs: {} }
    ],
    status: 'pending'
  },
  
  'discovery-response': {
    id: 'discovery-response',
    name: 'Discovery Request Response',
    trigger: { event: 'discovery-received' },
    steps: [
      { agentId: 'doc', action: 'analyze-discovery-requests', inputs: {} },
      { agentId: 'max', action: 'identify-responsive-documents', inputs: {} },
      { agentId: 'doc', action: 'draft-responses', inputs: {} },
      { agentId: 'doc', action: 'draft-objections', inputs: {} },
      { agentId: 'sol', action: 'set-response-deadline-alert', inputs: {} }
    ],
    status: 'pending'
  },
  
  'settlement-analysis': {
    id: 'settlement-analysis',
    name: 'Comprehensive Settlement Analysis',
    trigger: { event: 'settlement-offer-received' },
    steps: [
      { agentId: 'lex', action: 'analyze-offer-vs-precedent', inputs: {} },
      { agentId: 'jules', action: 'predict-trial-outcome', inputs: {} },
      { agentId: 'personal-injury', action: 'assess-damages-value', inputs: {} }, // Legal specialist
      { agentId: 'rex', action: 'assess-trial-strength', inputs: {} },
      { agentId: 'doc', action: 'draft-counteroffer', inputs: {} }
    ],
    status: 'pending'
  }
};

export const orchestrator = new AgentOrchestrator();
```

**Workflow Triggers:**
- **Event-based:** Case created, discovery received, trial date set, settlement offer
- **Time-based:** 30/14/7 days before trial, deadline approaching, statute running out
- **Condition-based:** Case strength < 50%, missing critical evidence, witness unavailable

**Agent Collaboration Patterns:**

1. **Maya → Legal Specialist:** Hand off intake to specialist based on practice area
2. **Lex → All Agents:** Share research findings with entire team
3. **Doc → Rex:** Draft document, get trial strategy input, revise
4. **Jules → Rex:** Jury analysis → trial prep recommendations
5. **Sol → All Agents:** Deadline alerts trigger coordinated action

**Files to Create:**
- `services/agentOrchestrator.ts` - Workflow orchestrator
- `services/workflows.ts` - Pre-defined workflow library
- `utils/workflowEngine.ts` - Workflow execution engine
- `components/WorkflowVisualizer.tsx` - UI to show active workflows

**Files to Modify:**
- `App.tsx` - Initialize orchestrator, register workflows
- `components/Dashboard.tsx` - Show active workflows
- `services/geminiService.ts` - Add workflow execution hooks

---

## Phase 3: Proactive Intelligence & Alerts

### 3.1 Real-Time Case Monitoring

**Goal:** Agents continuously monitor case state and external events, alerting users to critical changes.

**Implementation:**

```typescript
// NEW: services/caseMonitor.ts

interface MonitoringRule {
  id: string;
  agentId: string;
  name: string;
  condition: (caseState: Case, externalData: any) => boolean;
  action: (caseState: Case) => Promise<void>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

const MONITORING_RULES: MonitoringRule[] = [
  {
    id: 'deadline-7-days',
    agentId: 'sol',
    name: 'Deadline within 7 days',
    condition: (caseState) => {
      const deadline = parseDate(caseState.nextCourtDate);
      const daysUntil = daysBetween(Date.now(), deadline);
      return daysUntil <= 7 && daysUntil > 3;
    },
    action: async (caseState) => {
      await backgroundEngine.scheduleTask({
        agentId: 'sol',
        caseId: caseState.id,
        taskType: 'alert',
        schedule: 'immediate',
        priority: 'high'
      });
      await notifyUser({
        title: 'Sol Alert: Deadline Approaching',
        message: `Court date for ${caseState.title} is in ${daysBetween(Date.now(), caseState.nextCourtDate)} days`,
        priority: 'high'
      });
    },
    priority: 'high',
    enabled: true
  },
  
  {
    id: 'case-strength-drop',
    agentId: 'rex',
    name: 'Case win probability drops >10%',
    condition: (caseState) => {
      const previousWinProb = getPreviousWinProbability(caseState.id);
      return previousWinProb && (previousWinProb - caseState.winProbability) > 10;
    },
    action: async (caseState) => {
      await backgroundEngine.scheduleTask({
        agentId: 'rex',
        caseId: caseState.id,
        taskType: 'analyze',
        schedule: 'immediate',
        priority: 'urgent'
      });
      await notifyUser({
        title: 'Rex Alert: Case Strength Declined',
        message: `Win probability for ${caseState.title} dropped to ${caseState.winProbability}%. Analysis queued.`,
        priority: 'urgent'
      });
    },
    priority: 'critical',
    enabled: true
  },
  
  {
    id: 'new-precedent-found',
    agentId: 'lex',
    name: 'Relevant new case law published',
    condition: async (caseState, externalData) => {
      // Check CourtListener for new cases matching this case's legal issues
      const newCases = externalData.courtListener?.newCases || [];
      return newCases.some(c => isRelevantTo(c, caseState));
    },
    action: async (caseState) => {
      await backgroundEngine.scheduleTask({
        agentId: 'lex',
        caseId: caseState.id,
        taskType: 'research',
        schedule: 'immediate',
        priority: 'medium'
      });
      await notifyUser({
        title: 'Lex Alert: New Relevant Precedent',
        message: `Found new case law relevant to ${caseState.title}. Review recommended.`,
        priority: 'medium'
      });
    },
    priority: 'medium',
    enabled: true
  },
  
  {
    id: 'missing-critical-evidence',
    agentId: 'max',
    name: 'Critical evidence missing 14 days before trial',
    condition: (caseState) => {
      const daysUntilTrial = daysBetween(Date.now(), caseState.nextCourtDate);
      const hasCriticalEvidence = checkCriticalEvidence(caseState.id);
      return daysUntilTrial <= 14 && !hasCriticalEvidence;
    },
    action: async (caseState) => {
      await notifyUser({
        title: 'Max Alert: Missing Critical Evidence',
        message: `Trial for ${caseState.title} is in ${daysBetween(Date.now(), caseState.nextCourtDate)} days and critical evidence is missing!`,
        priority: 'critical'
      });
    },
    priority: 'critical',
    enabled: true
  },
  
  {
    id: 'jury-selection-prep',
    agentId: 'jules',
    name: 'Jury selection approaching',
    condition: (caseState) => {
      const daysUntilTrial = daysBetween(Date.now(), caseState.nextCourtDate);
      return daysUntilTrial === 10; // Start jury prep 10 days out
    },
    action: async (caseState) => {
      await backgroundEngine.scheduleTask({
        agentId: 'jules',
        caseId: caseState.id,
        taskType: 'analyze',
        schedule: 'immediate',
        priority: 'high'
      });
      await orchestrator.executeWorkflow({
        ...WORKFLOWS['trial-prep-30-days'],
        context: { caseId: caseState.id }
      });
    },
    priority: 'high',
    enabled: true
  }
];

class CaseMonitor {
  private monitoringInterval: number = 60000; // Check every minute
  private externalDataSources: ExternalDataSource[] = [];
  
  start(): void {
    setInterval(() => {
      this.runMonitoringCycle();
    }, this.monitoringInterval);
  }
  
  private async runMonitoringCycle(): Promise<void> {
    const activeCases = await loadActiveCases();
    const externalData = await this.fetchExternalData();
    
    for (const caseState of activeCases) {
      for (const rule of MONITORING_RULES) {
        if (rule.enabled && rule.condition(caseState, externalData)) {
          await rule.action(caseState);
          // Log rule execution
          logMonitoringEvent({
            ruleId: rule.id,
            caseId: caseState.id,
            timestamp: Date.now()
          });
        }
      }
    }
  }
  
  private async fetchExternalData(): Promise<any> {
    // Poll external sources (CourtListener, court dockets, etc.)
    const courtListenerData = await fetchCourtListenerUpdates();
    return { courtListener: courtListenerData };
  }
}

export const caseMonitor = new CaseMonitor();
```

**Monitoring Triggers:**
- **Deadline proximity:** 30/14/7/3/1 days before court date
- **Case state changes:** Win probability change, status updates, evidence added
- **External events:** New case law, docket updates, opposing counsel filings
- **Resource status:** Missing evidence, incomplete discovery, witness unavailability

**Files to Create:**
- `services/caseMonitor.ts` - Real-time monitoring engine
- `services/monitoringRules.ts` - Rule definitions
- `services/externalDataSources.ts` - External API integrations

**Files to Modify:**
- `App.tsx` - Start case monitor on app init
- `components/Dashboard.tsx` - Show monitoring status
- `components/NotificationCenter.tsx` - Display monitoring alerts

---

### 3.2 Smart Notification System

**Goal:** Context-aware notifications that intelligently batch, prioritize, and deliver agent alerts.

**Implementation:**

```typescript
// NEW: services/notificationManager.ts

interface SmartNotification {
  id: string;
  agentId: string;
  caseId: string;
  type: 'alert' | 'insight' | 'task-complete' | 'recommendation' | 'warning';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  actionable: boolean;
  actions?: NotificationAction[];
  timestamp: number;
  read: boolean;
  dismissed: boolean;
}

interface NotificationAction {
  label: string;
  action: () => Promise<void>;
}

class NotificationManager {
  private notifications: SmartNotification[] = [];
  private batchBuffer: SmartNotification[] = [];
  private batchTimeout: number = 300000; // 5 minutes
  
  // Add notification with intelligent batching
  addNotification(notification: SmartNotification): void {
    // Immediate delivery for critical alerts
    if (notification.priority === 'critical') {
      this.deliverImmediately(notification);
      return;
    }
    
    // Batch non-critical notifications
    this.batchBuffer.push(notification);
    
    // Deliver batch if high-priority or buffer full
    if (notification.priority === 'high' || this.batchBuffer.length >= 5) {
      this.deliverBatch();
    }
  }
  
  private deliverImmediately(notification: SmartNotification): void {
    this.notifications.push(notification);
    showToast({
      title: notification.title,
      message: notification.message,
      type: notification.priority === 'critical' ? 'error' : 'warning',
      duration: 10000
    });
    playNotificationSound();
  }
  
  private deliverBatch(): void {
    if (this.batchBuffer.length === 0) return;
    
    // Group by agent and case
    const grouped = groupBy(this.batchBuffer, n => `${n.agentId}-${n.caseId}`);
    
    for (const [key, notifs] of Object.entries(grouped)) {
      const agent = getAgentById(notifs[0].agentId);
      const summary = this.summarizeNotifications(notifs);
      
      showToast({
        title: `${agent.name} Updates (${notifs.length})`,
        message: summary,
        type: 'info',
        duration: 5000
      });
      
      this.notifications.push(...notifs);
    }
    
    this.batchBuffer = [];
  }
  
  private summarizeNotifications(notifs: SmartNotification[]): string {
    const highPriority = notifs.filter(n => n.priority === 'high');
    if (highPriority.length > 0) {
      return highPriority[0].message + (notifs.length > 1 ? ` (+${notifs.length - 1} more)` : '');
    }
    return `${notifs.length} updates available`;
  }
  
  // Get unread notifications
  getUnreadNotifications(): SmartNotification[] {
    return this.notifications.filter(n => !n.read && !n.dismissed);
  }
  
  // Mark notification as read
  markAsRead(id: string): void {
    const notif = this.notifications.find(n => n.id === id);
    if (notif) notif.read = true;
  }
  
  // Dismiss notification
  dismiss(id: string): void {
    const notif = this.notifications.find(n => n.id === id);
    if (notif) notif.dismissed = true;
  }
}

export const notificationManager = new NotificationManager();
```

**Notification Intelligence:**
- **Batching:** Non-critical notifications batched every 5 minutes
- **Prioritization:** Critical alerts bypass batching, delivered immediately
- **Contextual grouping:** Group by agent + case for clarity
- **Actionable:** Include quick actions (e.g., "Review Draft", "Approve Motion", "Schedule Call")
- **Quiet hours:** Respect user preferences for notification delivery times

**Files to Create:**
- `services/notificationManager.ts` - Smart notification system
- `components/NotificationCenter.tsx` - Notification inbox UI
- `components/NotificationToast.tsx` - Toast notification component

**Files to Modify:**
- `App.tsx` - Initialize notification manager
- `components/Layout.tsx` - Show notification badge in header

---

## Phase 4: Advanced Agent Capabilities

### 4.1 Agent Learning & Pattern Recognition

**Goal:** Agents learn from user interactions, case outcomes, and feedback to improve over time.

**Implementation:**

```typescript
// NEW: services/agentLearning.ts

interface LearningEvent {
  agentId: string;
  caseId: string;
  action: string;
  outcome: 'success' | 'failure' | 'neutral';
  userFeedback?: 'positive' | 'negative';
  context: Record<string, any>;
  timestamp: number;
}

interface Pattern {
  id: string;
  agentId: string;
  pattern: string;
  confidence: number;
  occurrences: number;
  lastSeen: number;
}

class AgentLearningEngine {
  // Record learning event
  recordEvent(event: LearningEvent): void {
    saveToMemory(event.agentId, event.caseId, {
      longTermMemory: {
        interactionHistory: [event]
      }
    });
    
    // Extract patterns
    this.extractPatterns(event);
  }
  
  // Extract patterns from events
  private extractPatterns(event: LearningEvent): void {
    // e.g., "When opposing counsel is aggressive (>80%), settlement offers are typically 60% of damages"
    // e.g., "Witnesses with <50 credibility score often contradict themselves after 10+ questions"
    // e.g., "Cases with <40% win probability settle 85% of the time"
    
    const patterns = identifyPatterns([event]);
    for (const pattern of patterns) {
      this.storePattern(event.agentId, pattern);
    }
  }
  
  // Store pattern in agent memory
  private storePattern(agentId: string, pattern: Pattern): void {
    const memory = loadMemory(agentId, '*');
    const existing = memory.longTermMemory.patterns.find(p => p.pattern === pattern.pattern);
    
    if (existing) {
      existing.occurrences++;
      existing.confidence = Math.min(100, existing.confidence + 5);
      existing.lastSeen = Date.now();
    } else {
      memory.longTermMemory.patterns.push(pattern);
    }
    
    updateMemory(agentId, '*', { longTermMemory: { patterns: memory.longTermMemory.patterns } });
  }
  
  // Get relevant patterns for context
  getRelevantPatterns(agentId: string, context: string): Pattern[] {
    const memory = loadMemory(agentId, '*');
    return memory.longTermMemory.patterns
      .filter(p => this.isRelevant(p, context))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  }
  
  private isRelevant(pattern: Pattern, context: string): boolean {
    // Simple relevance check (can be enhanced with embeddings)
    return context.toLowerCase().includes(pattern.pattern.toLowerCase().split(' ').slice(0, 3).join(' '));
  }
}

export const learningEngine = new AgentLearningEngine();
```

**Learning Sources:**
- **User feedback:** Thumbs up/down on agent responses
- **Case outcomes:** Win/loss, settlement amounts vs. predictions
- **Interaction patterns:** Which agent suggestions are followed vs. ignored
- **Document quality:** Drafts accepted vs. heavily edited
- **Time-to-resolution:** How long tasks take vs. predictions

**Files to Create:**
- `services/agentLearning.ts` - Learning engine
- `components/FeedbackButton.tsx` - Thumbs up/down on agent responses
- `utils/patternRecognition.ts` - Pattern extraction algorithms

**Files to Modify:**
- All agent interaction components - Add feedback buttons
- `services/geminiService.ts` - Record learning events after each call
- `components/LegalTeam.tsx` - Add feedback mechanism

---

### 4.2 Cross-Case Intelligence

**Goal:** Agents leverage insights from similar past cases to improve recommendations.

**Implementation:**

```typescript
// NEW: services/crossCaseIntelligence.ts

interface CaseVector {
  caseId: string;
  caseType: string;
  jurisdiction: string;
  outcome: string;
  winProbability: number;
  settlementAmount?: number;
  keyFactors: string[];
  embedding?: number[]; // If using vector embeddings
}

class CrossCaseIntelligenceEngine {
  // Find similar cases
  async findSimilarCases(caseId: string, limit: number = 5): Promise<CaseVector[]> {
    const currentCase = await loadCase(caseId);
    const allCases = await loadAllCases();
    
    // Calculate similarity scores
    const similarities = allCases.map(c => ({
      case: c,
      score: this.calculateSimilarity(currentCase, c)
    }));
    
    // Return top-k most similar
    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.case);
  }
  
  private calculateSimilarity(case1: Case, case2: Case): number {
    let score = 0;
    
    // Same case type +30
    if (case1.status === case2.status) score += 30;
    
    // Similar win probability +20
    const winProbDiff = Math.abs(case1.winProbability - case2.winProbability);
    score += Math.max(0, 20 - winProbDiff);
    
    // Same jurisdiction +25
    // (Would need jurisdiction field in Case type)
    
    // Keyword overlap in summary +25
    const keywords1 = extractKeywords(case1.summary);
    const keywords2 = extractKeywords(case2.summary);
    const overlap = keywords1.filter(k => keywords2.includes(k)).length;
    score += Math.min(25, overlap * 5);
    
    return score;
  }
  
  // Generate insights from similar cases
  async generateCrossCaseInsights(caseId: string): Promise<CrossCaseInsight[]> {
    const similarCases = await this.findSimilarCases(caseId, 10);
    
    // Extract patterns
    const avgWinProb = average(similarCases.map(c => c.winProbability));
    const avgSettlement = average(similarCases.filter(c => c.settlementAmount).map(c => c.settlementAmount!));
    const commonFactors = findCommonFactors(similarCases);
    
    return [
      {
        type: 'benchmark',
        title: 'Similar Case Win Rate',
        description: `Similar cases have an average win probability of ${avgWinProb.toFixed(1)}%`,
        confidence: 75
      },
      {
        type: 'benchmark',
        title: 'Settlement Range',
        description: `Similar cases settled for an average of $${avgSettlement.toLocaleString()}`,
        confidence: 70
      },
      {
        type: 'pattern',
        title: 'Success Factors',
        description: `Common success factors: ${commonFactors.join(', ')}`,
        confidence: 65
      }
    ];
  }
}

export const crossCaseIntelligence = new CrossCaseIntelligenceEngine();
```

**Cross-Case Features:**
- **Similar case finder:** "Cases like this one settled for $X"
- **Outcome prediction:** "Cases with these characteristics win Y% of the time"
- **Strategy recommendations:** "In similar cases, X tactic worked best"
- **Risk identification:** "Cases like this often fail due to Z"

**Files to Create:**
- `services/crossCaseIntelligence.ts` - Cross-case analysis engine
- `components/SimilarCases.tsx` - UI showing similar cases
- `utils/caseEmbeddings.ts` - Vector embeddings for semantic similarity (optional)

**Files to Modify:**
- `components/Dashboard.tsx` - Show similar cases widget
- `components/StrategyRoom.tsx` - Integrate cross-case insights
- `services/geminiService.ts` - Inject similar case data into agent context

---

## Phase 5: UI/UX Enhancements

### 5.1 Agent Status Dashboard

**Goal:** Real-time visibility into what agents are doing in the background.

**Implementation:**

```typescript
// NEW: components/AgentStatusDashboard.tsx

const AgentStatusDashboard: React.FC = () => {
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
  
  useEffect(() => {
    // Poll agent statuses every 5 seconds
    const interval = setInterval(async () => {
      const statuses = await backgroundEngine.getAgentStatuses();
      setAgentStatuses(statuses);
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <BrainCircuit className="text-gold-400" />
        AI Team Activity
      </h3>
      
      <div className="space-y-3">
        {agentStatuses.map(status => (
          <div key={status.agentId} className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${status.agent.bgClass}`}>
              {status.agent.emoji}
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{status.agent.name}</span>
                {status.isActive && (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <Loader size={12} className="animate-spin" />
                    Working
                  </span>
                )}
              </div>
              
              {status.currentTask ? (
                <p className="text-sm text-slate-400 mt-1">{status.currentTask.description}</p>
              ) : (
                <p className="text-sm text-slate-500 mt-1">Idle</p>
              )}
            </div>
            
            {status.tasksCompleted > 0 && (
              <div className="text-right">
                <div className="text-xs text-slate-500">Completed today</div>
                <div className="text-lg font-bold text-gold-400">{status.tasksCompleted}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
```

**Dashboard Features:**
- **Real-time agent status:** Show which agents are actively working
- **Task queues:** Visualize pending tasks per agent
- **Completion metrics:** Tasks completed today/week
- **Performance stats:** Average response time, success rate
- **Agent availability:** Show when agents are busy vs. available

**Files to Create:**
- `components/AgentStatusDashboard.tsx` - Agent status widget
- `components/TaskQueueVisualizer.tsx` - Visual task queue
- `components/AgentPerformanceChart.tsx` - Performance metrics

**Files to Modify:**
- `components/Dashboard.tsx` - Integrate agent status dashboard

---

### 5.2 Agent Chat Improvements

**Goal:** Enhanced agent chat with streaming responses, rich formatting, and quick actions.

**Implementation:**

```typescript
// Modify: components/LegalTeam.tsx

// Add streaming response support
const handleSendWithStreaming = async (text: string) => {
  const session = getSession(activeId);
  const userMsg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
  const updatedMessages = [...session.messages, userMsg];
  
  setSessions(prev => ({
    ...prev,
    [activeId]: { ...session, messages: updatedMessages },
  }));
  
  setLoading(true);
  setStreamingResponse('');
  
  try {
    // Use streaming API
    const stream = consultSpecialistStream(
      specialist.systemInstruction,
      updatedMessages.slice(0, -1).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
      text,
      caseContext
    );
    
    let fullResponse = '';
    for await (const chunk of stream) {
      fullResponse += chunk;
      setStreamingResponse(fullResponse);
    }
    
    const modelMsg: ChatMessage = { role: 'model', text: fullResponse, timestamp: Date.now() };
    setSessions(prev => ({
      ...prev,
      [activeId]: {
        specialistId: activeId,
        messages: [...updatedMessages, modelMsg],
      },
    }));
    
    setStreamingResponse('');
  } catch (err) {
    handleError(err, `${specialist.name} is unavailable. Please try again.`, 'LegalTeam');
  } finally {
    setLoading(false);
  }
};

// Add quick action buttons
const QuickActions = ({ specialist, onAction }: { specialist: LegalSpecialist; onAction: (action: string) => void }) => (
  <div className="flex flex-wrap gap-2 mb-3">
    <button
      onClick={() => onAction(`Analyze the strengths and weaknesses of my ${specialist.practiceArea} case.`)}
      className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-gold-500/50"
    >
      Analyze Case
    </button>
    <button
      onClick={() => onAction(`Draft a motion to dismiss for my ${specialist.practiceArea} case.`)}
      className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-gold-500/50"
    >
      Draft Motion
    </button>
    <button
      onClick={() => onAction(`What are the key deadlines and statutes of limitation for my ${specialist.practiceArea} case?`)}
      className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-gold-500/50"
    >
      Check Deadlines
    </button>
  </div>
);
```

**Chat Enhancements:**
- **Streaming responses:** Token-by-token streaming for faster perceived responsiveness
- **Rich formatting:** Support markdown, code blocks, tables in responses
- **Quick actions:** Pre-defined prompts for common tasks
- **Message reactions:** Thumbs up/down for learning
- **Copy/export:** Easy copy of agent responses
- **Suggested follow-ups:** Agent suggests next questions

**Files to Modify:**
- `components/LegalTeam.tsx` - Add streaming, quick actions
- `components/AICopilot.tsx` - Add streaming support
- `services/geminiService.ts` - Add streaming consultation method

---

## Implementation Roadmap

### Week 1: Foundation
- [ ] Implement `AgentMemoryManager` (Phase 1.1)
- [ ] Add IndexedDB storage layer
- [ ] Create memory types and interfaces
- [ ] Basic memory injection in existing components

### Week 2: Reasoning & Background Tasks
- [ ] Implement `deepReasoningChain` (Phase 1.2)
- [ ] Build chain-of-thought reasoning
- [ ] Create `BackgroundAgentEngine` (Phase 2.1)
- [ ] Implement task queue and scheduler

### Week 3: Multi-Agent Orchestration
- [ ] Build `AgentOrchestrator` (Phase 2.2)
- [ ] Implement pre-defined workflows
- [ ] Create workflow execution engine
- [ ] Add agent hand-off system

### Week 4: Monitoring & Intelligence
- [ ] Implement `CaseMonitor` (Phase 3.1)
- [ ] Create monitoring rules
- [ ] Build `NotificationManager` (Phase 3.2)
- [ ] Add smart notification batching

### Week 5: Advanced Capabilities
- [ ] Implement `AgentLearningEngine` (Phase 4.1)
- [ ] Build pattern recognition
- [ ] Create `CrossCaseIntelligenceEngine` (Phase 4.2)
- [ ] Add similar case finder

### Week 6: UI/UX & Polish
- [ ] Build `AgentStatusDashboard` (Phase 5.1)
- [ ] Add streaming responses (Phase 5.2)
- [ ] Create notification center UI
- [ ] Build workflow visualizer
- [ ] Testing and optimization

---

## Performance Considerations

### Token Budget Management
- **Reasoning modes:** Allocate 2048-8192 tokens for deep-think modes
- **Memory injection:** Limit to 1000 tokens of context per agent call
- **Batching:** Batch multiple small tasks into single LLM call when possible

### API Rate Limiting
- **Queue throttling:** Max 10 concurrent API calls
- **Priority lanes:** Critical tasks bypass queue
- **Backoff strategy:** Exponential backoff on rate limit errors

### Storage Optimization
- **Memory consolidation:** Background job to compress old memories weekly
- **Cleanup:** Auto-delete memories older than 6 months
- **Indexing:** Index memories by caseId + agentId for fast retrieval

---

## Testing Strategy

### Agent Reasoning Tests
- Verify chain-of-thought produces coherent multi-step analysis
- Test expert panel produces diverse perspectives
- Validate self-critique identifies gaps in reasoning

### Background Task Tests
- Confirm tasks execute on schedule
- Verify priority queue respects urgency
- Test task failure recovery

### Workflow Tests
- End-to-end workflow execution
- Test hand-offs between agents
- Verify workflow state persistence

### Integration Tests
- Memory persistence across sessions
- Notification delivery timing
- Cross-case intelligence accuracy

---

## Success Metrics

### Responsiveness
- **Target:** Agent response time <2s for standard, <30s for deep-think
- **Measure:** Track P50, P95, P99 latency

### Autonomy
- **Target:** 50%+ of routine tasks automated by agents
- **Measure:** Tasks completed without user initiation

### Accuracy
- **Target:** 90%+ user satisfaction with agent outputs
- **Measure:** Thumbs up/down ratio, draft acceptance rate

### Productivity
- **Target:** 40% reduction in time-to-trial-ready
- **Measure:** Track case preparation time before/after

---

## Configuration & Feature Flags

```typescript
// NEW: config/agentConfig.ts

export const AGENT_CONFIG = {
  memory: {
    enabled: true,
    shortTermLimit: 100,
    longTermLimit: 1000,
    consolidationInterval: 86400000, // 24 hours
  },
  
  reasoning: {
    modes: {
      standard: { enabled: true, maxTokens: 2048 },
      deepThink: { enabled: true, maxTokens: 4096, steps: 5 },
      expertPanel: { enabled: true, maxSpecialists: 3 },
      adversarial: { enabled: false, maxTokens: 6144 }, // Beta feature
    },
  },
  
  background: {
    enabled: true,
    maxConcurrentTasks: 10,
    taskTimeout: 120000, // 2 minutes
    schedulerInterval: 60000, // 1 minute
  },
  
  monitoring: {
    enabled: true,
    checkInterval: 60000, // 1 minute
    rules: {
      deadlineAlerts: true,
      caseStrengthDrop: true,
      newPrecedent: true,
      missingEvidence: true,
      juryPrep: true,
    },
  },
  
  notifications: {
    enabled: true,
    batchInterval: 300000, // 5 minutes
    maxBatchSize: 5,
    quietHoursStart: 22, // 10pm
    quietHoursEnd: 8, // 8am
  },
  
  learning: {
    enabled: true,
    feedbackRequired: false,
    patternConfidenceThreshold: 70,
  },
  
  crossCase: {
    enabled: true,
    similarityThreshold: 60,
    maxSimilarCases: 10,
  },
};
```

---

## Security & Privacy

### Data Handling
- **No external transmission:** All agent memory stored locally (localStorage + IndexedDB)
- **API key security:** Keys never exposed to agent memory or logs
- **Case confidentiality:** No case data sent to external services except AI APIs

### User Control
- **Opt-out:** Users can disable background agents, monitoring, or learning
- **Memory wipe:** Clear all agent memory from settings
- **Notification preferences:** Granular control over alert types

---

## Future Enhancements (Phase 7+)

### Voice-First Agent Interaction
- Natural language voice commands to agents
- Agent voice responses (Text-to-Speech)
- Always-on voice assistant mode

### External Integrations
- Court docket monitoring (PACER, state courts)
- Legal research APIs (Westlaw, LexisNexis)
- Calendar/CRM sync (Outlook, Salesforce)

### Multi-User Collaboration
- Shared agent memory across firm
- Team workflows with role-based permissions
- Activity feed showing all agent actions firm-wide

### Custom Agent Training
- Upload firm-specific precedents
- Fine-tune agents on firm's case history
- Custom agent personas per attorney

---

## Questions for User

1. **Priority:** Should we prioritize responsiveness (Phase 1-2) or autonomy (Phase 2-3)?
2. **Storage:** Are you comfortable with IndexedDB for long-term agent memory, or prefer cloud sync?
3. **Notifications:** How frequently should background agents check for updates? (current: 1 min)
4. **Reasoning modes:** Should deep-think modes be opt-in per query or auto-selected based on complexity?
5. **Learning:** Should agents learn from all cases or only manually approved ones?

