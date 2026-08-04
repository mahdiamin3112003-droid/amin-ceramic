import type { CookieOptions } from "@supabase/ssr";

/**
 * Hardening applied to every Supabase auth cookie this app writes.
 *
 * ── Why this file exists ──
 * `@supabase/ssr` does NOT set `httpOnly` or `secure` by default. It writes
 * the session token as an ordinary cookie, readable by any script on the
 * page and transmissible over plaintext HTTP. Verified in a real browser:
 * before this, `sb-…-auth-token` came back `httpOnly: false, secure: false`.
 *
 * That directly contradicts docs/04 §4.6 — "Tokens in JS-readable storage
 * are one XSS away from full account compromise, and no CSP is perfect" —
 * and it contradicted the comment in `supabase-server.ts`, which asserted
 * the session was already in httpOnly cookies. It was not. Caught by the
 * end-to-end suite, which now asserts the flags on every run.
 *
 * ── Why httpOnly is safe here ──
 * Nothing in the browser bundle needs to read the token. Sign-in, sign-out
 * and TOTP all run as Server Actions, and every authenticated read happens
 * on the server. There is no browser-side Supabase client to starve.
 *
 * ── Why `secure` is unconditional ──
 * Browsers treat `http://localhost` as a secure context, so a Secure cookie
 * works in local development without a `NODE_ENV` branch. The visitor
 * cookie (`src/lib/visitor/cookie.ts`) is set the same way for the same
 * reason; a flag that is only on in production is a flag nobody tests.
 *
 * ── Why `lax` and not `strict` ──
 * §4.6 specifies `sameSite=lax`. Strict would break the password-reset
 * link, which is a top-level cross-site navigation back into the app —
 * the user would arrive signed out and blame the email.
 */
export function hardenAuthCookie(options: CookieOptions): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  };
}

/**
 * The same, minus any lifetime, so the browser drops it on close.
 *
 * This is what "Keep me signed in", unticked, actually does. Applied at the
 * only place cookies are written, so the checkbox cannot become decoration.
 */
export function toSessionScoped(options: CookieOptions): CookieOptions {
  const scoped = { ...hardenAuthCookie(options) };
  delete scoped.maxAge;
  delete scoped.expires;
  return scoped;
}
