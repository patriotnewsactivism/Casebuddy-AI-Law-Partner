import { defineModule } from "./module-sdk.js";
import type { CaseBuddyModule, DomainEvent } from "./types.js";

const eventContext = (event: DomainEvent) => ({
  eventId: event.id,
  eventType: event.event_type,
  entityType: event.entity_type,
  entityId: event.entity_id,
  sourceModule: event.source_module,
});

const moduleDefinitions: CaseBuddyModule[] = [
  {
    id: "case-companion",
    name: "Case Companion",
    version: "1.0.0",
    navigation: [
      {
        label: "Case Companion",
        path: "/matters/:caseId/companion",
      },
    ],
    permissions: [
      "case.read",
      "document.read",
      "evidence.read",
      "transcript.read",
      "insight.create",
    ],
    subscriptions: [
      "transcript.completed",
      "document.analysis.completed",
      "discovery.finding.created",
      "deadline.created",
    ].map((eventType) => ({
      eventType,
      jobType: "companion.refresh-context",
      workerKind: "general" as const,
      buildPayload: eventContext,
    })),
    jobs: [
      {
        type: "companion.refresh-context",
        workerKind: "general",
      },
    ],
  },
  {
    id: "discovery",
    name: "Discovery",
    version: "1.0.0",
    navigation: [
      {
        label: "Discovery",
        path: "/matters/:caseId/discovery",
      },
    ],
    permissions: [
      "case.read",
      "document.read",
      "evidence.read",
      "discovery.write",
    ],
    subscriptions: [
      {
        eventType: "transcript.completed",
        jobType: "discovery.index-transcript",
        workerKind: "general",
        buildPayload: eventContext,
      },
    ],
    jobs: [
      {
        type: "discovery.index-transcript",
        workerKind: "general",
      },
      {
        type: "discovery.analyze-document",
        workerKind: "general",
      },
    ],
  },
  {
    id: "trial-prep",
    name: "Trial Prep",
    version: "1.0.0",
    navigation: [
      {
        label: "Trial Prep",
        path: "/matters/:caseId/trial",
      },
    ],
    permissions: [
      "case.read",
      "evidence.read",
      "transcript.read",
      "trial.write",
    ],
    subscriptions: [
      "transcript.completed",
      "discovery.finding.created",
    ].map((eventType) => ({
      eventType,
      jobType: "trial.refresh-context",
      workerKind: "general" as const,
      buildPayload: eventContext,
    })),
    jobs: [
      {
        type: "trial.refresh-context",
        workerKind: "general",
      },
    ],
  },
  {
    id: "document-intelligence",
    name: "Document Intelligence",
    version: "1.0.0",
    navigation: [
      {
        label: "Documents",
        path: "/matters/:caseId/documents",
      },
    ],
    permissions: ["case.read", "document.read", "document.process"],
    subscriptions: [],
    jobs: [
      {
        type: "media.ocr",
        workerKind: "media",
      },
    ],
  },
  {
    id: "transcription",
    name: "Transcription",
    version: "1.0.0",
    navigation: [
      {
        label: "Transcripts",
        path: "/matters/:caseId/transcripts",
      },
    ],
    permissions: ["case.read", "document.read", "transcript.write"],
    subscriptions: [],
    jobs: [
      {
        type: "media.transcribe",
        workerKind: "media",
      },
    ],
  },
  {
    id: "research",
    name: "Legal Research",
    version: "1.0.0",
    navigation: [
      {
        label: "Research",
        path: "/matters/:caseId/research",
      },
    ],
    permissions: ["case.read", "research.read", "research.write"],
    subscriptions: [],
    jobs: [
      {
        type: "research.refresh",
        workerKind: "general",
      },
    ],
  },
];

export const modules = moduleDefinitions.map(defineModule);

export function findModule(moduleId: string): CaseBuddyModule | undefined {
  return modules.find((module) => module.id === moduleId);
}

export function findJobDefinition(
  moduleId: string,
  jobType: string,
): { type: string; workerKind: "general" | "media" } | undefined {
  return findModule(moduleId)?.jobs.find((job) => job.type === jobType);
}
