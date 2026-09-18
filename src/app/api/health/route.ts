import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe used by deploy/deploy.sh. Reveals no secrets. */
export async function GET() {
  const checks: Record<string, boolean> = {
    authSecret: (process.env.AUTH_SECRET || "").length >= 16,
    database: false,
  };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (error) {
    console.error("Health check: database unreachable", error);
  }
  const ok = Object.values(checks).every(Boolean);
  return Response.json({ ok, checks }, { status: ok ? 200 : 503 });
}
