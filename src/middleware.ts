import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import { updateSession } from "@/infrastructure/auth/middleware-session";
import { buildContentSecurityPolicy, generateCspNonce } from "@/lib/security/csp";
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
  const { pathname } = request.nextUrl;

  /**
   * CSP first — docs/04 §24.1.
   *
   * The nonce goes onto the REQUEST headers, not just the response, and the
   * ordering is the whole trick. Next reads the nonce out of the
   * `Content-Security-Policy` request header and stamps it onto its own
   * inline bootstrap scripts (the `self.__next_f.push(...)` hydration
   * payload). Set it only on the response and those scripts ship unnonced,
   * the browser blocks them, and the site does not hydrate at all.
   *
   * `x-nonce` is the same value under a name the app can read, for the one
   * inline script we author ourselves (`IntroGate`).
   */
  const nonce = generateCspNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    isDevelopment: process.env.NODE_ENV === "development",
  });
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);

  // Admin is OUTSIDE `[locale]` (docs/02 §1.2) and English-only in v1, so it
  // bypasses locale negotiation entirely.
  const response = pathname.startsWith("/admin")
    ? await guardAdminRoute(request)
    : pathname.startsWith("/api")
      ? NextResponse.next({ request })
      : intlMiddleware(request);

  await ensureVisitorCookie(request, response);

  // Every response, including the redirects above — a redirect that carries
  // no policy is a gap on exactly the routes that matter most.
  response.headers.set("content-security-policy", csp);

  return response;
}

/**
 * Enforcement layer 1 — docs/04 §5.1: "Staff route + no session → 302
 * /admin/login". COARSE ONLY. It asks whether a session exists, never what
 * it may do: permissions are checked in the use-case wrapper
 * (`src/application/auth/authorize.ts`) and again by RLS.
 *
 * That split is deliberate rather than redundant. Middleware runs on the
 * edge without database access, so it cannot know a user's permissions
 * without trusting the token's contents — and a gate that trusts the thing
 * it is gating is not a gate. It keeps unauthenticated traffic off admin
 * routes; real authorisation happens where the data is.
 *
 * `updateSession` also refreshes the Supabase session cookies on every
 * request, which is what keeps rotation working (§4.6).
 */
async function guardAdminRoute(request: NextRequest): Promise<NextResponse> {
  // The auth screens themselves must stay reachable without a session.
  const isAuthScreen =
    request.nextUrl.pathname === "/admin/login" ||
    request.nextUrl.pathname === "/admin/2fa" ||
    request.nextUrl.pathname === "/admin/forgot";

  const { response, user } = await updateSession(request);

  if (!user && !isAuthScreen) {
    const loginUrl = new URL("/admin/login", request.url);
    // Preserve the intended destination so sign-in can return them to it.
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Already signed in and sitting on the login screen → send them inward.
  if (user && request.nextUrl.pathname === "/admin/login") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

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
