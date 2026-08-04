import { describe, expect, it, vi, afterEach } from "vitest";

import { generateTotp, secondsUntilNextWindow } from "./totp";

/**
 * The TOTP generator, checked against RFC 6238's published test vectors.
 *
 * This matters more than it looks. Every MFA assertion in the e2e suite
 * trusts this function; if it were subtly wrong — a byte order, a
 * truncation offset — those tests would fail against a perfectly good
 * product and send someone hunting for a bug in Supabase.
 *
 * RFC 6238 Appendix B publishes vectors for the ASCII seed
 * "12345678901234567890". Base32 of that is GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ.
 * The RFC prints 8-digit codes; the last 6 are the 6-digit code.
 */
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

/** [unix seconds, RFC's 8-digit TOTP] for SHA-1. */
const VECTORS: readonly [number, string][] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
];

afterEach(() => {
  vi.useRealTimers();
});

describe("generateTotp", () => {
  it.each(VECTORS)("matches RFC 6238 at t=%i", (seconds, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(seconds * 1000);

    expect(generateTotp(RFC_SECRET, 0, 30, 8)).toBe(expected);
    // The six-digit form the UI actually asks for.
    expect(generateTotp(RFC_SECRET)).toBe(expected.slice(-6));
  });

  it("is stable across a whole 30-second window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_111_111_140_000); // window start
    const atStart = generateTotp(RFC_SECRET);

    vi.setSystemTime(1_111_111_169_000); // 29s later, same window
    expect(generateTotp(RFC_SECRET)).toBe(atStart);
  });

  it("rolls over at the window boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_111_111_169_000);
    const before = generateTotp(RFC_SECRET);

    vi.setSystemTime(1_111_111_170_000); // one second later, next window
    expect(generateTotp(RFC_SECRET)).not.toBe(before);
  });

  it("offsets by whole windows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_111_111_140_000);

    // The previous window's code, which is what an offset of -1 means.
    vi.setSystemTime(1_111_111_110_000);
    const previous = generateTotp(RFC_SECRET);
    vi.setSystemTime(1_111_111_140_000);

    expect(generateTotp(RFC_SECRET, -1)).toBe(previous);
  });

  it("accepts the spaced, lowercased form authenticators display", () => {
    vi.useFakeTimers();
    vi.setSystemTime(59_000);

    const pretty = "gezd gnbv gy3t qojq gezd gnbv gy3t qojq";
    expect(generateTotp(pretty)).toBe(generateTotp(RFC_SECRET));
  });

  it("rejects a secret that is not base32", () => {
    expect(() => generateTotp("not-base32!")).toThrow(/invalid base32/i);
  });
});

describe("secondsUntilNextWindow", () => {
  it("counts down to the boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_111_111_140_000); // exactly on a boundary
    expect(secondsUntilNextWindow()).toBe(30);

    vi.setSystemTime(1_111_111_165_000); // 25s in
    expect(secondsUntilNextWindow()).toBe(5);
  });
});
