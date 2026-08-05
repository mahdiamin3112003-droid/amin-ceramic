import { requirePermission } from "@/application/auth/authorize";
import {
  writeAuditLog,
  type AuditEntry,
} from "@/infrastructure/db/repositories/audit-repository";
import {
  getRequestContext,
  withRequestContext,
  type RequestTransaction,
} from "@/infrastructure/db/request-context";

/**
 * The single entry point for every admin write.
 *
 * It composes the four things that must ALL happen for a staff mutation to
 * be correct, in the one order that works:
 *
 *   1. `requirePermission` — enforcement layer 2, before anything is read.
 *   2. `withRequestContext` — stamps the staff claims, so layer 4 (RLS)
 *      can see who is asking.
 *   3. the mutation itself.
 *   4. `writeAuditLog` — IN THE SAME TRANSACTION, so a rolled-back
 *      mutation cannot leave an audit row claiming it happened, and a
 *      committed one cannot fail to leave one.
 *
 * Step 4 is why the callback returns `{ result, audit }` instead of just a
 * result. Making the audit entry part of the return TYPE means a mutation
 * that forgets to describe itself does not compile — which is the closest
 * TypeScript gets to docs/04 §5.2's "a missing declaration is a build
 * error, not a default-allow". The alternative, a separate `audit()` call
 * inside the callback, is forgettable in exactly the cases that matter.
 *
 * The audit entry is built AFTER the mutation runs, from its result, so it
 * can record generated ids and real before/after values rather than
 * whatever the caller intended.
 */
export interface AdminMutationContext {
  readonly tenantId: string;
  readonly appUserId: string;
  readonly email: string;
  /**
   * The caller's roles, for the handful of operations that are restricted
   * by ROLE rather than by permission — docs/04 §14.5 marks
   * `updateUserRoles` and `resetUserMfa` "owner only", which no permission
   * key expresses. `role.manage` happens to be owner-only in the seed, but
   * that is a seed fact rather than a guarantee.
   */
  readonly roleKeys: readonly string[];
}

export async function adminMutation<T>(
  permission: string,
  fn: (
    tx: RequestTransaction,
    ctx: AdminMutationContext,
  ) => Promise<{ result: T; audit: AuditEntry }>,
): Promise<T> {
  // Throws UnauthenticatedError / MfaRequiredError / ForbiddenError, which
  // the Server Action maps to a status. Nothing below runs otherwise.
  const session = await requirePermission(permission);
  const { tenantId } = await getRequestContext();

  const ctx: AdminMutationContext = {
    tenantId,
    appUserId: session.appUserId,
    email: session.email,
    roleKeys: session.roleKeys,
  };

  return withRequestContext(
    {
      tenantId,
      appUserId: session.appUserId,
      permissions: session.permissions,
    },
    async (tx) => {
      const { result, audit } = await fn(tx, ctx);

      await writeAuditLog(
        tx,
        tenantId,
        { type: "user", id: session.appUserId, email: session.email },
        audit,
      );

      return result;
    },
  );
}

/**
 * Read counterpart — permission-checked, claims-stamped, no audit.
 *
 * Reads are not audited by default and deliberately so: auditing every
 * product list view would bury the writes that matter under noise nobody
 * reads. The genuinely sensitive reads (trade pricing, the audit log
 * itself) get explicit entries where they are implemented.
 */
export async function adminQuery<T>(
  permission: string,
  fn: (tx: RequestTransaction, ctx: AdminMutationContext) => Promise<T>,
): Promise<T> {
  const session = await requirePermission(permission);
  const { tenantId } = await getRequestContext();

  return withRequestContext(
    {
      tenantId,
      appUserId: session.appUserId,
      permissions: session.permissions,
    },
    async (tx) =>
      fn(tx, {
        tenantId,
        appUserId: session.appUserId,
        email: session.email,
        roleKeys: session.roleKeys,
      }),
  );
}
