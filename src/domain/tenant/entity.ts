/**
 * Tenant — the domain entity.
 *
 * docs/01-architecture.md §5.3: "The domain layer imports nothing. No Prisma, no
 * React, no fetch. It will outlive every other layer."
 *
 * That is enforced by eslint-plugin-boundaries, including for npm packages —
 * there is not even a zod import here. Validation happens at the application
 * boundary (docs/04-api-architecture.md §19.1); what reaches this layer is
 * already parsed.
 *
 * Note that this is deliberately NOT the shape of the `tenant` table. It carries
 * what the application needs and nothing else: no `settings` blob, no audit
 * timestamps. Repositories map to this (docs/03-database-design.md §15.4), which
 * is what stops the database shape leaking into components.
 */

/** Branded so a bare string cannot be passed where a tenant id is expected. */
export type TenantId = string & { readonly __brand: "TenantId" };

export type MeasurementSystem = "metric" | "imperial";

export interface Tenant {
  readonly id: TenantId;
  readonly slug: string;
  readonly name: string;
  readonly legalName: string | null;
  readonly defaultLocale: string;
  readonly supportedLocales: readonly string[];
  readonly defaultCurrency: string;
  readonly measurementSystem: MeasurementSystem;
  /**
   * Percentage, 0–100. The starting point for the tile calculator, overridable
   * per product and per layout pattern — herringbone genuinely needs ~15% where
   * a straight grid needs ~7% (docs/02-ux-blueprint.md §8.2 item 11).
   */
  readonly defaultWastagePct: number;
}

/**
 * Is this locale one the tenant actually publishes?
 *
 * Pure, and therefore trivially testable — which is the entire argument for
 * keeping rules like this out of the components that consume them.
 */
export function supportsLocale(tenant: Tenant, locale: string): boolean {
  return tenant.supportedLocales.includes(locale);
}

/** The locale to render in, falling back when the requested one is not published. */
export function resolveLocale(tenant: Tenant, requested: string): string {
  return supportsLocale(tenant, requested) ? requested : tenant.defaultLocale;
}
