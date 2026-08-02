import type { Location as PrismaLocation } from "@prisma/client";

import type { Location, LocationId } from "@/domain/inventory/entity";
import { prisma } from "@/infrastructure/db/client";

/**
 * Location repository.
 *
 * docs/03-database-design.md §15.4: repositories return domain types, not
 * Prisma types.
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

/** Active, publicly listed locations — the showroom locator's data source. */
export async function listActiveLocations(): Promise<Location[]> {
  const rows = await prisma.location.findMany({
    where: { isActive: true, isPublic: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(toDomain);
}

export async function findLocationBySlug(slug: string): Promise<Location | null> {
  const row = await prisma.location.findFirst({
    where: { slug, isActive: true, isPublic: true },
  });
  return row ? toDomain(row) : null;
}
