import { cache } from "react";

import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";

import { findActiveTenant } from "@/infrastructure/db/repositories/tenant-repository";
import { prisma } from "@/infrastructure/db/client";
import { VISITOR_COOKIE_NAME, verifyVisitorCookie } from "@/lib/visitor/cookie";

/**
 * Per-request RLS context.
 *
 * docs/03-database-design.md §16: every policy in this schema reads
 * `tenant_id`/`visitor_id`/`app_user_id`/`permissions` off
 * `request.jwt.claims` via the `app.*` helper functions — the same
 * mechanism PostgREST uses, reimplemented here because the app talks to
 * Postgres directly through Prisma, not through PostgREST.
 *
 * `set_config(..., true)` is transaction-local (`SET LOCAL`): it cannot leak
 * onto a pooled connection's next transaction, which matters because
 * `RUNTIME_DATABASE_URL` is a pgbouncer transaction-mode pool
 * (`connection_limit=1`) shared across requests.
 */
export interface RequestClaims {
  readonly tenantId: string;
  readonly visitorId?: string | null;
  readonly appUserId?: string | null;
  /** Flattened permission keys, e.g. from role_permission. Staff only. */
  readonly permissions?: readonly string[];
}

/**
 * Run `fn` inside a transaction with RLS claims set for its duration.
 *
 * Every repository function that reads or writes tenant-scoped data must go
 * through this — calling a bare `prisma.*` query outside it will see
 * `app.tenant_id()` etc. resolve to NULL, and every policy in this schema
 * fails closed on NULL (confirmed empirically in Phase 1 verification), so
 * the query will simply return zero rows or reject the write. That's a safe
 * failure mode, but not a useful one — the goal is a helpful error, not a
 * mysteriously empty catalog.
 */
export async function withRequestContext<T>(
  claims: RequestClaims,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const jwtClaims = JSON.stringify({
    tenant_id: claims.tenantId,
    visitor_id: claims.visitorId ?? null,
    app_user_id: claims.appUserId ?? null,
    permissions: claims.permissions ?? [],
  });

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${jwtClaims}, true)`;
      return fn(tx);
    },
    {
      // Prisma's 5s default is tight for a page needing several repository
      // calls (e.g. product detail + similar products + availability) against
      // a remote pooler — 15s gives that headroom without holding a pooled
      // connection open indefinitely.
      timeout: 15_000,

      // How long to WAIT FOR A FREE CONNECTION before giving up. Prisma's
      // 2s default is far too short here: `RUNTIME_DATABASE_URL` is a
      // pgbouncer pool with `connection_limit=1`, so every transaction in a
      // request is serialised behind the others — and Next renders a layout
      // and its page CONCURRENTLY, so a page's reads genuinely do race the
      // layout's (the site header's basket/wishlist counts) for that one
      // connection. Sequencing awaits inside a single file cannot fix that;
      // only letting the loser queue can. Found live: the homepage threw
      // "Unable to start a transaction in the given time" (P2028) on three
      // of its reads at once.
      maxWait: 20_000,
    },
  );
}

export interface RequestContext {
  readonly tenantId: string;
  /** Null when the visitor cookie is absent, unsigned, or its signature fails. */
  readonly visitorId: string | null;
}

/**
 * Resolve the current request's tenant and visitor from the `ac_vid` cookie
 * middleware already set (src/middleware.ts, docs/04-api-architecture.md
 * §4.2). Staff (`appUserId`/`permissions`) join this once auth lands in
 * Phase 4 — Phase 2 is visitor-only.
 *
 * `findActiveTenant` reads through the bare `prisma` client rather than
 * `withRequestContext`: resolving "which tenant is this" is the one read
 * that must happen before any tenant claim exists, so `tenant`'s SELECT
 * policy is intentionally public (migration `..._tenant_public_read`).
 *
 * Throws if no tenant is configured — every other use-case in this app
 * assumes one exists (v1 is single-tenant), so failing loudly here beats
 * every caller re-deriving a null-tenant fallback.
 *
 * Wrapped in React `cache()`: every use-case calls this before its own
 * read, so an uncached version issues one `tenant.findFirst` PER USE-CASE
 * — six on the homepage alone, each competing for the single pooled
 * connection. `cache()` is request-scoped (not a cross-request cache), so
 * this dedupes within one render pass and never leaks one visitor's
 * resolved context into another's request.
 */
export const getRequestContext = cache(async (): Promise<RequestContext> => {
  const tenant = await findActiveTenant();
  if (!tenant) {
    throw new Error("No active tenant configured");
  }

  const secret = process.env.VISITOR_COOKIE_SECRET;
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(VISITOR_COOKIE_NAME)?.value;
  const visitorId = secret ? await verifyVisitorCookie(cookieValue, secret) : null;

  return { tenantId: tenant.id, visitorId };
});
