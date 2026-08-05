import { describe, expect, it } from "vitest";

import {
  approvalBlockedReason,
  canTransitionTrade,
  formatSettingValue,
  mfaResetBlockedReason,
  parseSettingValue,
  remainingActiveOwners,
  roleChangeBlockedReason,
  suspensionBlockedReason,
  type StaffRow,
} from "@/domain/admin/people";

/**
 * The lockout guards.
 *
 * These are the rules docs/04 §14.5 does not state, and they are the ones
 * where being wrong is unrecoverable from inside the product: a tenant with
 * no active owner has nobody who can grant the owner role back, and the
 * only route out is a developer with database access.
 */
function staff(
  id: string,
  roleKeys: string[],
  status: StaffRow["status"] = "active",
): StaffRow {
  return {
    id,
    authUserId: `auth-${id}`,
    email: `${id}@example.invalid`,
    fullName: null,
    status,
    roleKeys,
    hasMfa: true,
    lastSeenAt: null,
    createdAt: new Date(0),
  };
}

const OWNER_A = staff("owner-a", ["owner"]);
const OWNER_B = staff("owner-b", ["owner"]);
const EDITOR = staff("editor", ["editor"]);
const SUSPENDED_OWNER = staff("owner-susp", ["owner"], "suspended");
const INVITED_OWNER = staff("owner-inv", ["owner"], "invited");

describe("remainingActiveOwners", () => {
  it("counts only owners who could actually sign in", () => {
    const all = [OWNER_A, SUSPENDED_OWNER, INVITED_OWNER, EDITOR];
    // A suspended or invited owner cannot administer anything, so neither
    // counts as cover for removing the last active one.
    expect(remainingActiveOwners(all, OWNER_A.id)).toEqual([]);
  });

  it("counts a second active owner", () => {
    expect(remainingActiveOwners([OWNER_A, OWNER_B], OWNER_A.id)).toEqual([
      OWNER_B,
    ]);
  });
});

describe("roleChangeBlockedReason", () => {
  it("refuses self-demotion even when other owners exist", () => {
    // The overwhelmingly common case is a mis-click on your own row, and
    // asking a colleague to undo it is worse than being told no.
    const reason = roleChangeBlockedReason(
      [OWNER_A, OWNER_B],
      OWNER_A.id,
      ["editor"],
      OWNER_A.id,
    );
    expect(reason).toMatch(/your own owner role/i);
  });

  it("refuses demoting the last active owner", () => {
    const reason = roleChangeBlockedReason(
      [OWNER_A, EDITOR],
      OWNER_A.id,
      ["editor"],
      EDITOR.id,
    );
    expect(reason).toMatch(/last active owner/i);
  });

  it("allows demoting an owner when another active one remains", () => {
    expect(
      roleChangeBlockedReason(
        [OWNER_A, OWNER_B],
        OWNER_B.id,
        ["editor"],
        OWNER_A.id,
      ),
    ).toBeNull();
  });

  it("allows an owner to keep owner while gaining another role", () => {
    expect(
      roleChangeBlockedReason(
        [OWNER_A],
        OWNER_A.id,
        ["owner", "sales"],
        OWNER_A.id,
      ),
    ).toBeNull();
  });

  it("does not interfere with changes to non-owners", () => {
    expect(
      roleChangeBlockedReason([OWNER_A, EDITOR], EDITOR.id, ["sales"], OWNER_A.id),
    ).toBeNull();
  });

  it("refuses a change to somebody who no longer exists", () => {
    expect(
      roleChangeBlockedReason([OWNER_A], "ghost", ["editor"], OWNER_A.id),
    ).toMatch(/no longer exists/i);
  });
});

