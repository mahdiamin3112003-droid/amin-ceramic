import { adminMutation, adminQuery } from "@/application/auth/admin-mutation";
import { ForbiddenError } from "@/application/auth/authorize";
import {
  OWNER_ROLE_KEY,
  approvalBlockedReason,
  canTransitionTrade,
  mfaResetBlockedReason,
  roleChangeBlockedReason,
  suspensionBlockedReason,
  type PriceTierRow,
  type RoleRow,
  type SettingRow,
  type StaffRow,
  type TradeAccountRow,
  type TradeAccountStatus,
} from "@/domain/admin/people";
import {
  clearUserMfa,
  inviteStaffByEmail,
} from "@/infrastructure/auth/staff-admin";
import {
  createInvitedStaff,
  listPriceTiers,
  listRoles,
  listSettings,
  listStaff,
  listTradeAccounts,
  setStaffRoles,
  setStaffStatus,
  setTradeAccountStatus,
  upsertSetting,
} from "@/infrastructure/db/repositories/people-repository";

/**
 * Staff, roles, trade accounts and settings — docs/04 §14.5.
 *
 * ── Owner-only, enforced twice ──
 * §14.5 marks `updateUserRoles` and `resetUserMfa` **owner only**, which is
 * stricter than any permission in the vocabulary can express: `role.manage`
 * is held only by owner today, but that is a seed fact, not a guarantee —
 * an owner could grant `role.manage` to a custom role tomorrow and quietly
 * create a second path to promotion.
 *
 * So these check the permission AND the role. `requireOwner` is the second
 * half, and it is why `adminMutation`'s permission argument is not the
 * whole story for this module.
 */
function requireOwner(roleKeys: readonly string[], action: string): void {
  if (!roleKeys.includes(OWNER_ROLE_KEY)) {
    throw new ForbiddenError(`${action} is restricted to owners`);
  }
}

export async function listStaffForAdmin(): Promise<StaffRow[]> {
  return adminQuery("user.manage", (tx, ctx) => listStaff(tx, ctx.tenantId));
}

export async function listRolesForAdmin(): Promise<RoleRow[]> {
  return adminQuery("user.manage", (tx, ctx) => listRoles(tx, ctx.tenantId));
}

/**
 * Invite a staff member.
 *
 * Supabase sends the mail, not Resend: §14.5 says "email invite", and
 * Resend is a phase-9 dependency. Supabase Auth's own invitation covers
 * exactly this, so pulling a transactional-mail provider forward would buy
 * nothing.
 *
 * The auth user and the `app_user` row are created together, but the
 * account lands `invited` rather than `active` — `getStaffSession` resolves
 * only active accounts, so an unaccepted invitation grants nothing even
 * though the rows exist.
 */
export async function inviteStaff(input: {
  email: string;
  fullName: string | null;
  roleKeys: readonly string[];
}): Promise<{ id: string }> {
  return adminMutation("user.invite", async (tx, ctx) => {
    // Roles come with the invitation, so granting them is a role change and
    // gets the same owner gate as any other.
    if (input.roleKeys.includes(OWNER_ROLE_KEY)) {
      requireOwner(ctx.roleKeys, "granting the owner role");
    }

    const authUserId = await inviteStaffByEmail(input.email);
    const created = await createInvitedStaff(tx, ctx.tenantId, {
      email: input.email,
      fullName: input.fullName,
      authUserId,
    });
    await setStaffRoles(
      tx,
      ctx.tenantId,
      created.id,
      input.roleKeys,
      ctx.appUserId,
    );

    return {
      result: created,
      audit: {
        action: "user.invite",
        entityType: "app_user",
        entityId: created.id,
        entityLabel: input.email,
        after: { email: input.email, roleKeys: input.roleKeys },
      },
    };
  });
}

export async function updateStaffRoles(
  targetId: string,
  roleKeys: readonly string[],
): Promise<void> {
  return adminMutation("role.manage", async (tx, ctx) => {
    requireOwner(ctx.roleKeys, "changing roles");

    const staff = await listStaff(tx, ctx.tenantId);
    // The lockout guards. See `domain/admin/people.ts` for why each exists.
    const blocked = roleChangeBlockedReason(
      staff,
      targetId,
      roleKeys,
      ctx.appUserId,
    );
    if (blocked) throw new Error(blocked);

    const before = staff.find((u) => u.id === targetId);
    await setStaffRoles(tx, ctx.tenantId, targetId, roleKeys, ctx.appUserId);

    return {
      result: undefined,
      audit: {
        action: "role.assign",
        entityType: "app_user",
        entityId: targetId,
        entityLabel: before?.email ?? targetId,
        before: { roleKeys: before?.roleKeys ?? [] },
        after: { roleKeys },
        changedFields: ["roleKeys"],
      },
    };
  });
}

