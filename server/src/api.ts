import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import {
  AuthenticationError,
  AuthorizationError,
  requireCaseAccess,
  requireContext,
} from "./auth.js";
import { allowedOrigins, config } from "./config.js";
import { publishEvent } from "./events.js";
import { enqueueJob } from "./jobs.js";
import { findJobDefinition, modules } from "./modules.js";
import { supabase } from "./supabase.js";

const app = Fastify({
  logger: true,
  bodyLimit: 2 * 1024 * 1024,
});

await app.register(cors, {
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin is not allowed"), false);
  },
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof AuthenticationError) {
    void reply.code(401).send({ error: error.message });
    return;
  }

  if (error instanceof AuthorizationError) {
    void reply.code(403).send({ error: error.message });
    return;
  }

  if (error instanceof z.ZodError) {
    void reply.code(400).send({
      error: "Invalid request",
      issues: error.issues,
    });
    return;
  }

  app.log.error(error);
  void reply.code(500).send({ error: "Internal server error" });
});

app.get("/healthz", async () => ({
  status: "ok",
  service: "casebuddy-api",
}));

app.get("/readyz", async (_request, reply) => {
  const { error } = await supabase.from("cases").select("id").limit(1);

  if (error) {
    return reply.code(503).send({
      status: "not_ready",
      database: error.message,
    });
  }

  return {
    status: "ready",
  };
});

app.get("/v1/modules", async (request) => {
  const context = await requireContext(request);

  const { data: installations, error } = await supabase
    .from("casebuddy_module_installations")
    .select("module_id, enabled, config")
    .eq("firm_id", context.firmId);

  if (error) {
    throw error;
  }

  const overrides = new Map<
    string,
    { enabled: boolean; config: Record<string, unknown> }
  >(
    (installations ?? []).map((row) => [
      String(row.module_id),
      {
        enabled: Boolean(row.enabled),
        config: (row.config ?? {}) as Record<string, unknown>,
      },
    ]),
  );

  return modules.map((module) => ({
    ...module,
    enabled: overrides.get(module.id)?.enabled ?? true,
    config: overrides.get(module.id)?.config ?? {},
  }));
});

app.get("/v1/cases/:caseId/platform", async (request) => {
  const params = z
    .object({
      caseId: z.string().min(1),
    })
    .parse(request.params);

  const context = await requireContext(request);
  await requireCaseAccess(params.caseId, context);

  const [
    { data: caseRow, error: caseError },
    { data: artifacts, error: artifactError },
    { data: events, error: eventError },
  ] = await Promise.all([
    supabase
      .from("cases")
      .select("*")
      .eq("id", params.caseId)
      .eq("firm_id", context.firmId)
      .single(),
    supabase
      .from("casebuddy_module_artifacts")
      .select("*")
      .eq("case_id", params.caseId)
      .eq("firm_id", context.firmId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("domain_events")
      .select("*")
      .eq("case_id", params.caseId)
      .eq("firm_id", context.firmId)
      .order("occurred_at", { ascending: false })
      .limit(100),
  ]);

  if (caseError || artifactError || eventError) {
    throw caseError ?? artifactError ?? eventError;
  }

  return {
    case: caseRow,
    artifacts: artifacts ?? [],
    events: events ?? [],
  };
});

app.post("/v1/cases/:caseId/events", async (request, reply) => {
  const params = z
    .object({
      caseId: z.string().min(1),
    })
    .parse(request.params);

  const body = z
    .object({
      eventType: z.string().min(3).max(160),
      sourceModule: z.string().min(2).max(100),
      entityType: z.string().max(100).nullable().optional(),
      entityId: z.string().max(200).nullable().optional(),
      payload: z.record(z.unknown()).default({}),
    })
    .parse(request.body);

  const context = await requireContext(request);
  await requireCaseAccess(params.caseId, context);

  const event = await publishEvent({
    firmId: context.firmId,
    caseId: params.caseId,
    userId: context.userId,
    eventType: body.eventType,
    sourceModule: body.sourceModule,
    entityType: body.entityType,
    entityId: body.entityId,
    payload: body.payload,
  });

  return reply.code(202).send(event);
});

app.post("/v1/cases/:caseId/jobs", async (request, reply) => {
  const params = z
    .object({
      caseId: z.string().min(1),
    })
    .parse(request.params);

  const body = z
    .object({
      moduleId: z.string().min(2),
      jobType: z.string().min(3),
      documentId: z.string().uuid().nullable().optional(),
      payload: z.record(z.unknown()).default({}),
      priority: z.number().int().min(0).max(1000).default(100),
      idempotencyKey: z.string().max(300).optional(),
    })
    .parse(request.body);

  const context = await requireContext(request);
  await requireCaseAccess(params.caseId, context);

  const definition = findJobDefinition(body.moduleId, body.jobType);

  if (!definition) {
    return reply.code(400).send({
      error: `Module ${body.moduleId} does not register job ${body.jobType}`,
    });
  }

  const job = await enqueueJob({
    firmId: context.firmId,
    caseId: params.caseId,
    documentId: body.documentId,
    moduleId: body.moduleId,
    jobType: body.jobType,
    workerKind: definition.workerKind,
    payload: body.payload,
    priority: body.priority,
    idempotencyKey: body.idempotencyKey,
  });

  return reply.code(202).send(job);
});

await app.listen({
  host: "0.0.0.0",
  port: config.PORT,
});
