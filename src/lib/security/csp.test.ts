import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, generateCspNonce } from "./csp";

const SUPABASE = "https://example-project.supabase.co";

function policy(
  overrides: Partial<Parameters<typeof buildContentSecurityPolicy>[0]> = {},
) {
  return buildContentSecurityPolicy({
    nonce: "TESTNONCE",
    supabaseUrl: SUPABASE,
    isDevelopment: false,
    ...overrides,
  });
}

/** `script-src 'self' 'nonce-X' …` → the directive's value list. */
function directive(csp: string, name: string): string | undefined {
  return csp
    .split("; ")
    .find((part) => part === name || part.startsWith(`${name} `));
}

describe("content security policy", () => {
  it("carries the per-request nonce on script-src", () => {
    expect(directive(policy(), "script-src")).toContain("'nonce-TESTNONCE'");
  });

  /**
   * The one directive that must never ship. Fast Refresh needs it; a
   * production bundle that allows eval hands an XSS foothold straight back.
   */
  it("never allows unsafe-eval in production", () => {
    expect(policy()).not.toContain("'unsafe-eval'");
    expect(policy({ isDevelopment: true })).toContain("'unsafe-eval'");
  });

  /** docs/04 §24.1: "no `unsafe-inline`" — held for scripts specifically. */
  it("never allows unsafe-inline scripts, in either environment", () => {
    for (const isDevelopment of [true, false]) {
      const scriptSrc = directive(policy({ isDevelopment }), "script-src") ?? "";
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    }
  });

  it("allows inline style attributes, which Framer Motion writes constantly", () => {
    // A deliberate departure, documented in csp.ts and ADR-0016. Asserted so
    // that tightening it becomes a conscious act with a failing test, not a
    // silent change that blanks every animation on the site.
    expect(directive(policy(), "style-src")).toContain("'unsafe-inline'");
  });

  it("allows Supabase for media, and for the auth and storage calls", () => {
    expect(directive(policy(), "img-src")).toContain(SUPABASE);
    expect(directive(policy(), "connect-src")).toContain(SUPABASE);
  });

  it("allows the data: URI Supabase returns for the TOTP QR", () => {
    expect(directive(policy(), "img-src")).toContain("data:");
  });

  it("omits Supabase cleanly when the URL is unset", () => {
    const csp = policy({ supabaseUrl: undefined });
    expect(csp).not.toContain("undefined");
    expect(directive(csp, "img-src")).toBe("img-src 'self' data: blob:");
  });

  it("forbids framing and plugin content outright", () => {
    expect(directive(policy(), "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(policy(), "object-src")).toBe("object-src 'none'");
    expect(directive(policy(), "base-uri")).toBe("base-uri 'self'");
    expect(directive(policy(), "form-action")).toBe("form-action 'self'");
  });

  it("upgrades insecure requests in production only", () => {
    // On localhost the dev server is plain http; upgrading its own
    // same-origin subresources to https breaks all of them.
    expect(policy()).toContain("upgrade-insecure-requests");
    expect(policy({ isDevelopment: true })).not.toContain(
      "upgrade-insecure-requests",
    );
  });
});

describe("nonce generation", () => {
  it("is unique per call", () => {
    const nonces = new Set(Array.from({ length: 200 }, () => generateCspNonce()));
    expect(nonces.size).toBe(200);
  });

  it("is base64 with at least 128 bits of entropy", () => {
    const nonce = generateCspNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(Buffer.from(nonce, "base64")).toHaveLength(16);
  });
});
