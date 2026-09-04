import { supabase } from "./supabase.js";
import type { JsonObject } from "./types.js";

export interface UpsertArtifactInput {
  firmId: string;
  caseId: string;
  moduleId: string;
  artifactType: string;
  title: string;
  data: JsonObject;
  sourceJobId?: string;
}

export async function upsertArtifact(
  input: UpsertArtifactInput,
): Promise<string> {
  const key = `${input.moduleId}:${input.artifactType}:${input.caseId}`;

  const { data, error } = await supabase
    .from("casebuddy_module_artifacts")
    .upsert(
      {
        firm_id: input.firmId,
        case_id: input.caseId,
        module_id: input.moduleId,
        artifact_type: input.artifactType,
        artifact_key: key,
        title: input.title,
        data: input.data,
        source_job_id: input.sourceJobId ?? null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "artifact_key",
      },
    )
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Could not upsert module artifact");
  }

  return String(data.id);
}
