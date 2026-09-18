import { Prisma, type Job } from "@prisma/client";
import { EventEmitter } from "events";
import { prisma } from "@/lib/prisma";

/**
 * A small database-backed job queue. One worker (src/lib/jobs/worker.ts) runs
 * inside the Next.js server process; the table makes jobs survive restarts and
 * gives the UI something to poll for progress.
 */

// Route bundles and the instrumentation hook are evaluated separately, so the
// wake-up signal has to live on globalThis to reach the worker.
const shared = globalThis as unknown as { __jobSignal?: EventEmitter };
export const jobSignal = (shared.__jobSignal ??= new EventEmitter());

export const STALE_AFTER_MS = 2 * 60 * 1000;

export interface EnqueueOptions {
  userId?: number;
  /** While a job with this key is queued or running, enqueueing is a no-op. */
  dedupeKey?: string;
  maxAttempts?: number;
  delayMs?: number;
}

export async function enqueueJob(type: string, payload: Prisma.InputJsonObject, options: EnqueueOptions = {}) {
  if (options.dedupeKey) {
    const pending = await prisma.job.findFirst({
      where: { dedupeKey: options.dedupeKey, status: { in: ["QUEUED", "RUNNING"] } },
    });
    if (pending) return pending;
  }
  const job = await prisma.job.create({
    data: {
      type,
      payload,
      userId: options.userId,
      dedupeKey: options.dedupeKey,
      maxAttempts: options.maxAttempts ?? 3,
      runAfter: new Date(Date.now() + (options.delayMs ?? 0)),
    },
  });
  jobSignal.emit("enqueued");
  return job;
}

/** Atomically takes the oldest runnable job, or returns null. */
export async function claimJob(workerId: string): Promise<Job | null> {
  for (let tries = 0; tries < 5; tries++) {
    const next = await prisma.job.findFirst({
      where: { status: "QUEUED", runAfter: { lte: new Date() } },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (!next) return null;
    // The status guard makes this a compare-and-swap: if another worker got
    // there first, count is 0 and we look again.
    const claimed = await prisma.job.updateMany({
      where: { id: next.id, status: "QUEUED" },
      data: { status: "RUNNING", lockedBy: workerId, heartbeatAt: new Date(), attempts: { increment: 1 }, error: null },
    });
    if (claimed.count === 1) return prisma.job.findUnique({ where: { id: next.id } });
  }
  return null;
}

export async function reportProgress(jobId: number, stage: string, progress: number) {
  await prisma.job.update({
    where: { id: jobId },
    data: { stage, progress: Math.max(0, Math.min(100, Math.round(progress))), heartbeatAt: new Date() },
  });
}

export async function completeJob(jobId: number) {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "DONE", progress: 100, lockedBy: null, heartbeatAt: null },
  });
}

/** Retries with backoff until `maxAttempts`, then gives up and keeps the error. */
export async function failJob(job: Job, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  const retry = job.attempts < job.maxAttempts;
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: retry ? "QUEUED" : "FAILED",
      error: message,
      lockedBy: null,
      heartbeatAt: null,
      runAfter: new Date(Date.now() + 30_000 * 2 ** (job.attempts - 1)),
    },
  });
}

/**
 * Jobs whose worker died mid-run (restart, crash) go back in the queue.
 * At startup pass `ownWorkerId`: the app runs as a single process, so any job
 * locked by someone else belongs to a process that no longer exists.
 */
export async function requeueStaleJobs(ownWorkerId?: string) {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await prisma.job.findMany({
    where: {
      status: "RUNNING",
      OR: [
        { heartbeatAt: { lt: cutoff } },
        { heartbeatAt: null },
        ...(ownWorkerId ? [{ lockedBy: { not: ownWorkerId } }] : []),
      ],
    },
  });
  for (const job of stale) await failJob(job, new Error("worker stopped while the job was running"));
  return stale.length;
}

/** What the UI is allowed to see about a job. */
export function jobView(job: Job) {
  return {
    id: job.id, type: job.type, status: job.status, stage: job.stage,
    progress: job.progress, error: job.status === "FAILED" ? job.error : null,
    payload: job.payload, updatedAt: job.updatedAt,
  };
}
