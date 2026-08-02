-- =============================================================================
-- 0005 · Pin search_path on every function
-- docs/03-database-design.md §16
--
-- Found by the Supabase security advisor after migration 0004: every function
-- from migrations 0001–0003 had a mutable search_path. A function with no
-- pinned search_path resolves unqualified names (types, operators, other
-- functions) against whatever schema is first on the CALLER's search_path at
-- call time — not the schema the function's author intended. A role that can
-- create objects earlier in that path can shadow a built-in and hijack what
-- the function actually calls. This particularly matters for
-- app.has_permission() and friends, since every RLS policy in the system
-- calls them.
--
-- Verified before writing this: none of the eight functions reference
-- anything outside pg_catalog. gen_random_uuid() has been a pg_catalog
-- built-in since Postgres 13 — despite living beside pgcrypto conceptually,
-- it does not require pgcrypto's functions or the `extensions` schema. So
-- `search_path = ''` is safe for all eight; nothing needed re-qualifying.
-- =============================================================================

ALTER FUNCTION public.uuid_generate_v7() SET search_path = '';
ALTER FUNCTION public.set_updated_at() SET search_path = '';
ALTER FUNCTION public.visitor_claim_is_final() SET search_path = '';

ALTER FUNCTION app.jwt_claims() SET search_path = '';
ALTER FUNCTION app.tenant_id() SET search_path = '';
ALTER FUNCTION app.app_user_id() SET search_path = '';
ALTER FUNCTION app.visitor_id() SET search_path = '';
ALTER FUNCTION app.has_permission(text) SET search_path = '';
