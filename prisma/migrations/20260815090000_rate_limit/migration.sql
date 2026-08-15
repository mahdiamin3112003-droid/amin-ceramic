-- Rate limiting for public AI endpoints — docs/01-architecture.md §6.6.
--
-- ── Why a table and not Upstash ──
-- §6.6 specifies "Per-IP and per-session rate limits on all AI endpoints
-- (Upstash)". Upstash is not provisioned, and the Tile Finder is the first
-- public endpoint in this application that spends real money per request:
-- an unthrottled loop against it bills Replicate, OpenAI and Gemini until a
-- budget ceiling trips. Shipping it with no limit at all is not an option,
-- so the limit lives where the rest of this application's state already
-- lives.
--
-- This is the same reasoning ADR-0012 used to drop the Redis mirror of
-- token_revocation: one indexed lookup against Postgres, at volumes far
-- below where a dedicated store earns its operational cost. Recorded in
-- docs/adr/0020.
--
-- ── Fixed window, not sliding ──
-- A fixed window can admit up to 2x the limit across a boundary. That is
-- accepted deliberately: the purpose here is to stop runaway spend and
-- casual abuse, not to enforce a precise quota, and a fixed window is one
-- UPSERT where a sliding log is a row per request plus a periodic sweep.

CREATE TABLE "rate_limit" (
    "tenant_id"    UUID        NOT NULL,
    -- Opaque, already-hashed identity — see `bucketFor` in the application
    -- layer. Never a raw IP address.
    "bucket"       TEXT        NOT NULL,
    -- Start of the fixed window, truncated by the application.
    "window_start" TIMESTAMPTZ NOT NULL,
    "count"        INTEGER     NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("tenant_id", "bucket", "window_start"),
    CONSTRAINT "rate_limit_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenant"("id") ON DELETE CASCADE
);

-- Sweeping expired windows: the only query that is not a PK hit.
CREATE INDEX "rate_limit_window_start_idx" ON "rate_limit" ("window_start");

-- ── RLS ───────────────────────────────────────────────────────────────────
-- FORCE, and NO policy, on purpose. Every other tenant-scoped table grants
-- the app_runtime role access through a policy keyed on request claims.
-- This table must be readable and writable BEFORE a request is trusted —
-- it is the thing that decides whether to trust it — and it holds no
-- customer data worth exposing. It is therefore reached only through the
-- SECURITY DEFINER function below, and direct access stays denied.
ALTER TABLE "rate_limit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limit" FORCE ROW LEVEL SECURITY;

/**
 * Consume one unit from a window, returning the running count.
 *
 * SECURITY DEFINER so it can write a table with no RLS policy, and pinned
 * to an empty search_path — the hardening ADR-0011 applied to every other
 * function here after the advisor flagged mutable search paths.
 *
 * Atomic by construction: the UPSERT increments under the primary key, so
 * concurrent requests cannot both read a stale count and each decide they
 * are under the limit.
 */
CREATE OR REPLACE FUNCTION app.consume_rate_limit(
    p_tenant_id    UUID,
    p_bucket       TEXT,
    p_window_start TIMESTAMPTZ
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    new_count INTEGER;
BEGIN
    INSERT INTO public.rate_limit AS rl (tenant_id, bucket, window_start, count)
    VALUES (p_tenant_id, p_bucket, p_window_start, 1)
    ON CONFLICT (tenant_id, bucket, window_start)
    DO UPDATE SET count = rl.count + 1
    RETURNING rl.count INTO new_count;

    RETURN new_count;
END;
$$;

-- REVOKE FROM PUBLIC first, then the Supabase roles explicitly — the same
-- order 20260804140000_staff_identity_resolver uses, because PostgreSQL
-- grants EXECUTE to PUBLIC on every new function and PostgREST exposes
-- anon/authenticated directly.
REVOKE ALL ON FUNCTION app.consume_rate_limit(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.consume_rate_limit(UUID, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION app.consume_rate_limit(UUID, TEXT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.consume_rate_limit(UUID, TEXT, TIMESTAMPTZ) TO app_runtime;

/**
 * Sweep windows that can no longer be consulted.
 *
 * Without this the table grows one row per bucket per window forever. Run
 * by pg_cron hourly; the retention is generous relative to any window this
 * application uses, so a sweep can never delete a window still in play.
 */
CREATE OR REPLACE FUNCTION app.sweep_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    removed INTEGER;
BEGIN
    DELETE FROM public.rate_limit
    WHERE window_start < now() - INTERVAL '1 day';
    GET DIAGNOSTICS removed = ROW_COUNT;
    RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION app.sweep_rate_limits() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.sweep_rate_limits() FROM anon;
REVOKE ALL ON FUNCTION app.sweep_rate_limits() FROM authenticated;

-- Idempotent: pg_cron (>= 1.4; this project runs 1.6.4) replaces a job
-- reusing an existing name rather than erroring, so re-applying this
-- migration against a database that already has it is safe.
SELECT cron.schedule(
    'sweep-rate-limits',
    '7 * * * *',
    $$SELECT app.sweep_rate_limits()$$
);
