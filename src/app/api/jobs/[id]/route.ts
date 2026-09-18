import { prisma } from "@/lib/prisma";
import { requireSessionUserId, sessionError } from "@/lib/auth-session";
import { jobView } from "@/lib/jobs/queue";

/** Progress of a background job the user started. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireSessionUserId();
    const id = Number((await params).id);
    const job = Number.isInteger(id) && id > 0 ? await prisma.job.findFirst({ where: { id, userId } }) : null;
    if (!job) return Response.json({ error: "任务不存在" }, { status: 404 });
    return Response.json({ job: jobView(job) });
  } catch (error) {
    return sessionError(error);
  }
}
