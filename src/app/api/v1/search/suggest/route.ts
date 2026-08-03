import type { NextRequest } from "next/server";

import { searchSuggestions } from "@/application/use-cases/catalog/search";
import { searchSuggestQuerySchema } from "@/lib/validation/catalog";
import {
  isZodError,
  jsonError,
  jsonOk,
  jsonValidationError,
  searchParamsToRecord,
} from "@/app/api/v1/_lib/respond";

/** `/api/v1/search/suggest` — typeahead, always a client-hydration call (§7.1). */
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const query = searchSuggestQuerySchema.parse(
      searchParamsToRecord(request.nextUrl.searchParams),
    );
    const { suggestions, error } = await searchSuggestions(
      query.locale,
      query.q,
      query.limit,
    );
    if (error) return jsonError(500, "failed to load suggestions");
    return jsonOk(suggestions);
  } catch (cause) {
    if (isZodError(cause)) return jsonValidationError(cause);
    console.error("[api] search suggest failed", cause);
    return jsonError(500, "internal error");
  }
}
