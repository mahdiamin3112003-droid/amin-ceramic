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

export async function logAiInteraction(
  tx: RequestTransaction,
  tenantId: string,
  entry: AiInteractionEntry,
): Promise<void> {
  await tx.aiInteraction.create({
    data: {
      tenantId,
      feature: entry.feature,
      provider: entry.provider,
      model: entry.model,
      operation: entry.operation,
      inputTokens: entry.inputTokens ?? null,
      imageCount: entry.imageCount ?? null,
      costUsd: entry.costUsd ?? 0,
      latencyMs: entry.latencyMs,
      status: entry.status,
      errorMessage: entry.errorMessage ?? null,
      referenceType: entry.referenceId ? "product" : null,
      referenceId: entry.referenceId ?? null,
    },
  });
}
