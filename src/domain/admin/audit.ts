/**
 * Audit log view types. `domain/` imports nothing (ADR-0003).
 */

export interface AuditRow {
  readonly id: string;
  readonly actorType: string;
  readonly actorEmail: string | null;
  readonly action: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly entityLabel: string | null;
  readonly changedFields: readonly string[];
  readonly reason: string | null;
  readonly occurredAt: Date;
}

export interface AuditPage {
  readonly rows: readonly AuditRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface AuditFilter {
  readonly actorEmail?: string;
  readonly action?: string;
  readonly entityId?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly page?: number;
}

/**
 * Actions that deserve to stand out in a scan.
 *
 * Deletions and permission changes are the entries someone is looking for
 * when they open this page at all — everything else is the background
 * against which they stand out.
 */
export function isHighSeverity(action: string): boolean {
  return (
    action.endsWith(".delete") ||
    action.startsWith("role.") ||
    action.startsWith("user.") ||
    action === "product.discontinued" ||
    action === "inventory.write_off"
  );
}
