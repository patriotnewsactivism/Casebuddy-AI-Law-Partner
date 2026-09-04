import { readFile, writeFile } from "node:fs/promises";

const path = new URL(
  "../supabase/functions/pipeline-orchestrator/index.ts",
  import.meta.url,
);

const source = await readFile(path, "utf8");

if (source.includes(".eq('worker_kind', 'edge')")) {
  console.log("pipeline-orchestrator already filters worker_kind=edge");
  process.exit(0);
}

const needle = ".eq('status', 'pending')";

if (!source.includes(needle)) {
  throw new Error(
    "Could not find the pending-job selector. Patch pipeline-orchestrator manually before deploying Railway workers.",
  );
}

const patched = source.replace(
  needle,
  `${needle}\n      .eq('worker_kind', 'edge')`,
);

await writeFile(path, patched, "utf8");
console.log("Patched pipeline-orchestrator to dispatch only worker_kind=edge");
