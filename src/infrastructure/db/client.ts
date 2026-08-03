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
 *
 * Connects as `app_runtime` (`RUNTIME_DATABASE_URL`), never as the `postgres`
 * superuser `DATABASE_URL`/`DIRECT_URL` use for migrations — Postgres never
 * applies row-level security to superusers, so a client on the superuser
 * connection would silently bypass every RLS policy. See
 * prisma/migrations/20260803120000_app_runtime_role. Every request-scoped
 * query should go through `withRequestContext` (./request-context.ts), which
 * stamps the tenant/visitor/staff claims RLS depends on; this bare client is
 * for tenant-independent reads only (e.g. resolving the active tenant itself).
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const runtimeDatabaseUrl = process.env.RUNTIME_DATABASE_URL;
if (!runtimeDatabaseUrl) {
  throw new Error(
    "RUNTIME_DATABASE_URL is not set. The app must not fall back to DATABASE_URL " +
      "(the postgres superuser) — that connection bypasses RLS entirely. See .env.example.",
  );
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: runtimeDatabaseUrl,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
