import { describe, expect, it } from "vitest";

import { decide, projectRefFromDatabaseUrl } from "./guard-destructive";

const PROD = "vvwpygqdaqbyzneokopb";
const DEV = "abcdefghijklmnopqrst";
const POOLER = `postgresql://postgres.${PROD}:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`;
const DIRECT = `postgresql://postgres:pw@db.${PROD}.supabase.co:5432/postgres`;

describe("projectRefFromDatabaseUrl", () => {
  it("reads the ref out of a pooler username", () => {
    expect(projectRefFromDatabaseUrl(POOLER)).toBe(PROD);
  });

  it("reads the ref out of a direct-connection host", () => {
    expect(projectRefFromDatabaseUrl(DIRECT)).toBe(PROD);
  });

  it("returns null for anything it cannot identify", () => {
    // Each of these must read as "unknown", never as "safe".
    expect(projectRefFromDatabaseUrl(undefined)).toBeNull();
    expect(projectRefFromDatabaseUrl("")).toBeNull();
    expect(projectRefFromDatabaseUrl("not a url")).toBeNull();
    expect(
      projectRefFromDatabaseUrl("postgresql://postgres:pw@localhost:5432/postgres"),
    ).toBeNull();
  });
});

describe("the destructive-command guard", () => {
  it("refuses when the target IS the production project", () => {
    const decision = decide({
      targetUrl: POOLER,
      productionRef: PROD,
      override: undefined,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/PRODUCTION project/);
  });

  it("allows a different project without any ceremony", () => {
    // The end state this is designed for: once dev has its own project, the
    // guard must get out of the way completely.
    const decision = decide({
      targetUrl: `postgresql://postgres.${DEV}:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`,
      productionRef: PROD,
      override: undefined,
    });
    expect(decision.allowed).toBe(true);
  });

  /**
   * The core of it. "We cannot tell" must never resolve to "go ahead" — that
   * is the same fail-closed rule the RLS policies and the e2e fixture's
   * `assertIsTestAccount` follow.
   */
  it("fails closed when no production project is marked", () => {
    expect(
      decide({ targetUrl: POOLER, productionRef: undefined, override: undefined })
        .allowed,
    ).toBe(false);
  });

  it("fails closed when the target cannot be identified", () => {
    expect(
      decide({
        targetUrl: "postgresql://postgres:pw@localhost:5432/postgres",
        productionRef: PROD,
        override: undefined,
      }).allowed,
    ).toBe(false);
  });

  it("lets the explicit override through in every refusing case", () => {
    const cases = [
      { targetUrl: POOLER, productionRef: PROD },
      { targetUrl: POOLER, productionRef: undefined },
      { targetUrl: "nonsense", productionRef: PROD },
    ];
    for (const c of cases) {
      expect(decide({ ...c, override: "yes" }).allowed).toBe(true);
    }
  });

  it("accepts only the exact override value", () => {
    // Anything truthy-but-wrong must not open the gate.
    for (const override of ["1", "true", "YES", "y", " yes", ""]) {
      expect(
        decide({ targetUrl: POOLER, productionRef: PROD, override }).allowed,
      ).toBe(false);
    }
  });
});
