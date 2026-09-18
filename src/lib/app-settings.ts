import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Instance-wide settings, editable by admins. Absent rows mean the default. */
export interface AppSettings {
  allowRegistration: boolean;
}

const DEFAULTS: AppSettings = {
  allowRegistration: false,
};

export async function getAppSettings(): Promise<AppSettings> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.keys(DEFAULTS) } } });
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    allowRegistration: typeof stored.allowRegistration === "boolean" ? stored.allowRegistration : DEFAULTS.allowRegistration,
  };
}

export async function updateAppSettings(patch: Partial<AppSettings>) {
  const entries = Object.entries(patch).filter(([key, value]) => key in DEFAULTS && value !== undefined);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue },
        update: { value: value as Prisma.InputJsonValue },
      }),
    ),
  );
  return getAppSettings();
}
