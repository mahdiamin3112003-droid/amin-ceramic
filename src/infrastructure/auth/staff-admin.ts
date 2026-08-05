import "server-only";

import { getSupabaseAdmin } from "@/infrastructure/auth/supabase-admin";

/**
 * Supabase Auth operations that act on OTHER people's accounts.
 *
 * Separate from `supabase-server.ts`, which acts on behalf of whoever is
 * signed in. Everything here runs with the service-role key and therefore
 * bypasses RLS entirely, so every caller must already have passed
 * `requirePermission` — and, for both functions below, an owner check as
 * well (docs/04 §14.5).
 */

/**
 * Create an auth user and email them an invitation.
 *
 * Supabase's own invite rather than Resend: §14.5 says "email invite", and
 * Resend does not arrive until phase 9. This sends the mail, creates the
 * `auth.users` row and returns its id so the `app_user` row can be linked
 * in the same transaction.
 *
 * An address that already has an auth user is treated as success and its
 * existing id returned — someone re-invited after a failed first attempt
 * should end up with a working account, not an error they cannot act on.
 */
export async function inviteStaffByEmail(email: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/admin/login`,
  });

  if (!error) return data.user.id;

  // Already registered: find the existing id rather than failing.
  if (/already been registered|already exists/i.test(error.message)) {
    const { data: list, error: listError } = await admin.auth.admin.listUsers();
    if (listError)
      throw new Error(`could not look up the existing user: ${listError.message}`);

    const existing = list.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (existing) return existing.id;
  }

  throw new Error(`could not send the invitation: ${error.message}`);
}

/**
 * Remove every enrolled factor from an account.
 *
 * The next sign-in then walks through enrolment again, because
 * `getStaffSession` withholds permissions until a factor is verified for
 * any role that mutates. This is the account-recovery path, and the reason
 * §14.5 makes it owner-only with a high-severity audit entry.
 */
export async function clearUserMfa(authUserId: string): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin.auth.admin.mfa.listFactors({
    userId: authUserId,
  });
  if (error) throw new Error(`could not list factors: ${error.message}`);

  for (const factor of data.factors) {
    const { error: unenrollError } = await admin.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: authUserId,
    });
    if (unenrollError) {
      throw new Error(`could not clear a factor: ${unenrollError.message}`);
    }
  }
}
