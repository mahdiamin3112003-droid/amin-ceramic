import type { Tenant as PrismaTenant } from "@prisma/client";

import type { Tenant, TenantId } from "@/domain/tenant/entity";
import { prisma } from "@/infrastructure/db/client";

/**
 * Tenant repository.
 *
 * docs/03-database-design.md §15.4 / docs/01-architecture.md §5.3:
 * "Repositories return domain types, not Prisma types."
 *
 * The mapper below is the boundary. It is where `Decimal` becomes `number`,
 * where the `settings` JSONB blob is dropped because no caller should reach into
 * it, and where the database's shape stops being anyone else's problem.
 */

/**
 * Prisma returns Decimal for numeric columns to avoid float precision loss.
 * Percentages are small and bounded, so a JS number is safe here — MONEY is not,
 * and will stay Decimal all the way to the presentation layer (§0.4: "Money is
 * numeric(12,4) + currency. Never float").
 */
function toDomain(row: PrismaTenant): Tenant {
  return {
    id: row.id as TenantId,
    slug: row.slug,
    name: row.name,
    legalName: row.legalName,
    defaultLocale: row.defaultLocale,
    supportedLocales: row.supportedLocales,
    defaultCurrency: row.defaultCurrency,
    measurementSystem: row.measurementSystem,
    defaultWastagePct: row.defaultWastagePct.toNumber(),
  };
}

export async function findTenantBySlug(slug: string): Promise<Tenant | null> {
  const row = await prisma.tenant.findUnique({ where: { slug } });
  return row ? toDomain(row) : null;
}

export async function findTenantById(id: TenantId): Promise<Tenant | null> {
  const row = await prisma.tenant.findUnique({ where: { id } });
  return row ? toDomain(row) : null;
}

/**
 * The active tenant.
 *
 * v1 has exactly one, so this reads it directly. When multi-tenancy activates
 * (§19.3) resolution moves to hostname lookup in edge middleware and this
 * becomes a lookup by the resolved id — the call sites do not change, which is
 * the point of routing every read through here.
 */
export async function findActiveTenant(): Promise<Tenant | null> {
  const row = await prisma.tenant.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
  });
  return row ? toDomain(row) : null;
}
