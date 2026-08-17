import { cache } from "react";

import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";

import { findActiveTenant } from "@/infrastructure/db/repositories/tenant-repository";
import { getStaffSession } from "@/infrastructure/auth/staff-session";
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
/**
 * The transaction handle `withRequestContext` hands to its callback.
 *
 * Exported as a named alias so application code can annotate it without
 * importing `@prisma/client` directly, which the layer rule forbids.
 *
 * This is not a loophole in that rule. What the rule protects against is
 * Prisma MODEL types — `Product`, `AppUser` — escaping infrastructure and
 * becoming the shape the rest of the app thinks in; repositories map to
 * domain types precisely so that cannot happen. A transaction handle is not
 * a model, it is the capability to run a scoped query, and it already flows
 * through every application-layer use-case by inference (see
 * `use-cases/quote/basket-mutations.ts`). Naming it here makes that visible
 * rather than leaving it to an inferred type nobody can grep for.
 */
export type RequestTransaction = Prisma.TransactionClient;

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
      /**
       * Two settings, one round trip, both transaction-local.
       *
       * The claims are what every RLS policy reads. The search_path is what
       * lets pgvector's `halfvec` type and `<=>` operator resolve at all:
       * the extension lives in the `extensions` schema (ADR-0011), and
       * `app_runtime` connects with the default `"$user", public`.
       *
       * `ALTER ROLE app_runtime SET search_path` was the obvious fix and it
       * does NOT work here — verified directly: through Supabase's
       * transaction-mode pooler the connection still reported
       * `"$user", public` and `halfvec` stayed unresolvable. Role defaults
       * are applied when a server connection starts, which the pooler owns
       * and reuses. Setting it per transaction is the only version that is
       * true for every connection this code actually gets.
       *
       * Nothing caught it earlier because the only vector queries so far ran
       * from `backfill-embeddings.ts` as the `postgres` superuser, whose
       * search_path already includes `extensions` — a script proving nothing
       * about the role a request runs as. `public` stays first so
       * application tables win any name collision.
       */
      await tx.$executeRaw`
        SELECT set_config('request.jwt.claims', ${jwtClaims}, true),
               set_config('search_path', 'public, extensions', true)
      `;
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
  /** Null for anonymous visitors; set when a staff member is signed in. */
  readonly appUserId: string | null;
  /** Flattened permission union. Empty for visitors, and empty for staff who owe TOTP. */
  readonly permissions: readonly string[];
}

/**
 * Resolve the current request's tenant, visitor, and — since Phase 4 —
 * signed-in staff member from the `ac_vid` cookie middleware set
 * (src/middleware.ts, docs/04-api-architecture.md §4.2) plus the Supabase
 * Auth session.
 *
 * Staff resolution is FAIL-OPEN-AS-ANONYMOUS by design: if the auth lookup
 * throws (Supabase unreachable, no staff record), the request continues as
 * an ordinary visitor with no permissions rather than erroring. A broken
 * auth service must not take the public catalogue down — and because
 * permissions default to `[]`, the failure mode is "can see less", never
 * "can see more".
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

  let staff: Awaited<ReturnType<typeof getStaffSession>> = null;
  try {
    staff = await getStaffSession();
  } catch (cause) {
    console.error(
      "[auth] staff session resolution failed; continuing anonymous",
      cause,
    );
  }

  return {
    tenantId: tenant.id,
    visitorId,
    appUserId: staff?.appUserId ?? null,
    permissions: staff?.permissions ?? [],
  };
});
