import type { ProductId } from "@/domain/product/entity";
import type { QuoteBasket } from "@/domain/quote/entity";
import { getProductDetailById } from "@/infrastructure/db/repositories/product-repository";
import {
  addBasketItem as addBasketItemRepo,
  addZone as addZoneRepo,
  clearBasket as clearBasketRepo,
  removeBasketItem as removeBasketItemRepo,
  removeZone as removeZoneRepo,
  renameZone as renameZoneRepo,
  setZoneDimensions as setZoneDimensionsRepo,
  updateBasketItemQuantity as updateBasketItemQuantityRepo,
} from "@/infrastructure/db/repositories/quote-repository";
import {
  getRequestContext,
  withRequestContext,
} from "@/infrastructure/db/request-context";

/**
 * Basket mutation use-cases. Unlike the read use-cases in this module,
 * these throw rather than returning a `{ data, error }` shape — a failed
 * write is not a designed empty state, it is something the caller (a
 * Server Action, task #33) must surface to the visitor and let them retry.
 *
 * `visitorId` absent means the `ac_vid` cookie failed to mint or verify
 * (missing `VISITOR_COOKIE_SECRET`, tampered cookie) — every mutation here
 * requires one, so it throws immediately rather than letting the
 * repository's `visitorId!` assumptions produce a confusing failure
 * further down.
 */

interface AddBasketItemRequest {
  readonly productId: string;
  readonly requiredM2: number;
  readonly zoneId?: string;
  readonly notes?: string;
}

export async function addBasketItem(
  locale: string,
  input: AddBasketItemRequest,
): Promise<QuoteBasket> {
  const { tenantId, visitorId } = await getRequestContext();
  if (!visitorId) throw new Error("visitor session unavailable");

  return withRequestContext({ tenantId, visitorId }, async (tx) => {
    const product = await getProductDetailById(
      tx,
      tenantId,
      locale,
      input.productId as ProductId,
    );
    if (!product) throw new Error("product not found");
    if (product.basePrice === null) throw new Error("product has no public price");

    return addBasketItemRepo(tx, tenantId, visitorId, {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      unitPrice: product.basePrice,
      currency: product.currency,
      m2PerBox: product.m2PerBox,
      kgPerBox: product.kgPerBox,
      requiredM2: input.requiredM2,
      zoneId: input.zoneId,
      notes: input.notes,
    });
  });
}

export async function updateBasketItem(
  itemId: string,
  requiredM2: number,
): Promise<QuoteBasket> {
  const { tenantId, visitorId } = await getRequestContext();
  if (!visitorId) throw new Error("visitor session unavailable");

  return withRequestContext({ tenantId, visitorId }, (tx) =>
    updateBasketItemQuantityRepo(tx, tenantId, visitorId, itemId, requiredM2),
  );
}

export async function removeBasketItem(itemId: string): Promise<QuoteBasket> {
  const { tenantId, visitorId } = await getRequestContext();
  if (!visitorId) throw new Error("visitor session unavailable");

  return withRequestContext({ tenantId, visitorId }, (tx) =>
    removeBasketItemRepo(tx, tenantId, visitorId, itemId),
  );
}

interface AddZoneRequest {
  readonly name: string;
  readonly spaceType?: string;
  readonly areaM2: number;
  readonly wastagePct: number;
}

export async function addZone(input: AddZoneRequest): Promise<QuoteBasket> {
  const { tenantId, visitorId } = await getRequestContext();
  if (!visitorId) throw new Error("visitor session unavailable");

  return withRequestContext({ tenantId, visitorId }, (tx) =>
    addZoneRepo(tx, tenantId, visitorId, input),
  );
}

export async function renameZone(
  zoneId: string,
  name: string,
): Promise<QuoteBasket> {
  const { tenantId, visitorId } = await getRequestContext();
  if (!visitorId) throw new Error("visitor session unavailable");

  return withRequestContext({ tenantId, visitorId }, (tx) =>
    renameZoneRepo(tx, tenantId, visitorId, zoneId, name),
  );
}

export async function removeZone(zoneId: string): Promise<QuoteBasket> {
  const { tenantId, visitorId } = await getRequestContext();
  if (!visitorId) throw new Error("visitor session unavailable");

  return withRequestContext({ tenantId, visitorId }, (tx) =>
    removeZoneRepo(tx, tenantId, visitorId, zoneId),
  );
}

export async function setZoneDimensions(
  zoneId: string,
  areaM2: number,
  wastagePct: number,
): Promise<QuoteBasket> {
  const { tenantId, visitorId } = await getRequestContext();
  if (!visitorId) throw new Error("visitor session unavailable");

  return withRequestContext({ tenantId, visitorId }, (tx) =>
    setZoneDimensionsRepo(tx, tenantId, visitorId, zoneId, areaM2, wastagePct),
  );
}

export async function clearBasket(): Promise<void> {
  const { tenantId, visitorId } = await getRequestContext();
  if (!visitorId) throw new Error("visitor session unavailable");

  await withRequestContext({ tenantId, visitorId }, (tx) =>
    clearBasketRepo(tx, tenantId, visitorId),
  );
}
