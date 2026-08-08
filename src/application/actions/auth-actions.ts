"use server";

import { redirect } from "next/navigation";

import { fail, ok, type ActionResult } from "@/application/actions/result";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server";
import { getStaffSession } from "@/infrastructure/auth/staff-session";
import { siteUrl } from "@/lib/seo/site";
import {
  enrolTotpSchema,
  forgotPasswordSchema,
  signInSchema,
  verifyTotpSchema,
} from "@/lib/validation/auth";

/**
 * Staff authentication actions — docs/04-api-architecture.md §4.3, §4.6.
 *
 * Two rules run through all of them:
 *
 * 1. **Failures are indistinguishable.** Wrong password, unknown address and
 *    "address exists but has no staff record" all return the same message.
 *    A login form that says "no such user" is a free account-enumeration
 *    endpoint, and this one is on a public URL.
 * 2. **Sign-in alone is not authorisation.** It establishes a first factor.
 *    Whether that session may do anything is decided by
 *    `getStaffSession()`, which withholds every permission until TOTP is
 *    satisfied for roles that require it.
 */

/** Deliberately identical for every sign-in failure mode. See rule 1. */
const SIGN_IN_FAILED = "Those details didn't work. Check them and try again.";

export async function signInAction(
  input: unknown,
): Promise<ActionResult<{ next: string }>> {
  try {
    const { email, password, next, rememberMe } = signInSchema.parse(input);
    // The ONLY call that passes `persistSession` — this is the request that
    // mints the cookies, so it is the one that decides their lifetime.
    const supabase = await createSupabaseServerClient({
      persistSession: rememberMe,
    });

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // The CALLER is told nothing (rule 1), but the operator must be. A
      // wrong password and a rate-limited or unreachable auth service are
      // the same event to the user and completely different events to
      // whoever is on call — and until this logged, an infrastructure
      // failure was indistinguishable from a typo in the server logs too.
      //
      // `error.status` and `error.code` are what separate them: 400 is a
      // bad credential, 429 is a rate limit, 5xx is Supabase.
      console.error("[auth] sign-in rejected", {
        status: error.status,
        code: error.code,
        message: error.message,
      });
      return { ok: false, error: SIGN_IN_FAILED };
    }

    // Signed in with Supabase — but a Supabase account is not staff. The
    // authority is the AppUser row, so verify one exists and is active
    // before letting them past the login screen. If it doesn't, sign the
    // Supabase session straight back out: leaving a valid auth session
    // attached to a non-staff account is a loose end.
    const session = await getStaffSession();
    if (!session) {
      // Valid Supabase credential, no active staff record. Worth logging as
      // its own case: it is what a suspended or soft-deleted account looks
      // like, and it is also what a broken `resolve_staff_identity` looks
      // like — the two need telling apart.
      console.error("[auth] credential accepted but no active staff record", {
        email,
      });
      await supabase.auth.signOut();
      return { ok: false, error: SIGN_IN_FAILED };
    }

    // Roles carrying `.write`/`.manage`/`.approve`/`.adjust` owe a second
    // factor before they hold any permission at all (§4.3).
    if (session.mfaRequired && !session.mfaSatisfied) {
      return ok({
        next: `/admin/2fa${next ? `?next=${encodeURIComponent(next)}` : ""}`,
      });
    }

    return ok({ next: next ?? "/admin" });
  } catch (cause) {
    // Even an unexpected fault returns the generic message — a stack-shaped
    // error string on a login form is its own disclosure.
    console.error("[auth] sign-in failed", cause);
    return { ok: false, error: SIGN_IN_FAILED };
  }
}

/**
 * Verify a TOTP code against the user's enrolled factor, raising the
 * session to `aal2`. That level is what `getStaffSession()` reads to decide
 * whether to release permissions, so this is the moment a staff session
 * becomes able to do anything.
 */
export async function verifyTotpAction(
  input: unknown,
): Promise<ActionResult<{ next: string }>> {
  try {
    const { code, next } = verifyTotpSchema.parse(input);
    const supabase = await createSupabaseServerClient();

    const { data: factors, error: factorsError } =
      await supabase.auth.mfa.listFactors();
    if (factorsError) return fail(factorsError, "Couldn't verify that code.");

    // `data.totp` is typed `Factor<'totp', 'verified'>[]` — Supabase has
    // already filtered it to verified factors, so there is no status to check.
    const factor = factors.totp[0];
    if (!factor) {
      return { ok: false, error: "No authenticator is enrolled for this account." };
    }

    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });
    // `challenge` narrows to non-null off `challengeError` — the response is
    // a discriminated union, so an explicit null check is dead code.
    if (challengeError) return fail(challengeError, "Couldn't verify that code.");

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      return { ok: false, error: "That code wasn't right. Try the next one." };
    }

    return ok({ next: next ?? "/admin" });
  } catch (cause) {
    return fail(cause, "Couldn't verify that code.");
  }
}

/**
 * Begin TOTP enrolment. Returns the otpauth URI and secret so the UI can
 * render a QR code; the factor is not usable until `confirmTotpEnrolmentAction`
 * verifies a code from it.
 */
export async function startTotpEnrolmentAction(): Promise<
  ActionResult<{ factorId: string; qrCodeSvg: string; secret: string }>
> {
  try {
    const supabase = await createSupabaseServerClient();

    // Clear out any half-finished attempt first, otherwise Supabase rejects
    // the new enrolment as a duplicate friendly name.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const stale of existing?.all.filter((f) => f.status === "unverified") ??
      []) {
      await supabase.auth.mfa.unenroll({ factorId: stale.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator",
    });
    if (error) return fail(error, "Couldn't start authenticator setup.");

    return ok({
      factorId: data.id,
      qrCodeSvg: data.totp.qr_code,
      secret: data.totp.secret,
    });
  } catch (cause) {
    return fail(cause, "Couldn't start authenticator setup.");
  }
}

/** Confirm enrolment with a code from the newly-scanned authenticator. */
export async function confirmTotpEnrolmentAction(
  input: unknown,
): Promise<ActionResult<{ verified: true }>> {
  try {
    const { factorId, code } = enrolTotpSchema.parse(input);
    const supabase = await createSupabaseServerClient();

    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({
        factorId,
      });
    if (challengeError) return fail(challengeError, "Couldn't confirm that code.");

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (error) {
      return { ok: false, error: "That code wasn't right. Try the next one." };
    }

    return ok({ verified: true });
  } catch (cause) {
    return fail(cause, "Couldn't confirm that code.");
  }
}

/**
 * Password reset. ALWAYS reports success, whether or not the address is
 * known — same enumeration reasoning as sign-in. The user is told to check
 * their inbox either way.
 */
export async function forgotPasswordAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { email } = forgotPasswordSchema.parse(input);
    const supabase = await createSupabaseServerClient();

    // `siteUrl` (src/lib/seo/site.ts), not a bare `process.env.NEXT_PUBLIC_SITE_URL`
    // read: that var is deliberately left unset until a custom domain exists
    // (see docs/deployment), and reading it directly here — instead of through
    // the shared helper that falls back to Vercel's own
    // VERCEL_PROJECT_PRODUCTION_URL — sent every reset link to
    // http://localhost:3000/admin/reset on the deployed site. Caught live: a
    // real reset email whose link failed to connect.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/admin/reset`,
    });

    return ok(null);
  } catch (cause) {
    // Still `ok` — see above. Logged so a genuinely broken mailer is visible
    // to us without being visible to the caller.
    console.error("[auth] password reset request failed", cause);
    return ok(null);
  }
}

export async function signOutAction(): Promise<never> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
