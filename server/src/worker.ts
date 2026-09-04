import { config } from "./config.js";
import { claimJobs, completeJob, failJob } from "./jobs.js";
import { executeJob } from "./worker-handlers.js";
import type { PipelineJob } from "./types.js";

let stopping = false;

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function processJob(job: PipelineJob): Promise<void> {
  try {
    const result = await executeJob(job);
    await completeJob(job, result);
    console.info("job.completed", {
      jobId: job.id,
      jobType: job.job_type,
      workerKind: job.worker_kind,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown worker failure";

    console.error("job.failed", {
      jobId: job.id,
      jobType: job.job_type,
      error: message,
    });

    try {
      await failJob(job, message);
    } catch (failureUpdateError) {
      console.error("job.failure_update_failed", {
        jobId: job.id,
        error:
          failureUpdateError instanceof Error
            ? failureUpdateError.message
            : "Unknown error",
      });
    }
  }
}

async function run(): Promise<void> {
  console.info("worker.started", {
    kind: config.WORKER_KIND,
    concurrency: config.WORKER_CONCURRENCY,
  });

  while (!stopping) {
    try {
      const jobs = await claimJobs(
        config.WORKER_KIND,
        config.WORKER_CONCURRENCY,
      );

      if (jobs.length === 0) {
        await sleep(config.JOB_POLL_INTERVAL_MS);
        continue;
      }

      await Promise.all(jobs.map(processJob));
    } catch (error) {
      console.error("worker.poll_failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      await sleep(Math.max(config.JOB_POLL_INTERVAL_MS, 5000));
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    console.info("worker.stopping", { signal });
  });
}

await run();
