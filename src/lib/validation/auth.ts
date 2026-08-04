import { z } from "zod";

/**
 * Boundary schemas for the staff auth screens.
 *
 * Deliberately permissive on the password FORMAT at sign-in: complexity
 * rules belong at enrolment, and enforcing them on the login form only
 * tells an attacker which candidate passwords are worth trying.
 */

export const signInSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
  /**
   * Unticked means the auth cookies are written without a lifetime, so the
   * browser drops them on close (see `createSupabaseServerClient`). Defaults
   * to false: the safer state for a shared showroom machine is the one you
   * get by not thinking about it.
   */
  rememberMe: z.coerce.boolean().default(false),
  /**
   * Post-sign-in destination. Validated as a SITE-RELATIVE ADMIN PATH, not
   * merely a string: an unchecked `next` is an open redirect, and the login
   * page is exactly where one is worth exploiting. `//evil.com` and
   * `https://evil.com` both fail this, since the first character must be
   * `/` and the second must not be `/`.
   */
  next: z
    .string()
    .regex(/^\/admin(?:\/[\w\-/]*)?$/, "invalid redirect")
    .optional(),
});

export const verifyTotpSchema = z.object({
  /** TOTP codes are exactly six digits; anything else never reaches Supabase. */
  code: z.string().regex(/^\d{6}$/, "enter the six-digit code"),
  next: z
    .string()
    .regex(/^\/admin(?:\/[\w\-/]*)?$/, "invalid redirect")
    .optional(),
});

export const enrolTotpSchema = z.object({
  factorId: z.uuid(),
  code: z.string().regex(/^\d{6}$/, "enter the six-digit code"),
});

export const forgotPasswordSchema = z.object({
  email: z.email().max(320),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type VerifyTotpInput = z.infer<typeof verifyTotpSchema>;
export type EnrolTotpInput = z.infer<typeof enrolTotpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
