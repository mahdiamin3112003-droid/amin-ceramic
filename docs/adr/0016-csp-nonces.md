# 0016 · A per-request nonce CSP, and the one directive that is not strict

**Status:** accepted · before first deployment

## What the architecture asks for

`docs/04-api-architecture.md` §24.1: "Strict CSP with per-request nonces and
no `unsafe-inline`."

## What was actually there

Nothing. `next.config.ts` carried a comment saying

> CSP with per-request nonces is added with the middleware work in Phase 4

and Phase 4 shipped without it. `src/middleware.ts` set no CSP at all.

This is the same class of defect as the auth-cookie flags found earlier in
Phase 4: **a comment asserting a protection that does not exist.** That is
worse than a known gap, because a reader checking whether the site has a CSP
finds the comment, believes it, and stops looking. It survived because
nothing tested it — the other §24.1 headers are static and visible in
`next.config.ts`, so the file looked complete.

## Decision

Implement it, in `src/middleware.ts`, with the policy built by
`src/lib/security/csp.ts`.

It cannot live in `next.config.ts`. Everything in that file's `headers()`
block is baked at build time and identical on every response, and a nonce
that is identical on every response is not a nonce.

**The nonce is set on the REQUEST headers, not only the response.** Next
reads it back out of the `Content-Security-Policy` request header and stamps
it onto its own inline bootstrap scripts — the `self.__next_f.push(...)`
hydration payload. Set it only on the response and those scripts ship
without a nonce, the browser blocks them, and the site does not hydrate at
all. Verified against a production build: 61 of 61 script elements carry the
nonce, and `data-intro` is stamped, which proves the one inline script we
author ourselves (`IntroGate`) executed.

`'strict-dynamic'` is included so Next's nonced bootstrap can pull in its own
hashed chunks without every chunk URL being enumerated in the policy.

## The departure: `style-src 'unsafe-inline'`

§24.1's "no `unsafe-inline`" is honoured for `script-src` in both
environments, and `'unsafe-eval'` never reaches production (there is a unit
test for each). **`style-src` keeps `'unsafe-inline'`.**

Framer Motion drives every animation in this project by writing inline
`style` attributes — `opacity`, `clip-path`, `transform` — and React writes
`style` props throughout. Inline style _attributes_ cannot carry a nonce;
only `<style>` elements can. The directive that would allow attributes
while still nonce-ing elements is `style-src-attr`, but its support is
uneven, and where it is unsupported the browser falls back to `style-src`
and blocks every animation on the site.

The trade is worth naming rather than hiding: an injected style attribute is
a defacement and data-exfiltration risk (`background: url(...)`), not code
execution. Blocking scripts is where the security value is. This is asserted
in `csp.test.ts` so that tightening it later is a deliberate act against a
failing test rather than a silent change that blanks the site.

## Consequences

- The `[locale]` layout now reads `headers()` for `x-nonce`. It was already
  dynamic — it reads the basket and wishlist cookies — so this costs nothing.
- `IntroGate` takes a required `nonce` prop. Without it the inline gate is
  blocked, `data-intro` is never stamped, and the `globals.css` rules that
  depend on it never fire.
- Adding any third-party script, font host, analytics or image CDN now means
  adding it to `csp.ts`. That friction is the point.
- The policy is **enforcing**, not report-only. It was verified against a
  production build in a real browser and across the full end-to-end suite
  before this was accepted.
