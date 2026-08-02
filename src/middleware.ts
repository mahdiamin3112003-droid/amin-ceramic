import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

/**
 * Edge middleware — docs/04-api-architecture.md §2.4.
 *
 * Phase 0 does locale negotiation only. The visitor cookie (§4.2), the admin
 * auth gate (§5.1) and the coarse IP rate limit arrive with Phases 4 and 9.
 * Keeping this file as the single place cross-cutting request concerns live
 * is deliberate: the ordering between them matters, and scattering them makes
 * that ordering invisible.
 */
export default createMiddleware(routing);

export const config = {
  /**
   * Everything except Next internals, the API surface and static files.
   *
   * `/api` is excluded because REST routes are locale-agnostic — they take an
   * explicit `Accept-Language` rather than a path prefix, so a connector or a
   * future mobile client never has to guess at a locale segment.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|fonts|brand|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\..*).*)",
  ],
};