describe("suspensionBlockedReason", () => {
  it("refuses suspending yourself", () => {
    expect(
      suspensionBlockedReason([OWNER_A, OWNER_B], OWNER_A.id, OWNER_A.id),
    ).toMatch(/your own account/i);
  });

  it("refuses suspending the last active owner", () => {
    expect(
      suspensionBlockedReason([OWNER_A, EDITOR], OWNER_A.id, EDITOR.id),
    ).toMatch(/last active owner/i);
  });

  it("allows suspending an owner when another remains", () => {
    expect(
      suspensionBlockedReason([OWNER_A, OWNER_B], OWNER_B.id, OWNER_A.id),
    ).toBeNull();
  });

  it("allows suspending a non-owner", () => {
    expect(
      suspensionBlockedReason([OWNER_A, EDITOR], EDITOR.id, OWNER_A.id),
    ).toBeNull();
  });
});

describe("mfaResetBlockedReason", () => {
  it("refuses resetting your own authenticator", () => {
    // This is what stops a stolen session clearing its own second factor.
    expect(mfaResetBlockedReason("a", "a")).toMatch(/your own authenticator/i);
  });

  it("allows resetting somebody else's", () => {
    expect(mfaResetBlockedReason("a", "b")).toBeNull();
  });
});

describe("approvalBlockedReason", () => {
  it("refuses approval without a price tier", () => {
    // An approved account on no tier silently bills at the public rate.
    expect(approvalBlockedReason(null)).toMatch(/price tier/i);
  });

  it("allows approval with one", () => {
    expect(approvalBlockedReason("tier-1")).toBeNull();
  });
});

describe("canTransitionTrade", () => {
  it("allows a pending account to be approved or rejected", () => {
    expect(canTransitionTrade("pending", "approved")).toBe(true);
    expect(canTransitionTrade("pending", "rejected")).toBe(true);
  });

  it("does not allow an approved account to be rejected outright", () => {
    // Suspend first — rejection is for applications, not for customers.
    expect(canTransitionTrade("approved", "rejected")).toBe(false);
    expect(canTransitionTrade("approved", "suspended")).toBe(true);
  });

  it("lets a suspended account be reinstated without re-applying", () => {
    expect(canTransitionTrade("suspended", "approved")).toBe(true);
  });

  it("never allows a transition to itself", () => {
    for (const status of [
      "pending",
      "approved",
      "rejected",
      "suspended",
    ] as const) {
      expect(canTransitionTrade(status, status)).toBe(false);
    }
  });
});

describe("parseSettingValue", () => {
  it("parses numbers and rejects non-numbers", () => {
    expect(parseSettingValue("42", "number")).toEqual({ ok: true, value: 42 });
    expect(parseSettingValue("", "number").ok).toBe(false);
    expect(parseSettingValue("abc", "number").ok).toBe(false);
  });

  it("accepts the several spellings of true and false", () => {
    for (const yes of ["true", "1", "yes", "on", "TRUE"]) {
      expect(parseSettingValue(yes, "boolean")).toEqual({ ok: true, value: true });
    }
    for (const no of ["false", "0", "no", "off", ""]) {
      expect(parseSettingValue(no, "boolean")).toEqual({ ok: true, value: false });
    }
    expect(parseSettingValue("maybe", "boolean").ok).toBe(false);
  });

  it("parses JSON and reports malformed JSON rather than throwing", () => {
    expect(parseSettingValue('{"a":1}', "json")).toEqual({
      ok: true,
      value: { a: 1 },
    });
    const bad = parseSettingValue("{nope", "json");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/valid JSON/i);
  });

  it("passes strings through untouched, including ones that look numeric", () => {
    expect(parseSettingValue("007", "string")).toEqual({ ok: true, value: "007" });
  });
});

describe("formatSettingValue", () => {
  it("pretty-prints JSON", () => {
    expect(formatSettingValue({ a: 1 }, "json")).toBe('{\n  "a": 1\n}');
  });

  it("renders an object as JSON even when the row claims it is a string", () => {
    // `value` is a jsonb column, so a mis-seeded row can hold an object.
    // `String(…)` would render "[object Object]", which looks like
    // something an editor could save back.
    expect(formatSettingValue({ a: 1 }, "string")).toBe('{\n  "a": 1\n}');
  });

  it("renders null and undefined as empty", () => {
    expect(formatSettingValue(null, "string")).toBe("");
    expect(formatSettingValue(undefined, "number")).toBe("");
  });
});
