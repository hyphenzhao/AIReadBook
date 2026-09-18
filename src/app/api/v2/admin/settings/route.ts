import { NextRequest, NextResponse } from "next/server";
import { requireAdminUserId, sessionError } from "@/lib/auth-session";
import { getAppSettings, updateAppSettings } from "@/lib/app-settings";
import { getWebSearchConfigView, updateWebSearchConfig, webSearch, WebSearchError } from "@/lib/web-search";

async function view() {
  const [settings, webSearchConfig] = await Promise.all([getAppSettings(), getWebSearchConfigView()]);
  return { settings, webSearch: webSearchConfig };
}

export async function GET() {
  try {
    await requireAdminUserId();
    return NextResponse.json(await view());
  } catch (error) {
    return sessionError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminUserId();
    const body = await req.json().catch(() => ({}));
    if (typeof body.allowRegistration === "boolean") {
      await updateAppSettings({ allowRegistration: body.allowRegistration });
    }
    if (body.webSearch && typeof body.webSearch === "object") {
      await updateWebSearchConfig(body.webSearch);
    }
    return NextResponse.json(await view());
  } catch (error) {
    return sessionError(error);
  }
}

/** Runs one real search with the saved key, so an admin can check it works. */
export async function POST() {
  try {
    const adminId = await requireAdminUserId();
    const results = await webSearch("《史记》 司马迁 评价", adminId, { testing: true });
    return NextResponse.json({ ok: true, count: results.length, sample: results[0]?.title ?? null });
  } catch (error) {
    if (error instanceof WebSearchError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return sessionError(error);
  }
}
