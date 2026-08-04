import {
  getStaffSession,
  type StaffSession,
} from "@/infrastructure/auth/staff-session";

/**
 * Enforcement layer 2 — the use-case wrapper (docs/04-api-architecture.md §5.1).
 *
 * Layer 1 (middleware) only answers "is this route staff-only?". Layer 4
 * (RLS) is the backstop. THIS layer is where a specific permission is
 * required, and it exists so that handlers contain no authorisation logic
 * at all: every admin action declares its requirement as DATA and calls
 * `requirePermission` first.
 *
 * §5.2: "A missing declaration is a build error, not a default-allow."
 * TypeScript cannot make an *omitted call* a build error, so the practical
 * equivalent here is that every mutation goes through
 * `src/application/actions/admin/*`, each of which opens with a
 * `requirePermission`. The layer beneath (RLS) is what makes a forgotten
 * call non-catastrophic rather than fatal — it would still return zero
 * rows, because a visitor's claims carry no permissions.
 *
 * The thrown errors are deliberately distinguishable so callers can map
 * them to the right HTTP status without string-matching.
 */

/** 403 — signed in, MFA fine, but lacks the permission. */
export class ForbiddenError extends Error {
  readonly code = "forbidden" as const;
  constructor(public readonly permission: string) {
    super(`missing permission: ${permission}`);
  }
}

/** 401 — no staff session at all. */
export class UnauthenticatedError extends Error {
  readonly code = "unauthenticated" as const;
  constructor() {
    super("staff authentication required");
  }
}

/** 403 `mfa_required` — first factor only; the second is outstanding. */
export class MfaRequiredError extends Error {
  readonly code = "mfa_required" as const;
  constructor() {
    super("second factor required");
  }
}

/**
 * 404, NOT 403 — docs/04 §5.1: "Returning 403 for another tenant's product
 * ID confirms the ID exists — an enumeration oracle." Throw this when a
 * resource is outside the caller's tenant.
 */
export class NotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor(message = "not found") {
    super(message);
  }
}

/**
 * Assert the caller holds `permission`, returning their session.
 *
 * Order matters and mirrors §5.1: authentication, then MFA, then the
 * permission itself. Checking the permission first would let an
 * unauthenticated caller distinguish "no such permission" from "not signed
 * in".
 */
export async function requirePermission(permission: string): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) throw new UnauthenticatedError();
  if (session.mfaRequired && !session.mfaSatisfied) throw new MfaRequiredError();
  if (!session.permissions.includes(permission))
    throw new ForbiddenError(permission);
  return session;
}

/** Assert a staff session exists, without requiring any specific permission. */
export async function requireStaff(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) throw new UnauthenticatedError();
  if (session.mfaRequired && !session.mfaSatisfied) throw new MfaRequiredError();
  return session;
}

/** Non-throwing check — for conditionally rendering nav items and actions. */
export async function hasPermission(permission: string): Promise<boolean> {
  const session = await getStaffSession();
  return session?.permissions.includes(permission) ?? false;
}
