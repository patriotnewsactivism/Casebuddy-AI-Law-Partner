export type JsonObject = Record<string, unknown>;

export interface RequestContext {
  userId: string;
  firmId: string;
}

export interface PipelineJob {
  id: string;
  case_id: string;
  document_id: string | null;
  firm_id: string | null;
  module_id: string | null;
  job_type: string;
  worker_kind: "edge" | "general" | "media";
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  max_attempts: number;
  payload: JsonObject;
  lease_token: string | null;
  leased_until: string | null;
  idempotency_key: string | null;
}

export interface DomainEvent {
  id: string;
  firm_id: string;
  case_id: string | null;
  user_id: string | null;
  event_type: string;
  source_module: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: JsonObject;
  occurred_at: string;
  dispatched_at: string | null;
  dispatch_attempts: number;
  last_dispatch_error: string | null;
}

export type WorkerKind = "general" | "media";

export interface ModuleSubscription {
  eventType: string;
  jobType: string;
  workerKind: WorkerKind;
  buildPayload?: (event: DomainEvent) => JsonObject;
}

export interface CaseBuddyModule {
  id: string;
  name: string;
  version: string;
  navigation: Array<{
    label: string;
    path: string;
  }>;
  permissions: string[];
  subscriptions: ModuleSubscription[];
  jobs: Array<{
    type: string;
    workerKind: WorkerKind;
  }>;
}
