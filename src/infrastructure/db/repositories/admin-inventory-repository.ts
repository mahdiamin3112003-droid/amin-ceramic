import type { Prisma } from "@prisma/client";

import type {
  ManualMovementType,
  MovementRow,
  Paged,
  StockLotRow,
  StockRow,
} from "@/domain/admin/inventory";

/**
 * Admin inventory repository — the Phase 1 ledger, read and appended to.
 *
 * THE ONLY WRITE HERE IS AN INSERT INTO `inventory_movement`. Nothing
 * touches `stock_lot` or `product_stock` directly: two database triggers
 * derive them (`inventory_movement_apply_to_stock_lot`, then
 * `stock_lot_refresh_product_stock`). Writing the derived tables from the
 * application would race those triggers and produce totals that disagree
 * with the ledger that is supposed to explain them.
 */

const PAGE_SIZE = 50;

function toNumber(value: Prisma.Decimal | null): number {
  return value === null ? 0 : value.toNumber();
}

export async function listStock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  filter: { query?: string; locationId?: string; lowOnly?: boolean; page?: number },
): Promise<Paged<StockRow>> {
  const page = Math.max(1, filter.page ?? 1);

  const where: Prisma.ProductStockWhereInput = {
    tenantId,
    // `locationId: null` is the tenant-wide roll-up row (docs/03 §6.6).
    // Without a location filter we show the roll-up, which is the number
    // staff mean by "how much do we have".
    locationId: filter.locationId ?? null,
    ...(filter.lowOnly
      ? { stockStatus: { in: ["low_stock", "out_of_stock"] } }
      : {}),
    ...(filter.query
      ? {
          product: {
            OR: [
              { sku: { contains: filter.query, mode: "insensitive" as const } },
              {
                translations: {
                  some: {
                    name: { contains: filter.query, mode: "insensitive" as const },
                  },
                },
              },
            ],
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    tx.productStock.findMany({
      where,
      orderBy: [{ stockStatus: "asc" }, { availableM2: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        productId: true,
        locationId: true,
        quantityM2: true,
        reservedM2: true,
        availableM2: true,
        lotCount: true,
        largestLotM2: true,
        stockStatus: true,
        restockEta: true,
        product: {
          select: {
            sku: true,
            translations: { where: { locale: "en" }, select: { name: true } },
          },
        },
        location: {
          select: {
            translations: { where: { locale: "en" }, select: { name: true } },
          },
        },
      },
    }),
    tx.productStock.count({ where }),
  ]);

  return {
    rows: rows.map((row): StockRow => ({
      productId: row.productId,
      sku: row.product.sku,
      name: row.product.translations[0]?.name ?? row.product.sku,
      locationId: row.locationId,
      locationName: row.location?.translations[0]?.name ?? null,
      quantityM2: toNumber(row.quantityM2),
      reservedM2: toNumber(row.reservedM2),
      availableM2: toNumber(row.availableM2),
      lotCount: row.lotCount,
      largestLotM2: row.largestLotM2 === null ? null : row.largestLotM2.toNumber(),
      stockStatus: row.stockStatus,
      restockEta: row.restockEta,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function listStockLots(
  tx: Prisma.TransactionClient,
  tenantId: string,
  filter: { productId?: string; locationId?: string; page?: number },
): Promise<Paged<StockLotRow>> {
  const page = Math.max(1, filter.page ?? 1);

  const where: Prisma.StockLotWhereInput = {
    tenantId,
    ...(filter.productId ? { productId: filter.productId } : {}),
    ...(filter.locationId ? { locationId: filter.locationId } : {}),
  };

  const [rows, total] = await Promise.all([
    tx.stockLot.findMany({
      where,
      orderBy: [{ receivedAt: "desc" }, { lotNumber: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        productId: true,
        locationId: true,
        lotNumber: true,
        caliber: true,
        shadeCode: true,
        quantityM2: true,
        reservedM2: true,
        availableM2: true,
        boxes: true,
        status: true,
        receivedAt: true,
        product: { select: { sku: true } },
        location: {
          select: {
            translations: { where: { locale: "en" }, select: { name: true } },
          },
        },
      },
    }),
    tx.stockLot.count({ where }),
  ]);

  return {
    rows: rows.map((row): StockLotRow => ({
      id: row.id,
      productId: row.productId,
      sku: row.product.sku,
      locationId: row.locationId,
      locationName: row.location.translations[0]?.name ?? row.locationId,
      lotNumber: row.lotNumber,
      caliber: row.caliber,
      shadeCode: row.shadeCode,
      quantityM2: toNumber(row.quantityM2),
      reservedM2: toNumber(row.reservedM2),
      // Generated column — `quantity - reserved`, computed by Postgres.
      availableM2: toNumber(row.availableM2),
      boxes: row.boxes,
      status: row.status,
      receivedAt: row.receivedAt,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function listMovements(
  tx: Prisma.TransactionClient,
  tenantId: string,
  filter: { productId?: string; locationId?: string; page?: number },
): Promise<Paged<MovementRow>> {
  const page = Math.max(1, filter.page ?? 1);

  const where: Prisma.InventoryMovementWhereInput = {
    tenantId,
    ...(filter.productId ? { productId: filter.productId } : {}),
    ...(filter.locationId ? { locationId: filter.locationId } : {}),
  };

  const [rows, total] = await Promise.all([
    tx.inventoryMovement.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        productId: true,
        movementType: true,
        quantityM2: true,
        reason: true,
        occurredAt: true,
        performedBy: true,
        product: { select: { sku: true } },
        stockLot: { select: { lotNumber: true } },
        location: {
          select: {
            translations: { where: { locale: "en" }, select: { name: true } },
          },
        },
      },
    }),
    tx.inventoryMovement.count({ where }),
  ]);

  // `performedBy` is a bare uuid with no FK to app_user (the ledger must
  // survive a staff member being deleted), so the emails are resolved in a
  // second query rather than a join.
  const actorIds = [
    ...new Set(rows.map((r) => r.performedBy).filter((id) => id !== null)),
  ];
  const actors =
    actorIds.length > 0
      ? await tx.appUser.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true },
        })
      : [];
  const emailById = new Map(actors.map((a) => [a.id, a.email]));

  return {
    rows: rows.map((row): MovementRow => ({
      id: row.id,
      productId: row.productId,
      sku: row.product.sku,
      locationName: row.location.translations[0]?.name ?? "—",
      lotNumber: row.stockLot.lotNumber,
      movementType: row.movementType,
      quantityM2: row.quantityM2.toNumber(),
      reason: row.reason,
      performedByEmail:
        row.performedBy === null ? null : (emailById.get(row.performedBy) ?? null),
      occurredAt: row.occurredAt,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

/**
 * Find or create the lot a movement targets.
 *
 * Every movement references a lot — that is the derivation chain (§6.1). A
 * receipt for a lot number we have not seen creates it at zero and lets the
 * trigger apply the quantity, rather than inserting the quantity twice.
 */
export async function ensureStockLot(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: {
    productId: string;
    locationId: string;
    lotNumber: string;
    caliber: string | null;
    shadeCode: string | null;
  },
): Promise<{ id: string; created: boolean }> {
  const existing = await tx.stockLot.findFirst({
    where: {
      tenantId,
      productId: input.productId,
      locationId: input.locationId,
      lotNumber: input.lotNumber,
    },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const created = await tx.stockLot.create({
    data: {
      tenantId,
      productId: input.productId,
      locationId: input.locationId,
      lotNumber: input.lotNumber,
      caliber: input.caliber,
      shadeCode: input.shadeCode,
      // Zero, deliberately. The movement's trigger adds the quantity;
      // setting it here as well would double-count the receipt.
      quantityM2: 0,
      receivedAt: new Date(),
    },
    select: { id: true },
  });

  return { id: created.id, created: true };
}

/**
 * Append one movement.
 *
 * `$executeRaw`, not `.create()`. Two reasons, both structural:
 *
 * 1. Prisma's `.create()` always issues `INSERT ... RETURNING`, and
 *    Postgres applies the SELECT policy to the returned row.
 *    `inventory_movement`'s INSERT policy requires `inventory.adjust`
 *    while its SELECT requires `inventory.read` — every seeded role holds
 *    both, so this works today, but a future adjust-only role would break
 *    on a RETURNING nobody asked for. Same trap as `outbox_event` and
 *    `audit_log`.
 * 2. The table is RANGE-partitioned on `occurred_at` with a composite PK.
 *    A plain INSERT routes to the right partition without Prisma needing
 *    an opinion about it.
 */
export async function appendMovement(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorId: string,
  input: {
    productId: string;
    locationId: string;
    stockLotId: string;
    movementType: ManualMovementType;
    quantityM2: number;
    quantityBoxes: number | null;
    reason: string | null;
    occurredAt: Date;
  },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO inventory_movement (
      tenant_id, product_id, location_id, stock_lot_id,
      movement_type, quantity_m2, quantity_boxes,
      reference_type, reason, performed_by, occurred_at
    ) VALUES (
      ${tenantId}::uuid,
      ${input.productId}::uuid,
      ${input.locationId}::uuid,
      ${input.stockLotId}::uuid,
      ${input.movementType}::inventory_movement_type,
      ${input.quantityM2}::numeric,
      ${input.quantityBoxes},
      'manual'::inventory_reference_type,
      ${input.reason},
      ${actorId}::uuid,
      ${input.occurredAt}
    )
  `;
}

/** Products and locations for the adjustment form's selects. */
export async function getAdjustmentTargets(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<{
  products: readonly { id: string; label: string }[];
  locations: readonly { id: string; label: string }[];
}> {
  const [products, locations] = await Promise.all([
    tx.product.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        sku: true,
        translations: { where: { locale: "en" }, select: { name: true } },
      },
      orderBy: { sku: "asc" },
      // A select with every product is unusable past a few hundred; this is
      // a stopgap until the form gets a typeahead in Phase 9.
      take: 500,
    }),
    tx.location.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        translations: { where: { locale: "en" }, select: { name: true } },
      },
    }),
  ]);

  return {
    products: products.map((p) => ({
      id: p.id,
      label: `${p.sku} — ${p.translations[0]?.name ?? ""}`,
    })),
    locations: locations.map((l) => ({
      id: l.id,
      label: l.translations[0]?.name ?? l.id,
    })),
  };
}
