import { enqueueJob } from "./jobs.js";
import { modules } from "./modules.js";
import { supabase } from "./supabase.js";
import type { DomainEvent, JsonObject } from "./types.js";

export interface PublishEventInput {
  firmId: string;
  caseId?: string | null;
  userId?: string | null;
  eventType: string;
  sourceModule: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: JsonObject;
}

export async function publishEvent(
  input: PublishEventInput,
): Promise<DomainEvent> {
  const { data, error } = await supabase
    .from("domain_events")
    .insert({
      firm_id: input.firmId,
      case_id: input.caseId ?? null,
      user_id: input.userId ?? null,
      event_type: input.eventType,
      source_module: input.sourceModule,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      payload: input.payload ?? {},
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not publish event");
  }

  const event = data as DomainEvent;

  try {
    await dispatchEvent(event);

    const { error: updateError } = await supabase
      .from("domain_events")
      .update({
        dispatched_at: new Date().toISOString(),
        dispatch_attempts: event.dispatch_attempts + 1,
        last_dispatch_error: null,
      })
      .eq("id", event.id)
      .is("dispatched_at", null);

    if (updateError) {
      throw new Error(updateError.message);
    }
  } catch (dispatchError) {
    const message =
      dispatchError instanceof Error
        ? dispatchError.message
        : "Unknown immediate dispatch failure";

    await supabase
      .from("domain_events")
      .update({
        dispatch_attempts: event.dispatch_attempts + 1,
        last_dispatch_error: message.slice(0, 8000),
      })
      .eq("id", event.id);
  }

  return event;
}

async function moduleEnabled(
  firmId: string,
  moduleId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("casebuddy_module_installations")
    .select("enabled")
    .eq("firm_id", firmId)
    .eq("module_id", moduleId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read module installation: ${error.message}`);
  }

  return data?.enabled ?? true;
}

export async function dispatchEvent(event: DomainEvent): Promise<number> {
  if (!event.case_id) {
    return 0;
  }

  let enqueued = 0;

  for (const module of modules) {
    if (!(await moduleEnabled(event.firm_id, module.id))) {
      continue;
    }

    for (const subscription of module.subscriptions) {
      if (subscription.eventType !== event.event_type) {
        continue;
      }

      await enqueueJob({
        firmId: event.firm_id,
        caseId: event.case_id,
        moduleId: module.id,
        jobType: subscription.jobType,
        workerKind: subscription.workerKind,
        payload:
          subscription.buildPayload?.(event) ?? {
            eventId: event.id,
          },
        idempotencyKey: [
          "event",
          event.id,
          module.id,
          subscription.jobType,
        ].join(":"),
      });

      enqueued += 1;
    }
  }

  return enqueued;
}

export async function dispatchPendingEvents(limit = 100): Promise<{
  processed: number;
  jobsEnqueued: number;
  failed: number;
}> {
  const { data, error } = await supabase
    .from("domain_events")
    .select("*")
    .is("dispatched_at", null)
    .order("occurred_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load domain events: ${error.message}`);
  }

  let processed = 0;
  let jobsEnqueued = 0;
  let failed = 0;

  for (const raw of data ?? []) {
    const event = raw as DomainEvent;

    try {
      jobsEnqueued += await dispatchEvent(event);

      const { error: updateError } = await supabase
        .from("domain_events")
        .update({
          dispatched_at: new Date().toISOString(),
          dispatch_attempts: event.dispatch_attempts + 1,
          last_dispatch_error: null,
        })
        .eq("id", event.id)
        .is("dispatched_at", null);

      if (updateError) {
        throw new Error(updateError.message);
      }

      processed += 1;
    } catch (dispatchError) {
      failed += 1;
      const message =
        dispatchError instanceof Error
          ? dispatchError.message
          : "Unknown dispatch failure";

      await supabase
        .from("domain_events")
        .update({
          dispatch_attempts: event.dispatch_attempts + 1,
          last_dispatch_error: message.slice(0, 8000),
        })
        .eq("id", event.id);
    }
  }

  return {
    processed,
    jobsEnqueued,
    failed,
  };
}
