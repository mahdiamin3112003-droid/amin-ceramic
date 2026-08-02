/**
 * Location — the domain entity.
 *
 * docs/01-architecture.md §5.3: the domain layer imports nothing.
 *
 * docs/03-database-design.md §6.2: warehouses and showrooms are the same
 * entity with different capabilities. Carries what the site's showroom
 * locator and "see it in person" links need — not the booking/inventory
 * configuration columns, which belong to the phases that build those flows.
 */

export type LocationId = string & { readonly __brand: "LocationId" };
export type LocationType = "warehouse" | "showroom" | "hybrid";

export interface Location {
  readonly id: LocationId;
  readonly slug: string;
  readonly name: string;
  readonly locationType: LocationType;
  readonly holdsSellableStock: boolean;

  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;

  readonly latitude: number | null;
  readonly longitude: number | null;

  readonly phone: string | null;
  readonly whatsapp: string | null;
  readonly email: string | null;
}
