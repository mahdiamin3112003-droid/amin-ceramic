import type { Prisma } from "@prisma/client";

/**
 * Visitor repository.
 *
 * docs/04-api-architecture.md §4.2: "The `visitor` row is created lazily on
 * the first write (a save, a basket add, a finder upload) — not on the
 * first page view." The `ac_vid` cookie mints the id up front (§4.2, and
 * src/lib/visitor/cookie.ts), but nothing inserts the row until something
 * actually needs it — every FK from quote_request/saved_item/sample_request
 * etc. to visitor requires the row to exist first, so this is the shared
 * first step every mutation repository calls.
 */
export async function ensureVisitor(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
): Promise<void> {
  await tx.visitor.upsert({
    where: { id: visitorId },
    update: {},
    create: { id: visitorId, tenantId },
  });
}
