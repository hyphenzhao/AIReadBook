import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

/** Public: tells the login/register pages whether sign-up is available. */
export async function GET() {
  try {
    const [settings, userCount] = await Promise.all([getAppSettings(), prisma.user.count()]);
    return NextResponse.json({ registrationOpen: settings.allowRegistration || userCount === 0 });
  } catch (e) {
    console.error("Auth config failed:", e);
    return NextResponse.json({ error: "服务暂时不可用" }, { status: 503 });
  }
}
