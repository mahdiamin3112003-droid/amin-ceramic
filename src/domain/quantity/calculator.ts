/**
 * Quantity calculator — the domain entity.
 *
 * docs/01-architecture.md §5.3: the domain layer imports nothing. Pure
 * functions over already-validated numeric inputs; validation happens at the
 * application boundary (docs/04-api-architecture.md §19.1), not here.
 *
 * docs/03-database-design.md §3.4: layout patterns carry a default wastage
 * percentage (grid ~7%, herringbone ~15%); product.m2_per_box and
 * product.kg_per_box drive box/weight math. This is that arithmetic,
 * isolated so the quote basket, the project calculator and the admin quote
 * builder all compute the same number the same way.
 */

/**
 * Total m² to order for a room, including wastage. Wastage covers cuts,
 * breakage and pattern-matching loss — ordering exactly the room's area
 * guarantees a mid-installation shortfall.
 *
 * @throws {RangeError} if areaM2 is not positive, or wastagePct is negative.
 */
export function calculateAreaWithWastage(
  areaM2: number,
  wastagePct: number,
): number {
  if (!(areaM2 > 0)) {
    throw new RangeError(`areaM2 must be positive, got ${String(areaM2)}`);
  }
  if (wastagePct < 0) {
    throw new RangeError(
      `wastagePct must not be negative, got ${String(wastagePct)}`,
    );
  }
  return areaM2 * (1 + wastagePct / 100);
}

/**
 * Boxes required to cover a given area. Always rounds up — a partial box is
 * still a full box on the pallet, and under-ordering means a second trip
 * (or, worse, a different production lot for the missing piece, breaking
 * shade consistency).
 *
 * @throws {RangeError} if areaM2 is negative, or m2PerBox is not positive.
 */
export function calculateBoxesNeeded(areaM2: number, m2PerBox: number): number {
  if (areaM2 < 0) {
    throw new RangeError(`areaM2 must not be negative, got ${String(areaM2)}`);
  }
  if (!(m2PerBox > 0)) {
    throw new RangeError(`m2PerBox must be positive, got ${String(m2PerBox)}`);
  }
  return Math.ceil(areaM2 / m2PerBox);
}

/**
 * Total shipping weight for a given box count.
 *
 * @throws {RangeError} if boxes is negative or not an integer, or kgPerBox
 * is not positive.
 */
export function calculateWeightKg(boxes: number, kgPerBox: number): number {
  if (boxes < 0 || !Number.isInteger(boxes)) {
    throw new RangeError(
      `boxes must be a non-negative integer, got ${String(boxes)}`,
    );
  }
  if (!(kgPerBox > 0)) {
    throw new RangeError(`kgPerBox must be positive, got ${String(kgPerBox)}`);
  }
  return boxes * kgPerBox;
}

export interface QuantityEstimate {
  readonly areaWithWastageM2: number;
  readonly boxes: number;
  readonly weightKg: number;
}

/**
 * The end-to-end estimate a zone's line item needs: wastage-adjusted area,
 * boxes rounded up from that area, and the resulting weight. Composed from
 * the three functions above rather than duplicating their logic.
 */
export function estimateQuantity(
  areaM2: number,
  wastagePct: number,
  m2PerBox: number,
  kgPerBox: number,
): QuantityEstimate {
  const areaWithWastageM2 = calculateAreaWithWastage(areaM2, wastagePct);
  const boxes = calculateBoxesNeeded(areaWithWastageM2, m2PerBox);
  const weightKg = calculateWeightKg(boxes, kgPerBox);
  return { areaWithWastageM2, boxes, weightKg };
}
