/**
 * Staff, roles and trade accounts — docs/04 §14.5.
 *
 * ── The rules the spec does not state ──
 * §14.5 lists the operations (`inviteUser`, `updateUserRoles`,
 * `suspendUser`, `resetUserMfa`, `approveTradeAccount`) and their
 * permissions, and stops. It says nothing about the ways those operations
 * can lock a tenant out of its own back office, which is the failure mode
 * that actually matters:
 *
 *   - an owner removing their own `owner` role
 *   - an owner suspending themselves
 *   - the LAST owner being demoted or suspended by anyone
 *
 * Any of those leaves a tenant with no one who can grant roles, and the
 * only route back is a developer with database access. So the guards below
 * are derived, not transcribed, and they are the reason this file exists
 * rather than the logic living inline in a use-case.
 *
 * `domain/` imports nothing (ADR-0003).
 */

export type AppUserStatus = "active" | "invited" | "suspended";

export const OWNER_ROLE_KEY = "owner";

export interface StaffRow {
  readonly id: string;
  /**
   * The Supabase `auth.users.id`, or null for an invitation that has not
   * been accepted. Needed because clearing a second factor is an Auth
   * operation, not a database one.
   */
  readonly authUserId: string | null;
  readonly email: string;
  readonly fullName: string | null;
  readonly status: AppUserStatus;
  readonly roleKeys: readonly string[];
  readonly hasMfa: boolean;
  readonly lastSeenAt: Date | null;
  readonly createdAt: Date;
}

export interface RoleRow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly isSystem: boolean;
  readonly permissionKeys: readonly string[];
  readonly memberCount: number;
}

export function isOwner(user: Pick<StaffRow, "roleKeys">): boolean {
  return user.roleKeys.includes(OWNER_ROLE_KEY);
}

/**
 * Owners who could still administer the tenant if `excluding` were removed.
 *
 * "Could still administer" means active AND holding `owner` — an invited or
 * suspended owner cannot sign in, so they do not count as cover.
 */
export function remainingActiveOwners(
  staff: readonly StaffRow[],
  excludingId: string,
): StaffRow[] {
  return staff.filter(
    (u) => u.id !== excludingId && u.status === "active" && isOwner(u),
  );
}

/**
 * Why this role change must be refused, or null.
 *
 * `actorId` matters as much as the target: self-demotion is refused even
 * when other owners exist, because the overwhelmingly common case is a
 * mis-click on your own row, and the recovery — asking a colleague to put
 * it back — is strictly worse than being told no.
 */
export function roleChangeBlockedReason(
  staff: readonly StaffRow[],
  targetId: string,
  nextRoleKeys: readonly string[],
  actorId: string,
): string | null {
  const target = staff.find((u) => u.id === targetId);
  if (!target) return "that account no longer exists";

  const losesOwner = isOwner(target) && !nextRoleKeys.includes(OWNER_ROLE_KEY);
  if (!losesOwner) return null;

  if (targetId === actorId) {
    return "you cannot remove your own owner role — ask another owner to do it";
  }
  if (remainingActiveOwners(staff, targetId).length === 0) {
    return "this is the last active owner; promote someone else first";
  }
  return null;
}

/** Why this suspension must be refused, or null. */
export function suspensionBlockedReason(
  staff: readonly StaffRow[],
  targetId: string,
  actorId: string,
): string | null {
  const target = staff.find((u) => u.id === targetId);
  if (!target) return "that account no longer exists";

  if (targetId === actorId) {
    // Signing yourself out permanently is never the intent.
    return "you cannot suspend your own account";
  }
  if (isOwner(target) && remainingActiveOwners(staff, targetId).length === 0) {
    return "this is the last active owner; promote someone else first";
  }
  return null;
}

/**
 * Resetting someone's second factor is an account-recovery backdoor.
 *
 * It clears the enrolled authenticator so the next sign-in enrols a new
 * one. Whoever controls the mailbox at that point controls the account, so
 * it is owner-only (§14.5) and it is refused on your own account: a person
 * who has genuinely lost their own device needs a colleague to do it, which
 * is what stops a stolen session from clearing its own second factor.
 */
export function mfaResetBlockedReason(
  targetId: string,
  actorId: string,
): string | null {
  if (targetId === actorId) {
    return "you cannot reset your own authenticator — ask another owner";
  }
  return null;
}

// ── Trade accounts ───────────────────────────────────────────────────────────

