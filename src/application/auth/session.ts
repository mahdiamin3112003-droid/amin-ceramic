import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server";
import {
  getStaffSession,
  type StaffSession,
} from "@/infrastructure/auth/staff-session";

/**
 * Application-layer read surface for the current staff session.
 *
 * Exists because the layer boundary (docs/01 §5.3, enforced by
 * `eslint-plugin-boundaries`) forbids presentation from importing
 * infrastructure — pages and layouts must come through here. That is not
 * bureaucracy: it is what keeps `@supabase/*` out of the route tree, so
 * swapping the auth provider touches this directory and nothing else.
 *
 * `authorize.ts` is the ENFORCEMENT side and throws. This is the READ side
 * and returns null — for layouts deciding where to redirect, and for
 * rendering a name in a menu.
 */
export type { StaffSession };

/** The signed-in staff member, or null. Never throws on "not signed in". */
export async function getCurrentStaff(): Promise<StaffSession | null> {
  return getStaffSession();
}

/**
 * Whether this user has a usable TOTP factor, for the 2FA screen's
 * enrol-or-verify branch.
 *
 * `listFactors().totp` is already filtered to verified factors by
 * Supabase's own types (`Factor<'totp', 'verified'>[]`), so its length is
 * the whole answer — no status check needed.
 */
export async function hasEnrolledTotp(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return false;
  return data.totp.length > 0;
}
