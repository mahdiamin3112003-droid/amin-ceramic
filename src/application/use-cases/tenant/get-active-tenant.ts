import type { Tenant } from "@/domain/tenant/entity";
import { findActiveTenant } from "@/infrastructure/db/repositories/tenant-repository";

/**
 * Read the active tenant.
 *
 * docs/04-api-architecture.md §1.1: "The fastest API call is the one that never
 * happens." Server Components call this directly — same process, no HTTP, no
 * serialisation, no auth round trip. There is no `/api/tenant` endpoint and
 * there should not be one until something outside the render pass needs it.
 *
 * §1.3: "The transport is an implementation detail; the use-case is the API."
 * When a REST route or a background job eventually needs this, it adapts to this
 * function rather than reimplementing the read.
 *
 * DEGRADE, DON'T FAIL (§18.3). A missing database must not take the page down
 * during Phase 0 development, when there may not be one configured yet. The
 * caller renders a designed empty state instead of a stack trace.
 */
export interface GetActiveTenantResult {
  readonly tenant: Tenant | null;
  /** Present when the read failed rather than simply finding nothing. */
  readonly error: string | null;
}

export async function getActiveTenant(): Promise<GetActiveTenantResult> {
  try {
    return { tenant: await findActiveTenant(), error: null };
  } catch (cause) {
    // Never surfaced to the user verbatim — §18.3, "Never leak internals". The
    // caller shows a human sentence; this goes to the server log, and to Sentry
    // once observability lands in Phase 9.
    console.error("[tenant] read failed", cause);
    return {
      tenant: null,
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
}
