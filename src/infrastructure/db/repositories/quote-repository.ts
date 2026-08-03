import type { Prisma } from "@prisma/client";

import {
  calculateBoxesNeeded,
  calculateWeightKg,
} from "@/domain/quantity/calculator";
import type {
  QuoteBasket,
  QuoteItem,
  QuoteItemId,
  QuoteRequestId,
  QuoteSubmissionResult,
  QuoteZone,
  QuoteZoneId,
} from "@/domain/quote/entity";
import { ensureVisitor } from "@/infrastructure/db/repositories/visitor-repository";

/**
 * Quote basket repository.
 *
 * docs/04-api-architecture.md §11.1: "the basket is a draft quote_request
 * owned by the visitor, not a separate structure." Every mutation here
 * either finds the visitor's one `draft` quote_request or creates it.
 */

const BASKET_INCLUDE = {
  zones: { orderBy: { sortOrder: "asc" as const } },
  items: true,
} satisfies Prisma.QuoteRequestInclude;

type BasketRow = Prisma.QuoteRequestGetPayload<{ include: typeof BASKET_INCLUDE }>;

function toDomain(row: BasketRow): QuoteBasket {
  return {
    id: row.id as QuoteRequestId,
    status: row.status,
    zones: row.zones.map((zone): QuoteZone => ({
      id: zone.id as QuoteZoneId,
      name: zone.name,
      spaceType: zone.spaceType,
      areaM2: zone.areaM2.toNumber(),
      layoutPatternKey: null,
      wastagePct: zone.wastagePct.toNumber(),
      sortOrder: zone.sortOrder,
    })),
    items: row.items.map((item): QuoteItem => ({
      id: item.id as QuoteItemId,
      zoneId: item.zoneId as QuoteZoneId | null,
      productId: item.productId,
      quantityM2: item.quantityM2.toNumber(),
      quantityBoxes: item.quantityBoxes,
      quantityPieces: item.quantityPieces,
      skuSnapshot: item.skuSnapshot,
      nameSnapshot: item.nameSnapshot,
      unitPriceSnapshot: item.unitPriceSnapshot.toNumber(),
      currencySnapshot: item.currencySnapshot,
      m2PerBoxSnapshot: item.m2PerBoxSnapshot?.toNumber() ?? null,
      lineTotal: item.lineTotal.toNumber(),
      isSingleLot: item.isSingleLot,
      notes: item.notes,
    })),
    subtotal: row.subtotal?.toNumber() ?? null,
    totalWeightKg: row.totalWeightKg?.toNumber() ?? null,
    currency: row.currency,
  };
}

function generateReference(): string {
  const year = new Date().getFullYear();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `AC-${String(year)}-${String(suffix)}`;
}

async function getOrCreateDraft(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
): Promise<BasketRow> {
  const existing = await tx.quoteRequest.findFirst({
    where: { tenantId, visitorId, status: "draft" },
    include: BASKET_INCLUDE,
  });
  if (existing) return existing;

  await ensureVisitor(tx, tenantId, visitorId);

  return tx.quoteRequest.create({
    data: {
      tenantId,
      visitorId,
      reference: generateReference(),
      status: "draft",
      source: "catalog",
      currency: "USD",
    },
    include: BASKET_INCLUDE,
  });
}

async function recomputeTotals(
  tx: Prisma.TransactionClient,
  quoteRequestId: string,
): Promise<void> {
  const items = await tx.quoteRequestItem.findMany({ where: { quoteRequestId } });
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal.toNumber(), 0);
  const totalWeightKg = items.reduce((sum, item) => {
    const boxes = item.quantityBoxes ?? 0;
    const kgPerBox = item.kgPerBoxSnapshot?.toNumber() ?? 0;
    return sum + (kgPerBox > 0 ? calculateWeightKg(boxes, kgPerBox) : 0);
  }, 0);
  await tx.quoteRequest.update({
    where: { id: quoteRequestId },
    data: { subtotal, totalWeightKg },
  });
}

export async function getBasket(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
): Promise<QuoteBasket | null> {
  const row = await tx.quoteRequest.findFirst({
    where: { tenantId, visitorId, status: "draft" },
    include: BASKET_INCLUDE,
  });
  return row ? toDomain(row) : null;
}

