import { config } from "./config.js";
import { supabase } from "./supabase.js";
import type { JsonObject, PipelineJob, WorkerKind } from "./types.js";

export interface EnqueueJobInput {
  firmId: string;
  caseId: string;
  documentId?: string | null;
  moduleId: string;
  jobType: string;
  workerKind: WorkerKind | "edge";
  payload?: JsonObject;
  priority?: number;
  idempotencyKey?: string;
}

export async function enqueueJob(
  input: EnqueueJobInput,
): Promise<PipelineJob> {
  const row = {
    firm_id: input.firmId,
    case_id: input.caseId,
    document_id: input.documentId ?? null,
    module_id: input.moduleId,
    job_type: input.jobType,
    worker_kind: input.workerKind,
    payload: input.payload ?? {},
    priority: input.priority ?? 100,
    idempotency_key: input.idempotencyKey ?? null,
    available_at: new Date().toISOString(),
    status: "pending",
  };

  const { data, error } = await supabase
    .from("pipeline_jobs")
    .insert(row)
    .select("*")
    .single();

  if (!error && data) {
    return data as PipelineJob;
  }

  if (error?.code === "23505" && input.idempotencyKey) {
    const { data: existing, error: existingError } = await supabase
      .from("pipeline_jobs")
      .select("*")
      .eq("idempotency_key", input.idempotencyKey)
      .single();

    if (!existingError && existing) {
      return existing as PipelineJob;
    }
  }

  throw new Error(error?.message ?? "Could not enqueue job");
}

export async function claimJobs(
  workerKind: WorkerKind,
  limit: number,
): Promise<PipelineJob[]> {
  const { data, error } = await supabase.rpc("claim_casebuddy_jobs", {
    p_worker_kind: workerKind,
    p_limit: limit,
    p_lease_seconds: config.JOB_LEASE_SECONDS,
  });

  if (error) {
    throw new Error(`Could not claim jobs: ${error.message}`);
  }

  return (data ?? []) as PipelineJob[];
}

export async function completeJob(
  job: PipelineJob,
  result: JsonObject,
): Promise<void> {
  if (!job.lease_token) {
    throw new Error(`Job ${job.id} has no lease token`);
  }

  const { data, error } = await supabase.rpc("complete_casebuddy_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_result: result,
  });

  if (error || data !== true) {
    throw new Error(error?.message ?? `Lost lease for job ${job.id}`);
  }
}

export async function failJob(
  job: PipelineJob,
  errorMessage: string,
): Promise<void> {
  if (!job.lease_token) {
    throw new Error(`Job ${job.id} has no lease token`);
  }

  const { data, error } = await supabase.rpc("fail_casebuddy_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_error: errorMessage.slice(0, 8000),
  });

  if (error || data !== true) {
    throw new Error(error?.message ?? `Could not fail job ${job.id}`);
  }
}
