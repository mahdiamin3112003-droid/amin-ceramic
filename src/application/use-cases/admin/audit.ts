import { adminQuery } from "@/application/auth/admin-mutation";
import type { AuditFilter, AuditPage } from "@/domain/admin/audit";
import { listAuditLog } from "@/infrastructure/db/repositories/audit-repository";

/**
 * Reading the audit log needs `audit.read`, which by default only owner and
 * admin hold. That is deliberate: the log records who did what, and in a
 * small team that is also a record of who was working when.
 */
export async function listAudit(filter: AuditFilter): Promise<AuditPage> {
  return adminQuery("audit.read", (tx, ctx) =>
    listAuditLog(tx, ctx.tenantId, filter),
  );
}