export interface AddBasketItemInput {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly unitPrice: number;
  readonly currency: string;
  readonly m2PerBox: number;
  readonly kgPerBox: number;
  readonly requiredM2: number;
  readonly zoneId?: string;
  readonly notes?: string;
}

/**
 * Adds a line. Quantity is charged in whole boxes (standard tile-commerce
 * practice — you can't buy a fraction of a box): `requiredM2` is rounded up
 * via the domain calculator (src/domain/quantity/calculator.ts), never
 * client-side or approximated here.
 */
export async function addBasketItem(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
  input: AddBasketItemInput,
): Promise<QuoteBasket> {
  const draft = await getOrCreateDraft(tx, tenantId, visitorId);

  const boxes = calculateBoxesNeeded(input.requiredM2, input.m2PerBox);
  const suppliedM2 = boxes * input.m2PerBox;
  const lineTotal = suppliedM2 * input.unitPrice;

  await tx.quoteRequestItem.create({
    data: {
      quoteRequestId: draft.id,
      zoneId: input.zoneId ?? null,
      productId: input.productId,
      quantityM2: suppliedM2,
      quantityBoxes: boxes,
      skuSnapshot: input.sku,
      nameSnapshot: input.name,
      unitPriceSnapshot: input.unitPrice,
      currencySnapshot: input.currency,
      m2PerBoxSnapshot: input.m2PerBox,
      kgPerBoxSnapshot: input.kgPerBox,
      lineTotal,
      notes: input.notes,
    },
  });

  await recomputeTotals(tx, draft.id);
  return getBasket(tx, tenantId, visitorId) as Promise<QuoteBasket>;
}

export async function updateBasketItemQuantity(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
  itemId: string,
  requiredM2: number,
): Promise<QuoteBasket> {
  const item = await tx.quoteRequestItem.findFirst({
    where: { id: itemId, quoteRequest: { tenantId, visitorId, status: "draft" } },
  });
  if (!item) throw new Error("basket item not found");

  const m2PerBox = item.m2PerBoxSnapshot?.toNumber() ?? 1;
  const boxes = calculateBoxesNeeded(requiredM2, m2PerBox);
  const suppliedM2 = boxes * m2PerBox;
  const lineTotal = suppliedM2 * item.unitPriceSnapshot.toNumber();

  await tx.quoteRequestItem.update({
    where: { id: itemId },
    data: { quantityM2: suppliedM2, quantityBoxes: boxes, lineTotal },
  });

  await recomputeTotals(tx, item.quoteRequestId);
  return getBasket(tx, tenantId, visitorId) as Promise<QuoteBasket>;
}

export async function removeBasketItem(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
  itemId: string,
): Promise<QuoteBasket> {
  const item = await tx.quoteRequestItem.findFirst({
    where: { id: itemId, quoteRequest: { tenantId, visitorId, status: "draft" } },
  });
  if (!item) throw new Error("basket item not found");

  await tx.quoteRequestItem.delete({ where: { id: itemId } });
  await recomputeTotals(tx, item.quoteRequestId);
  return getBasket(tx, tenantId, visitorId) as Promise<QuoteBasket>;
}

export interface AddZoneInput {
  readonly name: string;
  readonly spaceType?: string;
  readonly areaM2: number;
  readonly wastagePct: number;
}

export async function addZone(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
  input: AddZoneInput,
): Promise<QuoteBasket> {
  const draft = await getOrCreateDraft(tx, tenantId, visitorId);
  const sortOrder = await tx.quoteRequestZone.count({
    where: { quoteRequestId: draft.id },
  });

  await tx.quoteRequestZone.create({
    data: {
      quoteRequestId: draft.id,
      name: input.name,
      spaceType: input.spaceType as never,
      areaM2: input.areaM2,
      wastagePct: input.wastagePct,
      sortOrder,
    },
  });

  return getBasket(tx, tenantId, visitorId) as Promise<QuoteBasket>;
}

