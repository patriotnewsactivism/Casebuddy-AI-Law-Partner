import type { CaseBuddyModule } from "./types.js";

export function defineModule(module: CaseBuddyModule): CaseBuddyModule {
  const declaredJobs = new Map(
    module.jobs.map((job) => [job.type, job.workerKind]),
  );

  for (const subscription of module.subscriptions) {
    const workerKind = declaredJobs.get(subscription.jobType);

    if (!workerKind) {
      throw new Error(
        `Module ${module.id} subscribes with undeclared job ${subscription.jobType}`,
      );
    }

    if (workerKind !== subscription.workerKind) {
      throw new Error(
        `Module ${module.id} declares conflicting worker kinds for ${subscription.jobType}`,
      );
    }
  }

  return Object.freeze(module);
}
