import type { Collection } from "@/domain/catalog/entity";
import { listCollections as listCollectionsRepo } from "@/infrastructure/db/repositories/collection-repository";
import {
  getRequestContext,
  withRequestContext,
} from "@/infrastructure/db/request-context";

export interface ListCollectionsResult {
  readonly collections: readonly Collection[];
  readonly error: string | null;
}

/** `/collections` — the index. */
export async function listCollections(
  locale: string,
): Promise<ListCollectionsResult> {
  try {
    const { tenantId } = await getRequestContext();
    const collections = await withRequestContext({ tenantId }, (tx) =>
      listCollectionsRepo(tx, tenantId, locale),
    );
    return { collections, error: null };
  } catch (cause) {
    console.error("[catalog] list collections failed", cause);
    return {
      collections: [],
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
}
