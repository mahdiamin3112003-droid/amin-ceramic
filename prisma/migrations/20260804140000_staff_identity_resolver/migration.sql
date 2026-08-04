-- =============================================================================
-- 0025 · app.resolve_staff_identity() — break the sign-in chicken-and-egg
-- =============================================================================
--
-- THE BUG THIS FIXES: sign-in could never succeed. Caught by the first run of
-- the end-to-end suite; invisible to typecheck, lint and every unit test.
--
-- `getStaffSession()` resolves who is signed in by reading `app_user` keyed on
-- the Supabase-verified `auth_user_id`. It does that through the ordinary
-- runtime connection, which is the `app_runtime` role — and `app_runtime` is
-- RLS-constrained, by design (migration 0012, the whole point of that role).
--
-- But `app_user_self_read` reads:
--
--     tenant_id = app.tenant_id()
--     AND (id = app.app_user_id() OR app.has_permission('user.manage'))
--
-- Every one of those claims is NULL at that moment, because the read IS what
-- populates them. RLS fails closed, the query returns zero rows,
-- `getStaffSession()` returns null, and the sign-in action reports "Those
-- details didn't work" for a perfectly valid password. A textbook
-- bootstrapping deadlock: the query needs the identity it exists to establish.
--
-- ── Why a SECURITY DEFINER function rather than the alternatives ──
--
-- Reading through the superuser connection would work and is what most
-- codebases reach for. It is rejected here because it puts an RLS-bypassing
-- client inside the request path, one careless import away from becoming the
-- way other things get read too. The `app_runtime` role exists precisely so
-- that no such client exists at runtime.
--
-- Adding an `auth_user_id`-based RLS policy was also considered. It cannot
-- work: policies authorise against claims, and there is no claim to authorise
-- against until this read completes.
--
-- So: exactly one function, with a narrow signature, that escalates for
-- exactly one purpose. It takes the verified `auth.users.id` and returns that
-- user's identity and flattened permission union — nothing else, no arbitrary
-- predicate, no way to enumerate. It is `STABLE`, so it cannot write.
--
-- The permission flattening moves here too, which is a bonus rather than the
-- goal: one round trip instead of a four-table Prisma include, on a query that
-- runs before every staff request.

CREATE OR REPLACE FUNCTION app.resolve_staff_identity(p_auth_user_id uuid)
RETURNS TABLE (
  app_user_id uuid,
  tenant_id   uuid,
  email       text,
  full_name   text,
  role_keys   text[],
  permissions text[]
)
LANGUAGE sql
SECURITY DEFINER
-- Empty search_path, per ADR-0011 and the 0005 hardening pass: a SECURITY
-- DEFINER function with a mutable search_path is a privilege-escalation
-- vector. Every identifier below is therefore schema-qualified.
SET search_path = ''
STABLE
AS $$
  SELECT
    u.id,
    u.tenant_id,
    u.email::text,
    u.full_name,
    COALESCE(
      ARRAY_AGG(DISTINCT r.key) FILTER (WHERE r.key IS NOT NULL),
      '{}'::text[]
    ),
    COALESCE(
      ARRAY_AGG(DISTINCT rp.permission_key) FILTER (WHERE rp.permission_key IS NOT NULL),
      '{}'::text[]
    )
  FROM public.app_user AS u
  LEFT JOIN public.user_role      AS ur ON ur.app_user_id = u.id
  LEFT JOIN public.role           AS r  ON r.id  = ur.role_id
  LEFT JOIN public.role_permission AS rp ON rp.role_id = r.id
  WHERE u.auth_user_id = p_auth_user_id
    -- Suspension and soft-deletion are enforced HERE, not in application
    -- code, so there is no version of this that forgets to check them.
    AND u.deleted_at IS NULL
    AND u.status = 'active'
  GROUP BY u.id, u.tenant_id, u.email, u.full_name;
$$;


-- ── Who may call it ─────────────────────────────────────────────────────────
--
-- Only `app_runtime`. This is the important half of the migration.
--
-- PostgREST exposes anything executable by `anon` or `authenticated` at
-- /rest/v1/rpc/. Left executable, a signed-in customer — `authenticated`
-- includes every storefront account — could pass someone else's auth uuid and
-- read back their roles and permissions. `get_advisors` flags exactly this
-- pattern (0028/0029), and Phase 2 already carries two such findings.
--
-- REVOKE FROM PUBLIC first: PostgreSQL grants EXECUTE to PUBLIC on every new
-- function by default, so revoking from the individual roles alone would
-- leave the grant intact through PUBLIC.

REVOKE ALL ON FUNCTION app.resolve_staff_identity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_staff_identity(uuid) FROM anon;
REVOKE ALL ON FUNCTION app.resolve_staff_identity(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION app.resolve_staff_identity(uuid) TO app_runtime;
