import type { Prisma, Location as PrismaLocation } from "@prisma/client";

import type { Location, LocationId } from "@/domain/inventory/entity";

/**
 * Location repository.
 *
 * docs/03-database-design.md §15.4: repositories return domain types, not
 * Prisma types.
 *
 * Unlike `tenant`, `location`'s SELECT policy is tenant-scoped, not public
 * (`tenant_id = app.tenant_id() AND ((is_active AND is_public) OR
 * app.has_permission('content.manage'))` — confirmed live via `pg_policies`).
 * Both functions here therefore take a claims-stamped `tx` from
 * `withRequestContext`, same as every other tenant-scoped repository — a
 * bare `prisma` read would see `app.tenant_id()` resolve NULL and RLS would
 * fail closed to zero rows, which is exactly the bug this replaced (found
 * live: the sample-order dialog's showroom picker was always empty).
 */

function toDomain(row: PrismaLocation): Location {
  return {
    id: row.id as LocationId,
    slug: row.slug,
    name: row.name,
    locationType: row.locationType,
    holdsSellableStock: row.holdsSellableStock,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    countryCode: row.countryCode,
    latitude: row.latitude ? row.latitude.toNumber() : null,
    longitude: row.longitude ? row.longitude.toNumber() : null,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: row.email,
  };
}

/** Active, publicly listed locations — the showroom locator's and sample-order dialog's data source. */
export async function listActiveLocations(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<Location[]> {
  const rows = await tx.location.findMany({
    where: { tenantId, isActive: true, isPublic: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(toDomain);
}

export async function findLocationBySlug(
  tx: Prisma.TransactionClient,
  tenantId: string,
  slug: string,
): Promise<Location | null> {
  const row = await tx.location.findFirst({
    where: { tenantId, slug, isActive: true, isPublic: true },
  });
  return row ? toDomain(row) : null;
}
