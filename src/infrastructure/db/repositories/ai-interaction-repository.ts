import type { AiFeature, AiOperation, AiProvider } from "@prisma/client";

import type { RequestTransaction } from "@/infrastructure/db/request-context";

/**
 * One row per model call, across every AI feature — docs/01-architecture.md
 * §6.6, `prisma/ai.prisma`'s `AiInteraction`. What makes AI spend
 * attributable and the caching layer's hit rate visible.
 *
 * Written by the CALLER inside the same transaction as whatever the
 * embedding call produced (the backfill script, eventually a live
 * mutation), matching the audit-log pattern in `admin-mutation.ts` — a
 * best-effort side call that can silently vanish is exactly what this
 * table exists to prevent.
 */
export interface AiInteractionEntry {
  readonly feature: AiFeature;
  readonly provider: AiProvider;
  readonly model: string;
  readonly operation: AiOperation;
  readonly inputTokens?: number;
  readonly imageCount?: number;
  /** Only set when the provider actually returns a billable figure — see the provider abstraction's own note on this. */
  readonly costUsd?: number;
  readonly latencyMs: number;
  readonly status: "success" | "error" | "timeout" | "rate_limited" | "filtered";
  readonly errorMessage?: string;
  readonly referenceId?: string;
}

/**
 * Raw INSERT, deliberately — NOT `tx.aiInteraction.create()`.
 *
 * ── Why, and how this was found ──
 * Prisma's `create()` issues `INSERT … RETURNING`, and under row-level
 * security a RETURNING clause must also satisfy the table's SELECT policy.
 * `ai_interaction`'s SELECT policy is `app.has_permission('ai.costs.read')`
 * — a staff permission. A public Tile Finder visitor writing their own cost
 * row therefore inserted a row they were not allowed to read back, and
 * Postgres reported it as:
 *
 *     new row violates row-level security policy for table "ai_interaction"
 *
 * which reads exactly like a WITH CHECK failure and is not one. Proven by
 * isolating it: in one transaction, as `app_runtime` with correct claims, a
 * raw INSERT succeeded and `create()` failed on the same row.
 *
 * Nothing needs the inserted row, so not asking for it is both the fix and
 * the honest description of what this function does. Adding a permissive
 * SELECT policy would have worked too, and would have been wrong — it would
 * open the cost log to every visitor to satisfy an ORM's convenience.
 *
 * The same trap applies to any RLS table whose SELECT policy is narrower
 * than its INSERT policy: write it raw, or the ORM will ask for something
 * the caller may not have.
 */
export async function logAiInteraction(
  tx: RequestTransaction,
  tenantId: string,
  entry: AiInteractionEntry,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO ai_interaction (
      tenant_id, feature, provider, model, operation,
      input_tokens, image_count, cost_usd, latency_ms,
      status, error_message, reference_type, reference_id
    ) VALUES (
      ${tenantId}::uuid,
      ${entry.feature}::ai_feature,
      ${entry.provider}::ai_provider,
      ${entry.model},
      ${entry.operation}::ai_operation,
      ${entry.inputTokens ?? null},
      ${entry.imageCount ?? null},
      ${entry.costUsd ?? 0},
      ${entry.latencyMs},
      ${entry.status}::ai_interaction_status,
      ${entry.errorMessage ?? null},
      ${entry.referenceId ? "product" : null}::ai_interaction_reference_type,
      ${entry.referenceId ?? null}::uuid
    )
  `;
}
