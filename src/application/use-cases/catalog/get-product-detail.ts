import type {
  ProductDetail,
  ProductId,
  ProductRelationType,
  ProductSummary,
} from "@/domain/product/entity";
import {
  getProductDetailById,
  getProductDetailBySlug,
  getSameCollectionProducts as getSameCollectionProductsRepo,
  getSimilarProducts as getSimilarProductsRepo,
} from "@/infrastructure/db/repositories/product-repository";
import {
  getRequestContext,
  withRequestContext,
} from "@/infrastructure/db/request-context";
import { isWishlisted } from "@/infrastructure/db/repositories/wishlist-repository";

export interface ProductDetailResult {
  readonly product: ProductDetail | null;
  /** Present only when the current visitor has a saved-item row for it (§8.1). Always false when there is no visitor. */
  readonly isWishlisted: boolean;
  readonly error: string | null;
}

/** `/products/[slug]` — the canonical PDP read. */
export async function getProductBySlug(
  locale: string,
  slug: string,
): Promise<ProductDetailResult> {
  try {
    const { tenantId, visitorId } = await getRequestContext();
    return await withRequestContext({ tenantId, visitorId }, async (tx) => {
      const product = await getProductDetailBySlug(tx, tenantId, locale, slug);
      const wishlisted =
        product && visitorId
          ? await isWishlisted(tx, tenantId, visitorId, product.id)
          : false;
      return { product, isWishlisted: wishlisted, error: null };
    });
  } catch (cause) {
    console.error("[catalog] product detail failed", cause);
    return {
      product: null,
      isWishlisted: false,
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
}

/** Id-keyed lookup — used by compare and by basket mutations that already hold a productId. */
export async function getProductById(
  locale: string,
  id: ProductId,
): Promise<ProductDetailResult> {
  try {
    const { tenantId, visitorId } = await getRequestContext();
    return await withRequestContext({ tenantId, visitorId }, async (tx) => {
      const product = await getProductDetailById(tx, tenantId, locale, id);
      const wishlisted =
        product && visitorId
          ? await isWishlisted(tx, tenantId, visitorId, product.id)
          : false;
      return { product, isWishlisted: wishlisted, error: null };
    });
  } catch (cause) {
    console.error("[catalog] product detail failed", cause);
    return {
      product: null,
      isWishlisted: false,
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
}

const DEFAULT_SIMILAR_LIMIT = 8;

export interface SimilarProductsResult {
  readonly products: readonly ProductSummary[];
  readonly error: string | null;
}

export async function getSimilarProducts(
  locale: string,
  productId: ProductId,
  type?: ProductRelationType,
  limit: number = DEFAULT_SIMILAR_LIMIT,
): Promise<SimilarProductsResult> {
  try {
    const { tenantId } = await getRequestContext();
    const products = await withRequestContext({ tenantId }, (tx) =>
      getSimilarProductsRepo(tx, tenantId, locale, productId, type, limit),
    );
    return { products, error: null };
  } catch (cause) {
    console.error("[catalog] similar products failed", cause);
    return {
      products: [],
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
}

const DEFAULT_COLLECTION_LIMIT = 8;

/** docs/02-ux-blueprint.md §3.3 item 12: "From the same collection". */
export async function getSameCollectionProducts(
  locale: string,
  collectionSlug: string,
  excludeProductId: ProductId,
  limit: number = DEFAULT_COLLECTION_LIMIT,
): Promise<SimilarProductsResult> {
  try {
    const { tenantId } = await getRequestContext();
    const products = await withRequestContext({ tenantId }, (tx) =>
      getSameCollectionProductsRepo(
        tx,
        tenantId,
        locale,
        collectionSlug,
        excludeProductId,
        limit,
      ),
    );
    return { products, error: null };
  } catch (cause) {
    console.error("[catalog] same-collection products failed", cause);
    return {
      products: [],
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
}