export type TradeAccountStatus = "pending" | "approved" | "rejected" | "suspended";
export type TradeType =
  "architect" | "designer" | "contractor" | "developer" | "retailer";

export const TRADE_TYPE_LABEL: Readonly<Record<TradeType, string>> = {
  architect: "Architect",
  designer: "Interior designer",
  contractor: "Contractor",
  developer: "Developer",
  retailer: "Retailer",
};

export const TRADE_STATUS_LABEL: Readonly<Record<TradeAccountStatus, string>> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
};

export interface TradeAccountRow {
  readonly id: string;
  readonly appUserId: string;
  readonly email: string;
  readonly companyName: string;
  readonly taxId: string | null;
  readonly registrationNo: string | null;
  readonly tradeType: TradeType;
  readonly status: TradeAccountStatus;
  readonly priceTierId: string | null;
  readonly priceTierName: string | null;
  readonly creditLimit: number | null;
  readonly paymentTermsDays: number | null;
  readonly rejectionReason: string | null;
  readonly approvedAt: Date | null;
  readonly createdAt: Date;
}

export interface PriceTierRow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly discountPct: number;
  readonly isDefault: boolean;
}

/**
 * §14.5: "approval assigns a `price_tier_id`".
 *
 * Enforced rather than defaulted. A trade account approved onto no tier
 * silently prices at the public rate, which looks like approval to the
 * applicant and like a discount that never applied to the business — the
 * kind of mismatch nobody notices until an invoice is disputed.
 */
export function approvalBlockedReason(priceTierId: string | null): string | null {
  if (priceTierId === null) {
    return "approving a trade account needs a price tier — without one they would be charged the public rate";
  }
  return null;
}

export const TRADE_STATUS_TRANSITIONS: Readonly<
  Record<TradeAccountStatus, readonly TradeAccountStatus[]>
> = {
  pending: ["approved", "rejected"],
  // Reversible: a company whose paperwork lapses is suspended, not deleted,
  // and reinstating them should not mean re-applying.
  approved: ["suspended"],
  rejected: ["pending"],
  suspended: ["approved", "rejected"],
};

export function canTransitionTrade(
  from: TradeAccountStatus,
  to: TradeAccountStatus,
): boolean {
  return TRADE_STATUS_TRANSITIONS[from].includes(to);
}

// ── Settings ─────────────────────────────────────────────────────────────────

export type SettingDataType = "string" | "number" | "boolean" | "json";

export interface SettingRow {
  readonly key: string;
  readonly value: unknown;
  readonly dataType: SettingDataType;
  /** `public` settings are readable by the storefront; `private` are not. */
  readonly scope: "public" | "private";
  readonly description: string | null;
}

/**
 * Parse a submitted string into the setting's declared type.
 *
 * Returns a discriminated result rather than throwing: a malformed JSON
 * blob is a thing an editor typed, not an exceptional condition, and they
 * need to be told which field and why.
 */
export function parseSettingValue(
  raw: string,
  dataType: SettingDataType,
): { ok: true; value: unknown } | { ok: false; error: string } {
  switch (dataType) {
    case "string":
      return { ok: true, value: raw };

    case "number": {
      const n = Number(raw);
      if (raw.trim() === "" || Number.isNaN(n)) {
        return { ok: false, error: "must be a number" };
      }
      return { ok: true, value: n };
    }

    case "boolean": {
      const normalised = raw.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalised))
        return { ok: true, value: true };
      if (["false", "0", "no", "off", ""].includes(normalised)) {
        return { ok: true, value: false };
      }
      return { ok: false, error: "must be true or false" };
    }

    case "json": {
      try {
        return { ok: true, value: JSON.parse(raw) as unknown };
      } catch {
        return { ok: false, error: "must be valid JSON" };
      }
    }
  }
}

/** Render a stored value back into something editable. */
export function formatSettingValue(
  value: unknown,
  dataType: SettingDataType,
): string {
  if (dataType === "json") return JSON.stringify(value, null, 2);
  if (value === null || value === undefined) return "";

  // The column is `jsonb`, so a row whose `data_type` says "string" can
  // still hold an object if it was seeded wrong. `String(…)` on one of
  // those renders "[object Object]" — worse than useless in an editor,
  // because it looks like a value someone could save back.
  if (typeof value === "object") return JSON.stringify(value, null, 2);

  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- narrowed to primitives above
  return String(value);
}
