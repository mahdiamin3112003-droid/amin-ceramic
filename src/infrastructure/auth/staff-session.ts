import { cache } from "react";

import { requiresMfa } from "@/domain/admin/permissions";
import { prisma } from "@/infrastructure/db/client";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server";

/**
 * Resolves the signed-in STAFF member and their flattened permission union.
 *
 * This is the keystone of Phase 4. Every RLS policy written in Phase 1
 * already authorises off `app.app_user_id()` and `app.has_permission()`,
 * reading `request.jwt.claims` — but Phase 2 only ever populated the
 * VISITOR half of those claims, so every staff-side policy has been
 * dormant. Filling in `appUserId` + `permissions` here is what switches
 * them on, with no schema change.
 *
 * PERMISSIONS ARE FLATTENED HERE, NOT JOINED IN RLS (docs/04 §4.4,
 * docs/03 §16.2): the union of every permission across the user's roles is
 * computed once per request and handed to Postgres as a claim, so a policy
 * can answer "may this caller?" without a three-table join on every row of
 * every query.
 *
 * MFA (docs/04 §4.3): a session that has not completed TOTP is returned
 * with `mfaSatisfied: false` and — critically — an EMPTY permission list.
 * "The first factor alone gets a session that can read nothing
 * privileged." Because the permissions never reach the claims, that rule
 * is enforced by RLS at the database, not merely by a UI check.
 *
 * `cache()` for the same reason `getRequestContext` uses it: this runs
 * before every staff read, and an uncached version would issue the same
 * two queries per use-case (see the project memory on pool contention).
 */

export interface StaffSession {
  readonly appUserId: string;
  readonly authUserId: string;
  readonly email: string;
  readonly fullName: string | null;
  readonly roleKeys: readonly string[];
  /** Empty until MFA is satisfied, when MFA is required. */
  readonly permissions: readonly string[];
  /** True when this user's roles oblige them to complete TOTP. */
  readonly mfaRequired: boolean;
  /** True when the current session has actually completed it (or none was needed). */
  readonly mfaSatisfied: boolean;
}

export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const supabase = await createSupabaseServerClient();

  // `getUser()` revalidates against Supabase rather than trusting the
  // cookie's contents — `getSession()` would return an unverified payload.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // ── The bootstrap read ──
  //
  // Through `app.resolve_staff_identity()`, NOT an ordinary Prisma query.
  //
  // The obvious version — `prisma.appUser.findUnique({ where: { authUserId }})`
  // — is what this used to do, and it could never work. The runtime
  // connection is the RLS-constrained `app_runtime` role, and
  // `app_user_self_read` authorises on `app.app_user_id()`, which is the
  // very claim this read exists to produce. It failed closed, returned zero
  // rows, and made every sign-in report a wrong password. Caught by the
  // end-to-end suite; see migration 0025 for the full reasoning.
  //
  // The function is SECURITY DEFINER, STABLE, executable only by
  // `app_runtime`, and takes the Supabase-verified `auth.users.id` — never
  // client-supplied input. It also filters out suspended and soft-deleted
  // accounts in SQL, so there is no version of this that forgets to.
  const rows = await prisma.$queryRaw<
    {
      app_user_id: string;
      tenant_id: string;
      email: string;
      full_name: string | null;
      role_keys: string[];
      permissions: string[];
    }[]
  >`SELECT * FROM app.resolve_staff_identity(${user.id}::uuid)`;

  // No linked staff record, suspended, or soft-deleted → no staff session.
  // A Supabase account alone grants nothing; authority comes from AppUser.
  const appUser = rows[0];
  if (!appUser) return null;

  const roleKeys = appUser.role_keys;
  const granted = [...new Set(appUser.permissions)].sort();

  const mfaRequired = requiresMfa(granted);

  // Supabase reports the session's assurance level: `aal2` means a second
  // factor was verified for THIS session.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const mfaSatisfied = !mfaRequired || aal?.currentLevel === "aal2";

  return {
    appUserId: appUser.app_user_id,
    authUserId: user.id,
    email: appUser.email,
    fullName: appUser.full_name,
    roleKeys,
    // Withheld until the second factor is done — this is the enforcement,
    // not the UI.
    permissions: mfaSatisfied ? granted : [],
    mfaRequired,
    mfaSatisfied,
  };
});
