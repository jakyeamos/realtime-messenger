/**
 * Prisma Database Client
 * 
 * We use a singleton pattern to prevent creating multiple
 * database connections during development hot reloads.
 */

import { PrismaClient } from "@prisma/client";

// Extend globalThis to store prisma instance
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Create client or reuse existing one
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

// In development, store on globalThis to survive hot reloads
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
