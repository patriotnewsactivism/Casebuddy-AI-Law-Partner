import { getAgentById, getSpecialistById, LEGAL_SPECIALISTS } from '../agents/personas';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { getSession } from './authService';
import { deriveCaseRowId } from './caseStore';

// ── Types ────────────────────────────────────────────────────────────────────

export type TaskStatus = 'queued' | 'working' | 'done' | 'error';

export interface WorkProduct {
  taskId: string;
  agentId: string;
  agentName: string;
  emoji: string;
  colorClass: string;
  title: string;
  status: TaskStatus;
  content: string;
  startedAt?: number;
  completedAt?: number;
}

export interface FirmRun {
  id: string;
  caseId: string;
  status: 'pending' | 'running' | 'done' | 'error';
  specialistId?: string;
  createdAt: string;
  completedAt?: string;
}

// ── Task definitions ─────────────────────────────────────────────────────────

interface TaskDef {
  taskId: string;
  agentId: string;
  title: string;
}

const CORE_TASKS: TaskDef[] = [
  { taskId: 'maya-summary', agentId: 'maya', title: 'Case Summary & Issue Spotting' },
  { taskId: 'lex-research', agentId: 'lex', title: 'Legal Research Memo' },
  { taskId: 'sol-deadlines', agentId: 'sol', title: 'Deadlines & Statute of Limitations' },
  { taskId: 'doc-draft', agentId: 'doc', title: 'First Draft on the Page' },
  { taskId: 'jules-jury', agentId: 'jules', title: 'Jury & Venue Read' },
  { taskId: 'rex-strategy', agentId: 'rex', title: 'Trial Strategy Outline' },
];

const buildTaskList = (specialistId: string): TaskDef[] => {
  const spec = getSpecialistById(specialistId) ?? LEGAL_SPECIALISTS[0];
  return [
    ...CORE_TASKS,
    { taskId: 'specialist-plan', agentId: spec.id, title: `${spec.practiceArea} Action Plan` },
    { taskId: 'sierra-update', agentId: 'sierra', title: 'Client Update Letter' },
  ];
};

// ── Row ↔ WorkProduct mapping ────────────────────────────────────────────────

interface WpRow {
  run_id: string;
  task_id: string;
  agent_id: string;
  agent_name: string;
  emoji: string;
  color_class: string;
  title: string;
  status: TaskStatus;
  content: string;
  started_at?: number | null;
  completed_at?: number | null;
}

const rowToWp = (r: WpRow): WorkProduct => ({
  taskId: r.task_id,
  agentId: r.agent_id,
  agentName: r.agent_name,
  emoji: r.emoji,
  colorClass: r.color_class,
  title: r.title,
  status: r.status,
  content: r.content || '',
  startedAt: r.started_at ?? undefined,
  completedAt: r.completed_at ?? undefined,
});

// ── Create a new run in Supabase ─────────────────────────────────────────────

export const createRun = async (
  caseId: string,
  specialistId: string,
): Promise<{ runId: string; products: WorkProduct[] }> => {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Create the run
  const { data: run, error: runErr } = await supabase
    .from('firm_runs')
    .insert({ case_id: await deriveCaseRowId(caseId), user_id: user.id, specialist_id: specialistId })
    .select('id')
    .single();
  if (runErr || !run) throw runErr || new Error('Failed to create run');

  // Build work product rows
  const tasks = buildTaskList(specialistId);
  const rows: WpRow[] = tasks.map(t => {
    const op = getAgentById(t.agentId);
    const spec = !op ? getSpecialistById(t.agentId) : null;
    return {
      run_id: run.id,
      task_id: t.taskId,
      agent_id: t.agentId,
      agent_name: op?.name ?? spec?.name ?? t.agentId,
      emoji: op?.emoji ?? spec?.emoji ?? '⚖️',
      color_class: op?.colorClass ?? spec?.colorClass ?? 'text-gold-400',
      title: t.title,
      status: 'queued' as const,
      content: '',
    };
  });

  const { error: wpErr } = await supabase.from('work_products').insert(rows);
  if (wpErr) throw wpErr;

  return { runId: run.id, products: rows.map(rowToWp) };
};

// ── Trigger server-side orchestration ────────────────────────────────────────

export const triggerOrchestration = async (
  runId: string,
  caseContext: string,
  specialistId: string,
): Promise<void> => {
  const session = await getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const spec = getSpecialistById(specialistId) ?? LEGAL_SPECIALISTS[0];

  const resp = await fetch('/api/ai/orchestrate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      runId,
      caseContext,
      specialist: {
        name: spec.name,
        title: spec.title,
        practiceArea: spec.practiceArea,
        systemInstruction: spec.systemInstruction,
      },
    }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(data.error || 'Orchestration request failed');
  }
};

// ── Load the latest run for a case from Supabase ─────────────────────────────

export const loadRunFromSupabase = async (
  caseId: string,
): Promise<{ run: FirmRun; products: WorkProduct[] } | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: runs } = await supabase
    .from('firm_runs')
    .select('*')
    .eq('case_id', await deriveCaseRowId(caseId))
    .order('created_at', { ascending: false })
    .limit(1);

  if (!runs?.length) return null;
  const run = runs[0];

  const { data: wps } = await supabase
    .from('work_products')
    .select('*')
    .eq('run_id', run.id)
    .order('id');

  return {
    run: {
      id: run.id,
      caseId: run.case_id,
      status: run.status,
      specialistId: run.specialist_id,
      createdAt: run.created_at,
      completedAt: run.completed_at,
    },
    products: (wps || []).map(rowToWp),
  };
};

// ── Subscribe to live work-product updates ───────────────────────────────────

export const subscribeToRun = (
  runId: string,
  onProductUpdate: (wp: WorkProduct) => void,
  onRunUpdate?: (status: string) => void,
): (() => void) => {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`run-${runId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'work_products', filter: `run_id=eq.${runId}` },
      (payload) => {
        if (payload.new) onProductUpdate(rowToWp(payload.new as WpRow));
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'firm_runs', filter: `id=eq.${runId}` },
      (payload) => {
        if (payload.new && onRunUpdate) onRunUpdate((payload.new as { status: string }).status);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

// ── Legacy localStorage fallback (read-only) ────────────────────────────────

const runKey = (caseId: string) => `casebuddy_firm_run_${caseId}`;

export const loadLegacyRun = (caseId: string): { at: number; products: WorkProduct[] } | null => {
  try {
    const raw = localStorage.getItem(runKey(caseId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
