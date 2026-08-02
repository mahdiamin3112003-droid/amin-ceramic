import { PrismaClient } from "@prisma/client";

/**
 * The Prisma client singleton.
 *
 * Next's dev server hot-reloads modules, which without this guard creates a new
 * client — and a new connection pool — on every reload until the database
 * refuses connections. Stashing it on globalThis is the documented remedy.
 *
 * This is the ONLY module allowed to import from `@prisma/client`, alongside the
 * repositories beside it. An ESLint `no-restricted-imports` rule enforces that,
 * so Prisma types cannot leak past the infrastructure layer
 * (docs/01-architecture.md §5.3, docs/03-database-design.md §15.4).
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
