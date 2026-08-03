import type {
  ProductFilter,
  ProductListingPage,
  SearchSuggestion,
} from "@/domain/catalog/entity";
import {
  searchProducts as searchProductsRepo,
  searchSuggestions as searchSuggestionsRepo,
} from "@/infrastructure/db/repositories/product-repository";
import {
  getRequestContext,
  withRequestContext,
} from "@/infrastructure/db/request-context";

const DEFAULT_SUGGEST_LIMIT = 8;

export interface SearchSuggestionsResult {
  readonly suggestions: readonly SearchSuggestion[];
  readonly error: string | null;
}

/** `/api/v1/search/suggest` — typeahead, called from client hydration (§2.1's one exception to server-only reads). */
export async function searchSuggestions(
  locale: string,
  query: string,
  limit: number = DEFAULT_SUGGEST_LIMIT,
): Promise<SearchSuggestionsResult> {
  try {
    const { tenantId } = await getRequestContext();
    const suggestions = await withRequestContext({ tenantId }, (tx) =>
      searchSuggestionsRepo(tx, tenantId, locale, query, limit),
    );
    return { suggestions, error: null };
  } catch (cause) {
    console.error("[catalog] search suggestions failed", cause);
    return {
      suggestions: [],
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
}

export interface SearchProductsResult {
  readonly page: ProductListingPage | null;
  readonly error: string | null;
}

/** `/search` — full results page, same facet contract as the listing (§7.2). */
export async function searchProducts(
  locale: string,
  filter: ProductFilter,
): Promise<SearchProductsResult> {
  try {
    const { tenantId } = await getRequestContext();
    const page = await withRequestContext({ tenantId }, (tx) =>
      searchProductsRepo(tx, tenantId, locale, filter),
    );
    return { page, error: null };
  } catch (cause) {
    console.error("[catalog] search failed", cause);
    return {
      page: null,
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
}
