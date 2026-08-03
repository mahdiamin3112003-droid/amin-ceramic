import type { Prisma } from "@prisma/client";

import { ensureVisitor } from "@/infrastructure/db/repositories/visitor-repository";

/**
 * Wishlist repository — `saved_item`, keyed on visitor (docs/03-database-design.md §8.1).
 */

export async function listWishlistProductIds(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
): Promise<readonly string[]> {
  const rows = await tx.savedItem.findMany({
    where: { tenantId, visitorId },
    select: { productId: true },
  });
  return rows.map((row) => row.productId);
}

export async function isWishlisted(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
  productId: string,
): Promise<boolean> {
  const row = await tx.savedItem.findFirst({
    where: { tenantId, visitorId, productId },
  });
  return row !== null;
}

/** Idempotent — adding an already-saved product is a no-op, not an error. */
export async function addToWishlist(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
  productId: string,
): Promise<void> {
  await ensureVisitor(tx, tenantId, visitorId);
  await tx.savedItem.upsert({
    where: { visitorId_productId: { visitorId, productId } },
    update: {},
    create: { tenantId, visitorId, productId },
  });
}

export async function removeFromWishlist(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
  productId: string,
): Promise<void> {
  await tx.savedItem.deleteMany({ where: { tenantId, visitorId, productId } });
}
