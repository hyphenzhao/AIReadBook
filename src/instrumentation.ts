/**
 * Runs once when the Next.js server process starts. Starts the background job
 * worker — but not during `next build`, and not in the throwaway instance
 * deploy.sh uses for smoke tests (JOBS_DISABLED=1).
 *
 * This file is compiled for the Edge runtime too. The import has to sit
 * inside a positive `NEXT_RUNTIME === "nodejs"` block: that is the form the
 * bundler can eliminate, whereas an early `return` leaves the import — and
 * every Node-only module behind it — in the Edge build, which then fails.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    if (process.env.JOBS_DISABLED === "1") return;
    const { startBackgroundWork } = await import("./instrumentation-node");
    startBackgroundWork();
  }
}
