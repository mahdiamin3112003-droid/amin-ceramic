import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import {
  VISITOR_COOKIE_MAX_AGE_SECONDS,
  VISITOR_COOKIE_NAME,
  mintVisitorCookie,
  verifyVisitorCookie,
} from "@/lib/visitor/cookie";

/**
 * Edge middleware — docs/04-api-architecture.md §2.4.
 *
 * Two concerns, in order: locale negotiation (next-intl, public pages only —
 * REST routes take an explicit Accept-Language rather than a path prefix,
 * so `/api` skips it), then visitor-cookie issuance (§4.2) on every request,
 * API included, since a Server Action or REST call needs the same visitor
 * identity a page render does.
 *
 * The admin auth gate (§5.1) and the coarse IP rate limit (Phase 9) still
 * arrive later. Keeping this file as the single place cross-cutting request
 * concerns live is deliberate: the ordering between them matters, and
 * scattering them makes that ordering invisible.
 */
const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const response = request.nextUrl.pathname.startsWith("/api")
    ? NextResponse.next()
    : intlMiddleware(request);

  await ensureVisitorCookie(request, response);

  return response;
}

async function ensureVisitorCookie(request: NextRequest, response: NextResponse) {
  const secret = process.env.VISITOR_COOKIE_SECRET;
  if (!secret) {
    // Fails open rather than 500ing every request in an environment that
    // hasn't set the secret yet (e.g. early local setup) — but never signs
    // or trusts a cookie without one. No visitor identity is a supported
    // state (§4.1's anonymous-but-unidentified edge case, e.g. a crawler);
    // a forged one is not.
    console.error(
      "[middleware] VISITOR_COOKIE_SECRET is not set — skipping visitor cookie issuance",
    );
    return;
  }

  const existing = request.cookies.get(VISITOR_COOKIE_NAME)?.value;
  const verifiedVisitorId = await verifyVisitorCookie(existing, secret);
  if (verifiedVisitorId) return;

  const { cookieValue } = await mintVisitorCookie(secret);
  response.cookies.set(VISITOR_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    // Per §4.2, unconditionally — browsers treat http://localhost as a
    // secure context, so this doesn't need a NODE_ENV branch for local dev.
    secure: true,
    sameSite: "lax",
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
}

export const config = {
  /** Everything except Next internals and static files. `/api` IS included now — see above. */
  matcher: [
    "/((?!_next/static|_next/image|fonts|brand|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\..*).*)",
  ],
};
