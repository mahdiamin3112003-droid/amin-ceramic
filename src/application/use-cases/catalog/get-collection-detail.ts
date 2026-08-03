import type { Collection } from "@/domain/catalog/entity";
import { getCollectionBySlug as getCollectionBySlugRepo } from "@/infrastructure/db/repositories/collection-repository";
import {
  getRequestContext,
  withRequestContext,
} from "@/infrastructure/db/request-context";

export interface CollectionDetailResult {
  readonly collection: Collection | null;
  readonly error: string | null;
}

/** `/collections/[slug]` — the story page. */
export async function getCollectionBySlug(
  locale: string,
  slug: string,
): Promise<CollectionDetailResult> {
  try {
    const { tenantId } = await getRequestContext();
    const collection = await withRequestContext({ tenantId }, (tx) =>
      getCollectionBySlugRepo(tx, tenantId, locale, slug),
    );
    return { collection, error: null };
  } catch (cause) {
    console.error("[catalog] collection detail failed", cause);
    return {
      collection: null,
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
}
