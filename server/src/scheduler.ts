import { dispatchPendingEvents } from "./events.js";
import { supabase } from "./supabase.js";

async function main(): Promise<void> {
  const { data: reaped, error: reapError } = await supabase.rpc(
    "reap_casebuddy_jobs",
  );

  if (reapError) {
    throw new Error(`Job reaper failed: ${reapError.message}`);
  }

  const dispatch = await dispatchPendingEvents(200);

  console.info(
    JSON.stringify({
      reaped: reaped ?? 0,
      domainEvents: dispatch,
    }),
  );
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(
    error instanceof Error ? error.stack ?? error.message : String(error),
  );
  process.exit(1);
}