export async function setStaffSuspended(
  targetId: string,
  suspended: boolean,
): Promise<void> {
  return adminMutation("user.manage", async (tx, ctx) => {
    const staff = await listStaff(tx, ctx.tenantId);
    const before = staff.find((u) => u.id === targetId);
    if (!before) throw new Error("staff account not found");

    if (suspended) {
      const blocked = suspensionBlockedReason(staff, targetId, ctx.appUserId);
      if (blocked) throw new Error(blocked);
    }

    await setStaffStatus(
      tx,
      ctx.tenantId,
      targetId,
      suspended ? "suspended" : "active",
    );

    return {
      result: undefined,
      audit: {
        action: suspended ? "user.suspend" : "user.reinstate",
        entityType: "app_user",
        entityId: targetId,
        entityLabel: before.email,
        before: { status: before.status },
        after: { status: suspended ? "suspended" : "active" },
        changedFields: ["status"],
      },
    };
  });
}

/**
 * Clear someone's enrolled authenticator so their next sign-in enrols a new one.
 *
 * §14.5: owner only, high-severity audit. It is the account-recovery
 * backdoor — whoever controls the mailbox after this controls the account —
 * so it is also refused on your own account, which is what stops a stolen
 * session from clearing its own second factor.
 */
export async function resetStaffMfa(targetId: string): Promise<void> {
  return adminMutation("user.manage", async (tx, ctx) => {
    requireOwner(ctx.roleKeys, "resetting an authenticator");

    const blocked = mfaResetBlockedReason(targetId, ctx.appUserId);
    if (blocked) throw new Error(blocked);

    const staff = await listStaff(tx, ctx.tenantId);
    const target = staff.find((u) => u.id === targetId);
    if (!target) throw new Error("staff account not found");

    // Clearing a factor is an Auth operation, so it needs the Supabase id
    // rather than ours. An invitation nobody has accepted has no auth user
    // yet and therefore no factor to clear.
    if (target.authUserId === null) {
      throw new Error(
        "that account has not signed in yet, so it has no authenticator",
      );
    }
    await clearUserMfa(target.authUserId);

    return {
      result: undefined,
      audit: {
        action: "user.reset_mfa",
        entityType: "app_user",
        entityId: targetId,
        entityLabel: target.email,
        // Named in the reason as well as the action: this is the entry an
        // incident review looks for, and it should read as significant
        // without needing the action key decoded.
        reason: "second factor cleared by an owner — account recovery",
      },
    };
  });
}

// ── Trade accounts ───────────────────────────────────────────────────────────

export async function listTradeAccountsForAdmin(filter: {
  status?: TradeAccountStatus;
}): Promise<TradeAccountRow[]> {
  return adminQuery("user.manage", (tx, ctx) =>
    listTradeAccounts(tx, ctx.tenantId, filter),
  );
}

export async function listPriceTiersForAdmin(): Promise<PriceTierRow[]> {
  return adminQuery("user.manage", (tx, ctx) => listPriceTiers(tx, ctx.tenantId));
}

/**
 * Approve, reject or suspend a trade account.
 *
 * §14.5 also says approval "emits an outbox event that notifies the
 * applicant". The outbox exists (Phase 2) but nothing drains it yet — the
 * worker is phase 9 — so no event is written rather than one that would sit
 * unprocessed and give a false record of having told someone.
 */
export async function decideTradeAccount(input: {
  id: string;
  status: TradeAccountStatus;
  priceTierId: string | null;
  creditLimit: number | null;
  paymentTermsDays: number | null;
  rejectionReason: string | null;
}): Promise<void> {
  return adminMutation("user.manage", async (tx, ctx) => {
    const accounts = await listTradeAccounts(tx, ctx.tenantId, {});
    const before = accounts.find((a) => a.id === input.id);
    if (!before) throw new Error("trade account not found");

    if (before.status === input.status) {
      throw new Error(`this account is already ${input.status}`);
    }
    if (!canTransitionTrade(before.status, input.status)) {
      throw new Error(`a ${before.status} account cannot become ${input.status}`);
    }
    if (input.status === "approved") {
      const blocked = approvalBlockedReason(input.priceTierId);
      if (blocked) throw new Error(blocked);
    }

    await setTradeAccountStatus(tx, ctx.tenantId, input.id, {
      ...input,
      approvedBy: ctx.appUserId,
    });

    return {
      result: undefined,
      audit: {
        action: `trade_account.${input.status}`,
        entityType: "trade_account",
        entityId: input.id,
        entityLabel: `${before.companyName} (${before.email})`,
        before: { status: before.status, priceTierId: before.priceTierId },
        after: { status: input.status, priceTierId: input.priceTierId },
        changedFields: ["status"],
        ...(input.rejectionReason ? { reason: input.rejectionReason } : {}),
      },
    };
  });
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function listSettingsForAdmin(): Promise<SettingRow[]> {
  return adminQuery("settings.write", (tx, ctx) => listSettings(tx, ctx.tenantId));
}

export async function updateSetting(key: string, value: unknown): Promise<void> {
  return adminMutation("settings.write", async (tx, ctx) => {
    const before = (await listSettings(tx, ctx.tenantId)).find(
      (s) => s.key === key,
    );
    if (!before) throw new Error(`no setting named "${key}"`);

    await upsertSetting(tx, ctx.tenantId, key, value, ctx.appUserId);

    return {
      result: undefined,
      audit: {
        action: "settings.update",
        entityType: "app_setting",
        entityId: key,
        entityLabel: key,
        before: { value: before.value },
        after: { value },
        changedFields: ["value"],
      },
    };
  });
}
