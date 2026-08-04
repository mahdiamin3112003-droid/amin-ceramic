# 0014 · A SECURITY DEFINER function resolves the staff session

**Status:** accepted · Phase 4

## The bug that forced this

Sign-in could never succeed. Not "was flaky", not "failed under load" — the
happy path was unreachable, and had been since the moment staff claims were
wired up. Typecheck, four lint passes, 186 unit tests and a production build
all went green over it.

`getStaffSession()` resolves who is signed in by reading `app_user`, keyed on
the Supabase-verified `auth_user_id`. It did that through the ordinary runtime
connection — the `app_runtime` role, which is RLS-constrained on purpose
([0011](0011-supabase-grants-and-hardening.md), migration 0012). But
`app_user_self_read` authorises like this:

```sql
tenant_id = app.tenant_id()
AND (id = app.app_user_id() OR app.has_permission('user.manage'))
```

Every one of those claims is NULL at that instant, because **this read is what
populates them**. RLS fails closed, the query returns zero rows,
`getStaffSession()` returns null, and the sign-in action reports "Those details
didn't work" for a correct password.

A bootstrapping deadlock: the query needs the identity it exists to establish.
The code even carried a comment asserting the opposite — that a bare read was
safe here "because it resolves the claims". Nobody had checked that claim
against the policy.

## Decision

One `SECURITY DEFINER` function, `app.resolve_staff_identity(uuid)`, executable
only by `app_runtime`. It takes the Supabase-verified `auth.users.id` and
returns that user's id, tenant, email, name, role keys and flattened permission
union. `STABLE`, so it cannot write. `SET search_path = ''`, per the 0011
hardening pass.

## Alternatives, and why not

**Read through the superuser connection.** `DATABASE_URL` is the `postgres`
superuser, which bypasses RLS entirely, so a second Prisma client on it would
work in about four lines. Rejected because it puts an RLS-bypassing client
inside the request path. The `app_runtime` role exists precisely so no such
client exists at runtime; introducing one for a single read leaves it sitting
there, one careless import from becoming how other things get read too.

**An `auth_user_id`-based RLS policy.** Cannot work. Policies authorise against
claims, and there is no claim to authorise against until this read completes.
Adding an `auth_user_id` claim would mean trusting a value supplied before
anything has verified it — which is the whole problem inverted.

**Make `app_user` publicly readable, like `tenant`.** `tenant`'s SELECT policy
is public because a tenant row holds nothing sensitive. `app_user` holds every
staff member's email and status. No.

## What this costs

A privilege escalation exists in the schema. That is a real cost and worth
stating plainly. It is bounded by:

- **one function**, with a fixed signature — no arbitrary predicate, no way to
  enumerate, no way to widen the result
- **one caller role** — `EXECUTE` revoked from `PUBLIC`, `anon` and
  `authenticated`. PostgreSQL grants `EXECUTE` to `PUBLIC` on every new
  function by default, so revoking from the named roles alone would have left
  the grant intact through `PUBLIC`; PostgREST would then have exposed it at
  `/rest/v1/rpc/` to any signed-in storefront customer. Verified with
  `has_function_privilege` and confirmed absent from `get_advisors`.
- **`STABLE`** — it cannot mutate anything.

Suspension and soft-deletion are filtered in the function body rather than in
TypeScript, so there is no version of the caller that forgets to check them.

## Why the e2e suite is the real fix

The function closes the hole. What stops the next one is that
`e2e/auth-flow.spec.ts` now signs a real account in through a real browser on
every run. This class of bug — correct types, correct lint, correct unit tests,
impossible at runtime — is invisible to everything except actually doing it.

The same run also caught auth cookies being neither `httpOnly` nor `secure`
(see `src/infrastructure/auth/cookie-policy.ts`), which `docs/04` §4.6 forbids
and which another comment wrongly claimed was already handled.

## Related

- `prisma/migrations/20260804140000_staff_identity_resolver/migration.sql`
- `src/infrastructure/auth/staff-session.ts` — the only caller
- [0010](0010-rls-helper-schema.md) — why `app` rather than `auth`
- [0011](0011-supabase-grants-and-hardening.md) — `search_path` hardening
