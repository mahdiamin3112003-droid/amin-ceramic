import type { Prisma } from "@prisma/client";

import type {
  AppUserStatus,
  PriceTierRow,
  RoleRow,
  SettingDataType,
  SettingRow,
  StaffRow,
  TradeAccountRow,
  TradeAccountStatus,
} from "@/domain/admin/people";

/**
 * Staff, roles, trade accounts and settings — docs/04 §14.5.
 *
 * Everything here is reached through `adminQuery`/`adminMutation`, so the
 * RLS claims are already stamped. `app_user`'s own policies authorise on
 * `user.manage`, which is exactly the permission these operations demand —
 * so the database refuses the same things the application does.
 */

function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

// ── Staff ────────────────────────────────────────────────────────────────────

export async function listStaff(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<StaffRow[]> {
  const rows = await tx.appUser.findMany({
    where: { tenantId, deletedAt: null, userType: "staff" },
    orderBy: [{ status: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      fullName: true,
      status: true,
      authUserId: true,
      lastSeenAt: true,
      createdAt: true,
      userRoles: { select: { role: { select: { key: true } } } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    authUserId: row.authUserId,
    email: row.email,
    fullName: row.fullName,
    status: row.status,
    roleKeys: row.userRoles.map((ur) => ur.role.key).sort(),
    // Whether a factor is ENROLLED lives in Supabase Auth, not here. What
    // this table knows is whether the account is linked to an auth user at
    // all — an invited account that never signed in has no link yet, and
    // showing "no MFA" for it would be misleading rather than informative.
    hasMfa: row.authUserId !== null,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
  }));
}

export async function createInvitedStaff(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: { email: string; fullName: string | null; authUserId: string | null },
): Promise<{ id: string }> {
  return tx.appUser.create({
    data: {
      tenantId,
      email: input.email,
      fullName: input.fullName,
      authUserId: input.authUserId,
      userType: "staff",
      // `invited`, not `active`: the account exists so roles can be
      // attached, but `getStaffSession` only resolves `active` accounts, so
      // an invitation that is never accepted grants nothing.
      status: "invited",
    },
    select: { id: true },
  });
}

/** Flip an invited account to active once its owner has signed in. */
export async function activateStaff(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
): Promise<void> {
  await tx.appUser.updateMany({
    where: { id, tenantId, status: "invited" },
    data: { status: "active" },
  });
}

export async function setStaffStatus(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
  status: AppUserStatus,
): Promise<void> {
  const { count } = await tx.appUser.updateMany({
    where: { id, tenantId, deletedAt: null },
    data: { status, updatedAt: new Date() },
  });
  if (count === 0) throw new Error("staff account not found");
}

/**
 * Replace a user's roles wholesale.
 *
 * Delete-then-insert inside the caller's transaction rather than a diff:
 * the set is tiny, and a diff has three code paths where this has one. If
 * the insert fails the delete rolls back with it, so there is no window
 * where the user holds nothing.
 */
export async function setStaffRoles(
  tx: Prisma.TransactionClient,
  tenantId: string,
  appUserId: string,
  roleKeys: readonly string[],
  grantedBy: string,
): Promise<void> {
  const roles = await tx.role.findMany({
    where: { tenantId, key: { in: [...roleKeys] } },
    select: { id: true, key: true },
  });

  if (roles.length !== roleKeys.length) {
    const found = new Set(roles.map((r) => r.key));
    const missing = roleKeys.filter((k) => !found.has(k));
    throw new Error(`unknown role(s): ${missing.join(", ")}`);
  }

  await tx.userRole.deleteMany({ where: { appUserId } });
  if (roles.length > 0) {
    await tx.userRole.createMany({
      data: roles.map((role) => ({ appUserId, roleId: role.id, grantedBy })),
    });
  }
}

// ── Roles ────────────────────────────────────────────────────────────────────

export async function listRoles(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<RoleRow[]> {
  const rows = await tx.role.findMany({
    where: { tenantId },
    orderBy: { key: "asc" },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      isSystem: true,
      rolePermissions: { select: { permissionKey: true } },
      _count: { select: { userRoles: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    permissionKeys: row.rolePermissions.map((rp) => rp.permissionKey).sort(),
    memberCount: row._count.userRoles,
  }));
}

// ── Trade accounts ───────────────────────────────────────────────────────────

export async function listTradeAccounts(
  tx: Prisma.TransactionClient,
  tenantId: string,
  filter: { status?: TradeAccountStatus } = {},
): Promise<TradeAccountRow[]> {
  const rows = await tx.tradeAccount.findMany({
    where: { tenantId, ...(filter.status ? { status: filter.status } : {}) },
    // Pending first: the whole point of this screen is the queue.
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      appUserId: true,
      companyName: true,
      taxId: true,
      registrationNo: true,
      tradeType: true,
      status: true,
      priceTierId: true,
      creditLimit: true,
      paymentTermsDays: true,
      rejectionReason: true,
      approvedAt: true,
      createdAt: true,
      appUser: { select: { email: true } },
      priceTier: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    appUserId: row.appUserId,
    email: row.appUser.email,
    companyName: row.companyName,
    taxId: row.taxId,
    registrationNo: row.registrationNo,
    tradeType: row.tradeType,
    status: row.status,
    priceTierId: row.priceTierId,
    priceTierName: row.priceTier?.name ?? null,
    creditLimit: toNumber(row.creditLimit),
    paymentTermsDays: row.paymentTermsDays,
    rejectionReason: row.rejectionReason,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
  }));
}

export async function listPriceTiers(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<PriceTierRow[]> {
  const rows = await tx.priceTier.findMany({
    where: { tenantId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, key: true, name: true, discountPct: true, isDefault: true },
  });

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    discountPct: row.discountPct.toNumber(),
    isDefault: row.isDefault,
  }));
}

export async function setTradeAccountStatus(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
  input: {
    status: TradeAccountStatus;
    priceTierId: string | null;
    creditLimit: number | null;
    paymentTermsDays: number | null;
    rejectionReason: string | null;
    approvedBy: string;
  },
): Promise<void> {
  const approving = input.status === "approved";

  const { count } = await tx.tradeAccount.updateMany({
    where: { id, tenantId },
    data: {
      status: input.status,
      updatedAt: new Date(),
      // The tier is only meaningful on approval; rejecting or suspending
      // leaves whatever was there so reinstating does not lose it.
      ...(approving
        ? {
            priceTierId: input.priceTierId,
            creditLimit: input.creditLimit,
            paymentTermsDays: input.paymentTermsDays,
            approvedBy: input.approvedBy,
            approvedAt: new Date(),
            rejectionReason: null,
          }
        : {}),
      ...(input.status === "rejected"
        ? { rejectionReason: input.rejectionReason }
        : {}),
    },
  });

  if (count === 0) throw new Error("trade account not found");
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function listSettings(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<SettingRow[]> {
  const rows = await tx.appSetting.findMany({
    where: { tenantId },
    orderBy: { key: "asc" },
    select: {
      key: true,
      value: true,
      dataType: true,
      scope: true,
      description: true,
    },
  });

  return rows.map((row) => ({
    key: row.key,
    value: row.value,
    dataType: row.dataType as SettingDataType,
    scope: row.scope,
    description: row.description,
  }));
}

export async function upsertSetting(
  tx: Prisma.TransactionClient,
  tenantId: string,
  key: string,
  value: unknown,
  updatedBy: string,
): Promise<void> {
  const { count } = await tx.appSetting.updateMany({
    where: { tenantId, key },
    data: { value: value as Prisma.InputJsonValue, updatedBy },
  });
  // Deliberately update-only: settings are seeded with their type and scope,
  // and letting the admin invent new keys would produce rows nothing reads.
  if (count === 0) throw new Error(`no setting named "${key}"`);
}
