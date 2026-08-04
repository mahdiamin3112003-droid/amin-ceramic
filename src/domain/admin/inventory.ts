/**
 * Admin inventory types. `domain/` imports nothing (ADR-0003).
 */

export type MovementType =
  | "receipt"
  | "sale"
  | "reservation"
  | "release"
  | "transfer_out"
  | "transfer_in"
  | "adjustment"
  | "return"
  | "sample"
  | "damage"
  | "write_off"
  | "count_correction";

/**
 * The movement types a human may create from the admin UI.
 *
 * Deliberately a SUBSET. `sale`, `reservation` and `release` are written by
 * the quote and order flows; letting someone enter one by hand would put
 * the ledger out of step with the documents it is supposed to explain.
 * `transfer_*` need a paired counterpart at the other location and are left
 * to a dedicated transfer screen rather than faked as two adjustments.
 */
export const MANUAL_MOVEMENT_TYPES = [
  "receipt",
  "adjustment",
  "damage",
  "write_off",
  "count_correction",
  "return",
] as const;

export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

/**
 * Which manual movements ADD stock. Everything else reduces it.
 *
 * The sign is derived here rather than typed by the user: asking a
 * warehouse hand to enter "-12.5" is how you get "12.5" and a phantom
 * pallet. They enter a magnitude; this decides the direction.
 */
const ADDITIVE: ReadonlySet<string> = new Set(["receipt", "return"]);

export function signedQuantity(
  type: ManualMovementType,
  magnitude: number,
): number {
  const size = Math.abs(magnitude);
  // `count_correction` is the exception: a stocktake can go either way, so
  // its sign is the user's to state and is passed through as given.
  if (type === "count_correction") return magnitude;
  return ADDITIVE.has(type) ? size : -size;
}

/** A reason is mandatory for these — the CHECK constraint enforces it too. */
export function requiresReason(type: ManualMovementType): boolean {
  return type === "adjustment" || type === "damage" || type === "write_off";
}

export interface StockRow {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly quantityM2: number;
  readonly reservedM2: number;
  readonly availableM2: number;
  readonly lotCount: number;
  readonly largestLotM2: number | null;
  readonly stockStatus: string;
  readonly restockEta: Date | null;
}

export interface StockLotRow {
  readonly id: string;
  readonly productId: string;
  readonly sku: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly lotNumber: string;
  readonly caliber: string | null;
  readonly shadeCode: string | null;
  readonly quantityM2: number;
  readonly reservedM2: number;
  readonly availableM2: number;
  readonly boxes: number | null;
  readonly status: string;
  readonly receivedAt: Date | null;
}

export interface MovementRow {
  readonly id: string;
  readonly productId: string;
  readonly sku: string;
  readonly locationName: string;
  readonly lotNumber: string;
  readonly movementType: MovementType;
  readonly quantityM2: number;
  readonly reason: string | null;
  readonly performedByEmail: string | null;
  readonly occurredAt: Date;
}

export interface Paged<T> {
  readonly rows: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
