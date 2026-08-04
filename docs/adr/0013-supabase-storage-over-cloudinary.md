# 0013 · Supabase Storage for media, not Cloudinary

**Status:** accepted · Phase 4

## What `docs/01` specifies

§5.1 selects Cloudinary for media: named transformation presets, automatic
format negotiation (AVIF/WebP), on-the-fly derivatives from a single upload,
and a CDN in front of all of it.

## Decision

Media goes to **Supabase Storage**, in a bucket per environment, with
derivative sizes generated **at upload time** rather than on demand.

## Why

Supabase is already provisioned, already holds the database, and already
issues the auth tokens this platform runs on. Cloudinary would add a second
vendor, a second set of credentials, a second failure mode and a second bill
for a v1 catalogue in the low thousands of images. The integration surface
that saves is not trivial: signed uploads, webhook reconciliation between
Cloudinary's asset ids and our `media_asset` rows, and a separate
purge/invalidations story.

Supabase Storage also gets us the thing that actually matters for
authorisation: **objects live behind the same RLS-bearing Postgres**, so a
media policy is written the same way every other policy in this schema is
written, against `app.has_permission()`. With Cloudinary, access control
would be a signed-URL scheme maintained independently of the permission model
— a second authorisation system, which §5.1 of `docs/04` explicitly warns
against.

## What we give up, stated plainly

Supabase's image transformation is **weaker than Cloudinary's**. It resizes
and re-encodes; it has no named presets, no `q_auto` quality heuristic, no
art-directed cropping, and no automatic format negotiation per request.

So we do not rely on it. Derivatives are generated **once, at upload**, in a
fixed ladder, and stored as their own objects:

- the ladder is declared in code, not in URLs, so a size cannot be requested
  that was never generated
- AVIF/WebP negotiation is handled by `next/image` at render, which was
  already in the stack
- focal point and per-locale alt text live on `media_asset` (Phase 1 schema,
  unchanged), so art direction is our data rather than a vendor's URL grammar

The cost of that is storage — several encodings per asset instead of one
original — which at this catalogue size is measured in gigabytes and dollars,
and reprocessing if the ladder ever changes. Both are acceptable; neither is
reversible-only-with-pain.

## A trap found while implementing this

The bucket is `public = true`. Migration 0023 also added a broad SELECT
policy on `storage.objects`, on the assumption that a public bucket needs one
to be readable. **It does not** — `public = true` means
`/storage/v1/object/public/<bucket>/<path>` is served without consulting RLS
at all.

The policy therefore granted nothing needed, and one thing that was not:
`LIST`. Any anonymous client could enumerate the entire bucket. Paths are
content-addressed so no filenames leak, but the complete SET does — including
imagery already attached to products still in `draft`. Publishing a product is
supposed to be the moment its imagery becomes public.

Caught by `get_advisors` immediately after the migration
(`public_bucket_allows_listing`), and dropped again in migration 0024. Worth
recording because "public bucket needs a public read policy" is a natural
assumption and a wrong one, and because it is the second time the advisors
have caught a storage/grants mistake that no amount of local testing would
have surfaced — see [0011](0011-supabase-grants-and-hardening.md).

## When this would be wrong

If the catalogue reaches a scale where on-the-fly derivatives genuinely beat
a pregenerated ladder (tens of thousands of assets, many crops each), or if
art-directed per-breakpoint cropping becomes a real editorial requirement
rather than a nice-to-have. Because the ladder is declared in code and the
canonical original is always retained, moving to Cloudinary later is a
backfill job, not a migration — `media_asset` rows keep their meaning either
way.

## Related

- `prisma/media.prisma` — `media_asset`, unchanged by this decision
- [0011](0011-supabase-grants-and-hardening.md) — grants that storage policies inherit
