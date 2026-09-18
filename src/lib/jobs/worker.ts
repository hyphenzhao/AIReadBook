import type { Job } from "@prisma/client";
import { claimJob, completeJob, failJob, jobSignal, reportProgress, requeueStaleJobs } from "@/lib/jobs/queue";
import { JOB_HANDLERS } from "@/lib/jobs/handlers";

export interface JobContext {
  /** Also serves as the heartbeat, so call it at least once a minute. */
  progress: (stage: string, percent: number) => Promise<void>;
}

const POLL_MS = 2_000;
const HEARTBEAT_MS = 15_000;
const STALE_SWEEP_MS = 60_000;

const shared = globalThis as unknown as { __jobWorkerStarted?: boolean };

async function run(job: Job) {
  const handler = JOB_HANDLERS[job.type];
  if (!handler) return failJob({ ...job, attempts: job.maxAttempts }, new Error(`unknown job type: ${job.type}`));

  // Keeps the job from looking abandoned while a long step (an LLM call, a
  // big embedding batch) is in flight.
  const heartbeat = setInterval(() => {
    reportProgress(job.id, job.stage ?? "running", job.progress).catch(() => {});
  }, HEARTBEAT_MS);

  try {
    await handler(job, {
      progress: async (stage, percent) => {
        job.stage = stage;
        job.progress = percent;
        await reportProgress(job.id, stage, percent);
      },
    });
    await completeJob(job.id);
  } catch (error) {
    console.error(`[jobs] ${job.type} #${job.id} failed (attempt ${job.attempts}/${job.maxAttempts})`, error);
    await failJob(job, error);
  } finally {
    clearInterval(heartbeat);
  }
}

/** Starts the single in-process worker. Safe to call more than once. */
export function startJobWorker() {
  if (shared.__jobWorkerStarted) return;
  shared.__jobWorkerStarted = true;

  const workerId = `pid-${process.pid}`;
  let busy = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      for (let job = await claimJob(workerId); job; job = await claimJob(workerId)) await run(job);
    } catch (error) {
      console.error("[jobs] worker loop error", error);
    } finally {
      busy = false;
      schedule();
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, POLL_MS);
    timer.unref();
  };

  jobSignal.on("enqueued", () => void tick());
  setInterval(() => requeueStaleJobs().catch(() => {}), STALE_SWEEP_MS).unref();

  // Anything left RUNNING belongs to a previous process.
  requeueStaleJobs(workerId)
    .then((count) => count && console.info(`[jobs] requeued ${count} job(s) from a previous run`))
    .catch(() => {})
    .finally(() => void tick());

  console.info(`[jobs] worker ${workerId} started`);
}
