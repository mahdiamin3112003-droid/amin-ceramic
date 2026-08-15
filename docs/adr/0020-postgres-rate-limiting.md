# 0020 · Rate limiting lives in Postgres, not Upstash

**Status:** accepted · Phase 6, before the Tile Finder is exposed

## What docs/01 says

§6.6, "Cost & abuse controls":

> Per-IP and per-session rate limits on all AI endpoints (Upstash), stricter
> for image uploads.

## The problem

Upstash is not provisioned, and has not been since it was first listed as a
Phase 2 dependency. Meanwhile the Tile Finder is about to become **the first
public endpoint in this application that spends real money per request** —
one upload fans out to Replicate (visual embedding), OpenAI (semantic
embedding) and Gemini (safety gate + attribute extraction).

Every other public endpoint reads the database. This one bills three
vendors. An unthrottled loop against it runs until a budget ceiling trips,
and shipping it with no limit at all is not a defensible option.

So the choice is not "Upstash or nothing later" — it is "some limit now, or
an unmetered paid endpoint on the public internet".

## Decision

A `rate_limit` table with a fixed window, incremented through a SECURITY
DEFINER function.

This is the same reasoning **ADR-0012** used to drop the Redis mirror of
`token_revocation`: one indexed lookup against a database this application
already talks to, at volumes nowhere near where a dedicated store earns its
operational cost. Adding a second stateful dependency — plus its credentials,
its rotation, and its own failure mode — to count to ten is not warranted.

Upstash remains a drop-in replacement: `consumeRateLimit` is one function
behind which the storage can change.

## The details that matter

**Fixed window, not sliding.** A fixed window admits up to 2× the limit
across a boundary. Accepted deliberately: the job is to bound runaway spend
and casual abuse, not to enforce a precise quota. A fixed window is one
UPSERT; a sliding log is a row per request plus a sweep.

**Atomic by construction.** The increment is `INSERT … ON CONFLICT DO UPDATE
… RETURNING`, under the primary key. Two concurrent requests cannot both
read a stale count and each decide they are under the limit — which a
read-then-write in application code would permit precisely when it matters.

**Identities are HMAC'd, never stored raw.** An IP address is personal data,
and this table counts requests rather than recording who made them. HMAC and
not a bare hash, because a plain SHA-256 of an IP is reversible by hashing
the whole IPv4 space. Reuses `VISITOR_COOKIE_SECRET`, which already guards
visitor identity and is already in the rotation set.

**Two rules, both enforced.** Per-visitor (10/hour) is the useful key, since
it survives NAT where many real customers share one address. Per-IP
(40/hour) is the backstop that actually bounds spend, because a cookie is
trivially discarded. Limiting on IP alone would throttle an office or a
mobile network as though it were a single person.

**FAILS CLOSED.** Most of this codebase fails open — `getRequestContext`
degrades a broken auth lookup to an anonymous visitor, on the grounds that
the failure mode is "sees less". Here the failure mode is "spends without
limit on three paid APIs", so an unavailable limiter stops the request.

**RLS is FORCEd with no policy.** The table must be usable _before_ a request
is trusted — it is what decides whether to trust it — so it cannot authorise
off request claims like every other tenant-scoped table. It holds no customer
data. Direct access is denied to everyone; the SECURITY DEFINER function is
the only door, with an empty `search_path` per ADR-0011.

**pg_cron sweeps it.** Without a sweep the table grows one row per bucket per
window forever. Hourly, retaining a day — generous against any window this
application uses, so a sweep can never delete a window still in play.

## Consequences

- The advisor will report `rate_limit` as "RLS enabled, no policy". That is
  intended, and this file is the answer to "why has nobody fixed this".
- Limits are per-tenant by table key but the deployment is single-tenant, so
  in practice they are global. Correct either way.
- If Tile Finder traffic ever reaches a scale where an UPSERT per request is
  material, that is the signal to revisit Upstash — not before.
