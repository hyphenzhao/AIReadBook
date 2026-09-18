import { NextRequest, NextResponse } from "next/server";
import { requireAdminUserId, sessionError } from "@/lib/auth-session";
import { getAppSettings, updateAppSettings } from "@/lib/app-settings";

export async function GET() {
  try {
    await requireAdminUserId();
    return NextResponse.json({ settings: await getAppSettings() });
  } catch (error) {
    return sessionError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminUserId();
    const body = await req.json().catch(() => ({}));
    const patch: { allowRegistration?: boolean } = {};
    if (typeof body.allowRegistration === "boolean") patch.allowRegistration = body.allowRegistration;
    return NextResponse.json({ settings: await updateAppSettings(patch) });
  } catch (error) {
    return sessionError(error);
  }
}
