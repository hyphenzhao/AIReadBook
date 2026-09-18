import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// One client per process in every environment: route bundles are evaluated
// separately, and each extra PrismaClient opens its own connection pool.
export const prisma = globalForPrisma.prisma || new PrismaClient();

globalForPrisma.prisma = prisma;
