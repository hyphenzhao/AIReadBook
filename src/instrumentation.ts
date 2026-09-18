/**
 * Runs once when the Next.js server process starts. Starts the background job
 * worker — but not during `next build`, not in the Edge runtime, and not in
 * the throwaway instance deploy.sh uses for smoke tests (JOBS_DISABLED=1).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.JOBS_DISABLED === "1") return;

  const { startJobWorker } = await import("@/lib/jobs/worker");
  const { enqueueUnindexedBooks } = await import("@/lib/knowledge/index-book");
  startJobWorker();
  enqueueUnindexedBooks()
    .then((count) => count && console.info(`[jobs] queued indexing for ${count} book(s)`))
    .catch((error) => console.error("[jobs] could not queue book indexing", error));
}
