/**
 * Node-only startup work, loaded by instrumentation.ts. Kept in its own file
 * because everything reachable from here (Prisma, crypto, net, the job
 * handlers) must stay out of the Edge bundle.
 */
import { startJobWorker } from "@/lib/jobs/worker";
import { enqueueUnindexedBooks } from "@/lib/knowledge/index-book";
import { repairChapterTitles } from "@/lib/knowledge/repair-titles";

export function startBackgroundWork() {
  startJobWorker();
  repairChapterTitles()
    .then((count) => count && console.info(`[startup] named ${count} chapter(s) that had no usable title`))
    .catch((error) => console.error("[startup] could not repair chapter titles", error));
  enqueueUnindexedBooks()
    .then((count) => count && console.info(`[jobs] queued indexing for ${count} book(s)`))
    .catch((error) => console.error("[jobs] could not queue book indexing", error));
}
