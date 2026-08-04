import type { Prisma } from "@prisma/client";

/**
 * Audit log — `audit_log` (docs/03-database-design.md §11).
 *
 * WRITTEN IN THE SAME TRANSACTION AS THE MUTATION IT RECORDS. That is the
 * whole design: an audit row that can be written separately is an audit row
 * that can go missing when the mutation rolls back (or survive when the
 * mutation fails), and an audit trail nobody can trust is worse than none,
 * because it is believed. Same reasoning as Phase 2's transactional outbox.
 *
 * `audit_log` is APPEND-ONLY at the database — it has no DELETE grant and a
 * trigger blocks UPDATE (Phase 1). Nothing here can rewrite history, by
 * construction rather than by convention.
 *
 * Note `.create()` is deliberately NOT used: Prisma's `.create()` always
 * issues `INSERT ... RETURNING`, and Postgres applies the table's SELECT
 * policy to the returned row. `audit_log`'s SELECT is gated on `audit.read`,
 * which most actors performing an audited action do not hold — so the
 * RETURNING would fail even though the INSERT is permitted. This is the
 * same trap found on `outbox_event` in Phase 2.
 */

import type { AuditFilter, AuditPage, AuditRow } from "@/domain/admin/audit";

const AUDIT_PAGE_SIZE = 50;

export type AuditActor =
  | { readonly type: "user"; readonly id: string; readonly email: string }
  | { readonly type: "system" };

export interface AuditEntry {
  /** Dotted action key, matching the permission vocabulary: `product.publish`, `inventory.adjust`. */
  readonly action: string;
  readonly entityType?: string;
  readonly entityId?: string;
  /** Human-readable identifier — survives the entity being deleted. */
  readonly entityLabel?: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly changedFields?: readonly string[];
  readonly reason?: string;
}

export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actor: AuditActor,
  entry: AuditEntry,
): Promise<void> {
  const actorId = actor.type === "user" ? actor.id : null;
  const actorEmail = actor.type === "user" ? actor.email : null;

  await tx.$executeRaw`
    INSERT INTO audit_log (
      tenant_id, actor_type, actor_id, actor_email, action,
      entity_type, entity_id, entity_label, before, after, changed_fields, reason
    ) VALUES (
      ${tenantId}::uuid,
      ${actor.type}::audit_actor_type,
      ${actorId}::uuid,
      ${actorEmail},
      ${entry.action},
      ${entry.entityType ?? null},
      ${entry.entityId ?? null}::uuid,
      ${entry.entityLabel ?? null},
      ${entry.before === undefined ? null : JSON.stringify(entry.before)}::jsonb,
      ${entry.after === undefined ? null : JSON.stringify(entry.after)}::jsonb,
      ${entry.changedFields ?? []},
      ${entry.reason ?? null}
    )
  `;
}

/**
 * Field-level diff for the `changed_fields` column and a minimal `before`.
 * Storing only what changed keeps the log readable and small — a full
 * snapshot of every row on every edit makes the log unusable at volume.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { changedFields: string[]; before: Partial<T>; after: Partial<T> } {
  const changedFields: string[] = [];
  const beforeSubset: Record<string, unknown> = {};
  const afterSubset: Record<string, unknown> = {};

  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    // JSON comparison so Decimal/Date instances compare by value, not identity.
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changedFields.push(key);
      beforeSubset[key] = a;
      afterSubset[key] = b;
    }
  }

  return {
    changedFields,
    before: beforeSubset as Partial<T>,
    after: afterSubset as Partial<T>,
  };
}

/**
 * Read the log.
 *
 * Gated by RLS on `audit.read`, which is why this is a plain `findMany`
 * while the write above has to avoid RETURNING — the reader holds the
 * permission the SELECT policy asks for, and the writer generally does not.
 */
export async function listAuditLog(
  tx: Prisma.TransactionClient,
  tenantId: string,
  filter: AuditFilter,
): Promise<AuditPage> {
  const page = Math.max(1, filter.page ?? 1);

  const where: Prisma.AuditLogWhereInput = {
    tenantId,
    ...(filter.actorEmail
      ? {
          actorEmail: { contains: filter.actorEmail, mode: "insensitive" as const },
        }
      : {}),
    // `startsWith` so `product` matches every product action — the useful
    // question is almost always about a family, not one exact key.
    ...(filter.action ? { action: { startsWith: filter.action } } : {}),
    ...(filter.entityId ? { entityId: filter.entityId } : {}),
    ...(filter.from || filter.to
      ? {
          occurredAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    tx.auditLog.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: {
        id: true,
        actorType: true,
        actorEmail: true,
        action: true,
        entityType: true,
        entityId: true,
        entityLabel: true,
        changedFields: true,
        reason: true,
        occurredAt: true,
      },
    }),
    tx.auditLog.count({ where }),
  ]);

  return {
    rows: rows.map((row): AuditRow => ({
      // `id` is a bigserial. Stringified here because BigInt is not
      // JSON-serialisable, so a Server Component handing one to a Client
      // Component throws at runtime — same reason `media_asset.bytes` is
      // converted at its own boundary.
      id: String(row.id),
      actorType: row.actorType,
      actorEmail: row.actorEmail,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      entityLabel: row.entityLabel,
      changedFields: row.changedFields,
      reason: row.reason,
      occurredAt: row.occurredAt,
    })),
    total,
    page,
    pageSize: AUDIT_PAGE_SIZE,
  };
}
