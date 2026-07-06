import { PrismaClient } from "./generated/prisma/client.js";

/**
 * Shared Prisma client for Rovrum. Import from other packages/workers as:
 *
 *   import { prisma } from "@rovrum/db";
 *
 * A single instance is reused across hot-reloads in dev to avoid exhausting
 * database connections.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "./generated/prisma/client.js";
