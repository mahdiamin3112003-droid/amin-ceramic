# 0012 · No `token_revocation` table, and no Redis mirror

**Status:** accepted · Phase 4

## What `docs/04` specifies

§4.5, verbatim in substance: permissions live in a 1-hour token, so a revoked
admin would otherwise retain access for up to an hour. On any role or status
change we write `token_revocation(app_user_id, revoked_at)` and mirror it to
Redis; middleware checks the mirror on every admin request and forces a token
refresh when the mirror is newer than the token's `iat`.

The Phase 4 plan accordingly proposed a `token_revocation` table checked
directly in the use-case wrapper, since Upstash is not provisioned — Redis
demoted to a later optimisation.

## Why neither is being built

**The premise does not hold in this implementation.** Permissions never enter
a token here.

`src/infrastructure/auth/staff-session.ts` resolves the permission union by
reading `app_user` → `user_role` → `role_permission` **from the database, on
every request**. The Supabase access token is used for one thing only:
answering "which `auth.users.id` is this?", via `getUser()`, which
revalidates against Supabase rather than trusting the cookie. Authority comes
entirely from the `AppUser` row and its roles, which are read fresh each time.

The consequences of that, all of them verified rather than assumed:

| Change                       | Latency until effective                                        |
| ---------------------------- | -------------------------------------------------------------- |
| Role granted or removed      | Next request — the join is re-read                             |
| User suspended (`status`)    | Next request — `status !== "active"` returns no session at all |
| User soft-deleted            | Next request — `deletedAt !== null` returns no session         |
| Permission removed from role | Next request — the union is recomputed                         |

Revocation is immediate **by construction**. There is no window to close, so
there is nothing for a revocation list to record and nothing for middleware to
check. Adding the table would mean writing rows nobody reads, and adding the
Redis mirror would mean caching them.

The doc's design is the correct one for the architecture it assumed — a
stateless JWT carrying permission claims, which is the usual Supabase pattern
and what §4.4 originally leaned toward. This implementation took the other
branch (flatten per request, hand the union to Postgres as a transaction-local
claim) for a different reason: it lets RLS answer `app.has_permission()`
without a three-table join per row. Immediate revocation is a consequence of
that choice, not a separate feature.

## What we pay for it

One extra database round trip per staff request, deduped within a render by
React `cache()`. Admin traffic is tens of requests per minute, against a
tenant with a handful of staff. That is the right trade at this size, and it
buys correctness that the token design has to work to recover.

## When to revisit

If staff traffic ever grows enough that the per-request permission read
matters, the move is to cache the union in Redis keyed by `app_user_id` with a
short TTL — **and at that moment §4.5's revocation list becomes necessary
again**, because a cache reintroduces exactly the staleness window the token
design had. This ADR is not "the doc was wrong"; it is "the doc's problem does
not exist yet." Do not delete the section from `docs/04`.

## Related

- `src/infrastructure/auth/staff-session.ts` — where the union is resolved
- `src/infrastructure/db/request-context.ts` — where it becomes an RLS claim
- [0010](0010-rls-helper-schema.md) — the `app.has_permission()` helper this feeds
