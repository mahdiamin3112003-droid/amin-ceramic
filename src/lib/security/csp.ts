/**
 * Content Security Policy — docs/04-api-architecture.md §24.1:
 * "Strict CSP with per-request nonces and no `unsafe-inline`."
 *
 * Pure and parameterised so it can be unit-tested. The middleware supplies
 * the nonce and the environment; nothing here reads `process.env` directly.
 *
 * ── Why `script-src` gets a nonce and `style-src` does not ──
 * §24.1's "no `unsafe-inline`" is honoured where it carries the security
 * value: scripts. Styles are a deliberate, documented departure.
 * Framer Motion drives every animation in this project by writing inline
 * `style` attributes — `opacity`, `clip-path`, `transform` — and React
 * writes `style` props throughout. Inline style ATTRIBUTES cannot carry a
 * nonce; only `<style>` elements can. The precise directive for this is
 * `style-src-attr`, but its browser support is uneven, and where it is
 * unsupported the browser falls back to `style-src` and blocks every
 * animation on the site. An injected style attribute is a defacement and
 * exfiltration risk, not code execution, so this trade is worth naming
 * rather than pretending the policy is stricter than it is.
 * Recorded in docs/adr/0016-csp-nonces.md.
 */

export interface CspOptions {
  /** Per-request, base64. Never reused across responses. */
  readonly nonce: string;
  /** `NEXT_PUBLIC_SUPABASE_URL` — auth, storage reads and media all go here. */
  readonly supabaseUrl: string | undefined;
  readonly isDevelopment: boolean;
}

export function buildContentSecurityPolicy({
  nonce,
  supabaseUrl,
  isDevelopment,
}: CspOptions): string {
  const supabase = supabaseUrl?.replace(/\/$/, "") ?? "";
  const supabaseOrigin = supabase ? [supabase] : [];

  const directives: readonly (readonly [string, readonly string[]])[] = [
    ["default-src", ["'self'"]],

    [
      "script-src",
      [
        "'self'",
        `'nonce-${nonce}'`,
        // Lets Next's nonced bootstrap pull in its own chunks without every
        // hashed chunk URL being enumerated here. Browsers that honour
        // `strict-dynamic` ignore the host list; older ones fall back to it.
        "'strict-dynamic'",
        // Fast Refresh and the dev error overlay compile with eval. This is
        // the one directive that must never reach production.
        ...(isDevelopment ? ["'unsafe-eval'"] : []),
      ],
    ],

    // See the note at the top of this file before tightening this.
    ["style-src", ["'self'", "'unsafe-inline'"]],

    [
      "img-src",
      [
        "'self'",
        // The TOTP enrolment QR is returned by Supabase as a data: URI.
        "data:",
        "blob:",
        // Product and collection media, served from Supabase Storage.
        ...supabaseOrigin,
      ],
    ],

    // Self-hosted — no Google Fonts, no CDN.
    ["font-src", ["'self'"]],

    [
      "connect-src",
      [
        "'self'",
        ...supabaseOrigin,
        // Next's HMR socket.
        ...(isDevelopment ? ["ws:", "wss:"] : []),
      ],
    ],

    // §24.1: "X-Frame-Options: DENY". `frame-ancestors` is the modern
    // equivalent and the one that governs where X-Frame-Options is ignored.
    ["frame-ancestors", ["'none'"]],
    ["base-uri", ["'self'"]],
    // Server Actions and every form post are same-origin.
    ["form-action", ["'self'"]],
    ["object-src", ["'none'"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
  ];

  const rendered = directives.map(
    ([name, values]) => `${name} ${values.join(" ")}`,
  );

  // Valueless, and omitted in development: the dev server is plain http on
  // localhost, and upgrading its own same-origin subresources to https
  // breaks every one of them.
  if (!isDevelopment) rendered.push("upgrade-insecure-requests");

  return rendered.join("; ");
}

/** 16 random bytes, base64. Web Crypto so it runs on the edge. */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
