import { upsertArtifact } from "./artifacts.js";
import { config } from "./config.js";
import { enqueueJob } from "./jobs.js";
import { publishEvent } from "./events.js";
import { supabase } from "./supabase.js";
import type { JsonObject, PipelineJob } from "./types.js";

type JobHandler = (job: PipelineJob) => Promise<JsonObject>;

async function buildCaseContext(
  job: PipelineJob,
  moduleId: string,
  artifactType: string,
  title: string,
): Promise<JsonObject> {
  const [{ data: caseRow, error: caseError }, { data: recentEvents }] =
    await Promise.all([
      supabase
        .from("cases")
        .select("id, firm_id, data, updated_at")
        .eq("id", job.case_id)
        .eq("firm_id", job.firm_id)
        .single(),
      supabase
        .from("domain_events")
        .select(
          "id, event_type, source_module, entity_type, entity_id, payload, occurred_at",
        )
        .eq("case_id", job.case_id)
        .eq("firm_id", job.firm_id)
        .order("occurred_at", { ascending: false })
        .limit(25),
    ]);

  if (caseError || !caseRow) {
    throw new Error(caseError?.message ?? "Case not found");
  }

  const snapshot = {
    case: caseRow,
    recentEvents: recentEvents ?? [],
    generatedAt: new Date().toISOString(),
  };

  const artifactId = await upsertArtifact({
    firmId: String(job.firm_id),
    caseId: job.case_id,
    moduleId,
    artifactType,
    title,
    data: snapshot,
    sourceJobId: job.id,
  });

  return {
    artifactId,
    eventCount: snapshot.recentEvents.length,
  };
}

const handlers: Record<string, JobHandler> = {
  "companion.refresh-context": async (job) =>
    buildCaseContext(
      job,
      "case-companion",
      "matter-context",
      "Case Companion Matter Context",
    ),

  "discovery.index-transcript": async (job) => {
    const result = await buildCaseContext(
      job,
      "discovery",
      "transcript-index-context",
      "Discovery Transcript Context",
    );

    await publishEvent({
      firmId: String(job.firm_id),
      caseId: job.case_id,
      eventType: "discovery.context.updated",
      sourceModule: "discovery",
      entityType: "case",
      entityId: job.case_id,
      payload: {
        sourceJobId: job.id,
        ...result,
      },
    });

    return result;
  },

  "trial.refresh-context": async (job) =>
    buildCaseContext(
      job,
      "trial-prep",
      "trial-context",
      "Trial Preparation Context",
    ),

  "research.refresh": async (job) =>
    buildCaseContext(
      job,
      "research",
      "research-context",
      "Legal Research Context",
    ),

  "discovery.analyze-document": async (job) => {
    if (!job.document_id) {
      throw new Error("discovery.analyze-document requires document_id");
    }

    return {
      accepted: true,
      documentId: job.document_id,
      message:
        "Discovery analysis runtime is ready; port the existing DiscoveryLens analyzer into this handler next.",
    };
  },

  "media.ocr": async (job) => {
    if (!job.document_id) {
      throw new Error("media.ocr requires document_id");
    }

    const legacyJob = await enqueueJob({
      firmId: String(job.firm_id),
      caseId: job.case_id,
      documentId: job.document_id,
      moduleId: "document-intelligence",
      jobType: "ocr",
      workerKind: "edge",
      payload: {
        parentJobId: job.id,
      },
      idempotencyKey: `legacy-ocr:${job.document_id}`,
    });

    return {
      delegatedJobId: legacyJob.id,
      delegatedWorker: "edge",
    };
  },

  "media.transcribe": async (job) => {
    if (!job.document_id) {
      throw new Error("media.transcribe requires document_id");
    }

    if (!config.MEDIA_TRANSCRIBE_URL) {
      throw new Error(
        "MEDIA_TRANSCRIBE_URL is required until the CaseBuddy transcription donor is ported into this worker",
      );
    }

    const response = await fetch(config.MEDIA_TRANSCRIBE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.MEDIA_TRANSCRIBE_TOKEN
          ? {
              authorization: `Bearer ${config.MEDIA_TRANSCRIBE_TOKEN}`,
            }
          : {}),
      },
      body: JSON.stringify({
        jobId: job.id,
        caseId: job.case_id,
        documentId: job.document_id,
        payload: job.payload,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      throw new Error(`Transcription service returned ${response.status}`);
    }

    const result = (await response.json()) as JsonObject;

    await publishEvent({
      firmId: String(job.firm_id),
      caseId: job.case_id,
      eventType: "transcript.completed",
      sourceModule: "transcription",
      entityType: "document",
      entityId: job.document_id,
      payload: {
        sourceJobId: job.id,
        ...result,
      },
    });

    return result;
  },
};

export async function executeJob(job: PipelineJob): Promise<JsonObject> {
  if (!job.firm_id) {
    throw new Error(`Railway job ${job.id} is missing firm_id`);
  }

  const handler = handlers[job.job_type];

  if (!handler) {
    throw new Error(`No Railway handler registered for ${job.job_type}`);
  }

  return handler(job);
}