export async function renameZone(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
  zoneId: string,
  name: string,
): Promise<QuoteBasket> {
  await tx.quoteRequestZone.update({
    where: { id: zoneId, quoteRequest: { tenantId, visitorId, status: "draft" } },
    data: { name },
  });
  return getBasket(tx, tenantId, visitorId) as Promise<QuoteBasket>;
}

/** Removing a zone reassigns its items to "unassigned" (zoneId null) — it never deletes them. */
export async function removeZone(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
  zoneId: string,
): Promise<QuoteBasket> {
  const zone = await tx.quoteRequestZone.findFirst({
    where: { id: zoneId, quoteRequest: { tenantId, visitorId, status: "draft" } },
  });
  if (!zone) throw new Error("zone not found");

  await tx.quoteRequestItem.updateMany({
    where: { zoneId },
    data: { zoneId: null },
  });
  await tx.quoteRequestZone.delete({ where: { id: zoneId } });
  return getBasket(tx, tenantId, visitorId) as Promise<QuoteBasket>;
}

export async function setZoneDimensions(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
  zoneId: string,
  areaM2: number,
  wastagePct: number,
): Promise<QuoteBasket> {
  await tx.quoteRequestZone.update({
    where: { id: zoneId, quoteRequest: { tenantId, visitorId, status: "draft" } },
    data: { areaM2, wastagePct },
  });
  return getBasket(tx, tenantId, visitorId) as Promise<QuoteBasket>;
}

export async function clearBasket(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
): Promise<void> {
  const draft = await tx.quoteRequest.findFirst({
    where: { tenantId, visitorId, status: "draft" },
  });
  if (!draft) return;
  await tx.quoteRequestItem.deleteMany({ where: { quoteRequestId: draft.id } });
  await tx.quoteRequestZone.deleteMany({ where: { quoteRequestId: draft.id } });
  await recomputeTotals(tx, draft.id);
}

export interface SubmitQuoteInput {
  readonly contactName: string;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly companyName?: string;
  readonly notes?: string;
  readonly source:
    | "catalog"
    | "tile_finder"
    | "assistant"
    | "project"
    | "showroom"
    | "whatsapp"
    | "direct";
}

const EXPECTED_RESPONSE_HOURS = 24;

/**
 * docs/04-api-architecture.md §11.2: one transaction — verify, snapshot
 * (already frozen at add-time here, so this step just re-affirms products
 * are still published), transition draft → submitted, write status history,
 * return the reference. Stock is NOT reserved here (§6.7 — only on staff
 * acceptance).
 */
export async function submitQuoteRequest(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
  input: SubmitQuoteInput,
): Promise<QuoteSubmissionResult> {
  const draft = await tx.quoteRequest.findFirst({
    where: { tenantId, visitorId, status: "draft" },
    include: { items: true },
  });
  if (!draft) throw new Error("no draft basket to submit");
  if (draft.items.length === 0) throw new Error("basket is empty");

  const now = new Date();
  await tx.quoteRequest.update({
    where: { id: draft.id },
    data: {
      status: "submitted",
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      companyName: input.companyName,
      notes: input.notes,
      source: input.source,
      submittedAt: now,
      expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30),
    },
  });

  await tx.quoteStatusHistory.create({
    data: { quoteRequestId: draft.id, fromStatus: "draft", toStatus: "submitted" },
  });

  // Plain INSERT, not tx.outboxEvent.create(): Prisma's .create() always
  // does INSERT ... RETURNING, and Postgres RLS applies the table's SELECT
  // policy to the returned row too — outbox_event's SELECT policy is
  // staff-only (audit.read), so a visitor's own insert would satisfy the
  // INSERT policy and still fail on the implicit RETURNING's SELECT check.
  // Found by testing this exact call against the real app_runtime role.
  await tx.$executeRaw`
    INSERT INTO outbox_event (tenant_id, event_type, aggregate_type, aggregate_id, payload)
    VALUES (${tenantId}::uuid, 'quote.submitted', 'quote_request', ${draft.id}::uuid, ${JSON.stringify({ reference: draft.reference, visitorId })}::jsonb)
  `;

  return {
    reference: draft.reference,
    quoteRequestId: draft.id as QuoteRequestId,
    expectedResponseHours: EXPECTED_RESPONSE_HOURS,
    whatsappDeepLink: null,
  };
}
