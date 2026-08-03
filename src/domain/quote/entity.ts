/**
 * Quote basket — the domain entity.
 *
 * docs/01-architecture.md §5.3: the domain layer imports nothing.
 *
 * docs/04-api-architecture.md §11.1: "the basket is a draft quote_request
 * owned by the visitor, not a separate structure." This entity models that
 * draft state; `submitQuoteRequest` transitions it to `submitted` and
 * freezes the snapshot fields (docs/03-database-design.md §7.3 — "the most
 * important design decision in this domain").
 *
 * docs/02-ux-blueprint.md §3.7: grouped by zone (room), because "zone
 * grouping is what turns a cart into a project document."
 */

export type QuoteRequestId = string & { readonly __brand: "QuoteRequestId" };
export type QuoteZoneId = string & { readonly __brand: "QuoteZoneId" };
export type QuoteItemId = string & { readonly __brand: "QuoteItemId" };

export type QuoteRequestStatus =
  | "draft"
  | "submitted"
  | "acknowledged"
  | "quoted"
  | "negotiating"
  | "won"
  | "lost"
  | "expired"
  | "cancelled";

export interface QuoteZone {
  readonly id: QuoteZoneId;
  readonly name: string;
  readonly spaceType: string | null;
  readonly areaM2: number;
  readonly layoutPatternKey: string | null;
  readonly wastagePct: number;
  readonly sortOrder: number;
}

/** One basket line — computed quantities are resolved server-side (§6.4), never client-side. */
export interface QuoteItem {
  readonly id: QuoteItemId;
  readonly zoneId: QuoteZoneId | null;
  readonly productId: string;

  readonly quantityM2: number;
  readonly quantityBoxes: number | null;
  readonly quantityPieces: number | null;

  /** Snapshot at add-time — what the line renders, independent of later product edits (§7.3). */
  readonly skuSnapshot: string;
  readonly nameSnapshot: string;
  readonly unitPriceSnapshot: number;
  readonly currencySnapshot: string;
  readonly m2PerBoxSnapshot: number | null;

  readonly lineTotal: number;
  readonly isSingleLot: boolean | null;
  readonly notes: string | null;
}

export interface QuoteBasket {
  readonly id: QuoteRequestId;
  readonly status: QuoteRequestStatus;
  readonly zones: readonly QuoteZone[];
  /** Items with no zone sit in an implicit "unassigned" group in the UI. */
  readonly items: readonly QuoteItem[];
  readonly subtotal: number | null;
  readonly totalWeightKg: number | null;
  readonly currency: string | null;
}

export interface QuoteSubmissionResult {
  readonly reference: string;
  readonly quoteRequestId: QuoteRequestId;
  readonly expectedResponseHours: number;
  readonly whatsappDeepLink: string | null;
}

/** Zone-grouped view of a basket's items — what the UI actually renders (§3.7). */
export interface QuoteZoneGroup {
  readonly zone: QuoteZone | null;
  readonly items: readonly QuoteItem[];
  readonly zoneTotal: number;
}

export function groupItemsByZone(basket: QuoteBasket): readonly QuoteZoneGroup[] {
  const zonesById = new Map(basket.zones.map((zone) => [zone.id, zone]));
  const groups = new Map<QuoteZoneId | null, QuoteItem[]>();

  for (const item of basket.items) {
    const key = item.zoneId;
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const orderedKeys: (QuoteZoneId | null)[] = basket.zones.map((zone) => zone.id);
  if (groups.has(null)) {
    orderedKeys.push(null);
  }

  return orderedKeys
    .map((zoneId) => {
      const items = groups.get(zoneId) ?? [];
      return {
        zone: zoneId ? (zonesById.get(zoneId) ?? null) : null,
        items,
        zoneTotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
      };
    })
    .filter((group) => group.items.length > 0);
}

export function basketItemCount(basket: QuoteBasket): number {
  return basket.items.length;
}
