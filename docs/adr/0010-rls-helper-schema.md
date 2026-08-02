# 0010 · RLS helpers live in `app`, not `auth`

**Status:** accepted · Phase 0

## What the document says

`docs/03-database-design.md` §16.2:

> `auth.tenant_id()`, `auth.permissions()`, `auth.visitor_id()` and
> `auth.app_user_id()` are `STABLE` SQL functions reading the JWT claims
> populated by the Auth Hook. They are `STABLE`, not `VOLATILE`, so the planner
> evaluates them once per query rather than per row — the difference between an
> index scan and a sequential scan on a large table.

## The problem

The `auth` schema on Supabase is owned by `supabase_auth_admin` and managed by
the platform. Supabase's own guidance is explicit that user objects should not be
created there: its contents can be replaced during a platform upgrade. If that
happened, every policy predicate in the system would lose its function and
either error or — worse, depending on how the policy is written — stop filtering.

## Decision

Same functions, same signatures, same `STABLE` volatility, in a schema we own:

- `app.jwt_claims()`
- `app.tenant_id()`
- `app.app_user_id()`
- `app.visitor_id()`
- `app.has_permission(text)`

The performance reasoning in §16.2 is untouched; `STABLE` is what makes it work,
not the schema name.

## Consequences

Every policy written from Phase 1 onward reads `app.tenant_id()` rather than
`auth.tenant_id()`. That is a find-and-replace against the document, and it is
worth doing once now rather than discovering it across eighty tables later.

The Auth Hook that populates the claims (§2.7) still lands in Phase 4. Until
then the helpers return `NULL` when no JWT is present, which makes every policy
deny by default — the correct failure direction. Server-side jobs and migrations
connect as a `BYPASSRLS` role, so seeding and development are unaffected.
