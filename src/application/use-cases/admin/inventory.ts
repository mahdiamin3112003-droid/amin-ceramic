import { adminMutation, adminQuery } from "@/application/auth/admin-mutation";
import {
  requiresReason,
  signedQuantity,
  type ManualMovementType,
  type MovementRow,
  type Paged,
  type StockLotRow,
  type StockRow,
} from "@/domain/admin/inventory";
import {
  appendMovement,
  ensureStockLot,
  getAdjustmentTargets,
  listMovements,
  listStock,
  listStockLots,
} from "@/infrastructure/db/repositories/admin-inventory-repository";

/**
 * Inventory use-cases.
 *
 * Reads need `inventory.read`; the single write needs `inventory.adjust`,
 * matching the RLS policies on `inventory_movement` exactly. That
 * correspondence is the point of enforcement layer 2 — the permission
 * string here and the one in the policy are the same string, so a mismatch
 * shows up as a query returning nothing rather than as silent over-access.
 */

export async function listStockForAdmin(filter: {
  query?: string;
  locationId?: string;
  lowOnly?: boolean;
  page?: number;
}): Promise<Paged<StockRow>> {
  return adminQuery("inventory.read", (tx, ctx) =>
    listStock(tx, ctx.tenantId, filter),
  );
}

export async function listLotsForAdmin(filter: {
  productId?: string;
  locationId?: string;
  page?: number;
}): Promise<Paged<StockLotRow>> {
  return adminQuery("inventory.read", (tx, ctx) =>
    listStockLots(tx, ctx.tenantId, filter),
  );
}

export async function listMovementsForAdmin(filter: {
  productId?: string;
  locationId?: string;
  page?: number;
}): Promise<Paged<MovementRow>> {
  return adminQuery("inventory.read", (tx, ctx) =>
    listMovements(tx, ctx.tenantId, filter),
  );
}

export async function getInventoryTargets(): Promise<{
  products: readonly { id: string; label: string }[];
  locations: readonly { id: string; label: string }[];
}> {
  return adminQuery("inventory.read", (tx, ctx) =>
    getAdjustmentTargets(tx, ctx.tenantId),
  );
}

/**
 * Record a stock movement.
 *
 * The whole operation is one transaction: find-or-create the lot, append
 * the movement, write the audit row. The triggers that update `stock_lot`
 * and `product_stock` fire inside it too, so either every derived total
 * moves together or none of them does. A partially-applied stock change is
 * the failure mode worth designing against here — it is the one nobody
 * notices until a customer is quoted tile that does not exist.
 */
export async function recordMovement(input: {
  productId: string;
  locationId: string;
  lotNumber: string;
  caliber: string | null;
  shadeCode: string | null;
  movementType: ManualMovementType;
  quantityM2: number;
  quantityBoxes: number | null;
  reason: string | null;
  occurredAt?: Date;
}): Promise<void> {
  return adminMutation("inventory.adjust", async (tx, ctx) => {
    // Checked here as well as by the database CHECK constraint. The
    // constraint is the guarantee; this is what produces a sentence a
    // person can act on instead of a Postgres error string.
    if (requiresReason(input.movementType) && !input.reason?.trim()) {
      throw new Error(`a reason is required for a ${input.movementType} movement`);
    }

    const lot = await ensureStockLot(tx, ctx.tenantId, {
      productId: input.productId,
      locationId: input.locationId,
      lotNumber: input.lotNumber,
      caliber: input.caliber,
      shadeCode: input.shadeCode,
    });

    // The user entered a magnitude; the movement type decides the sign.
    const quantityM2 = signedQuantity(input.movementType, input.quantityM2);

    await appendMovement(tx, ctx.tenantId, ctx.appUserId, {
      productId: input.productId,
      locationId: input.locationId,
      stockLotId: lot.id,
      movementType: input.movementType,
      quantityM2,
      quantityBoxes: input.quantityBoxes,
      reason: input.reason,
      occurredAt: input.occurredAt ?? new Date(),
    });

    return {
      result: undefined,
      audit: {
        action: `inventory.${input.movementType}`,
        entityType: "stock_lot",
        entityId: lot.id,
        entityLabel: input.lotNumber,
        after: {
          productId: input.productId,
          locationId: input.locationId,
          movementType: input.movementType,
          quantityM2,
          lotCreated: lot.created,
        },
        ...(input.reason ? { reason: input.reason } : {}),
      },
    };
  });
}
