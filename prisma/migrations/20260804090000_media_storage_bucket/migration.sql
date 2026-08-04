-- =============================================================================
-- 0023 · Media storage bucket and its policies — ADR-0013
-- =============================================================================
--
-- Supabase Storage is Postgres underneath: buckets are rows in
-- `storage.buckets` and object access is RLS on `storage.objects`. That is
-- the reason for choosing it over Cloudinary (ADR-0013) — media access
-- control is written in the same language as every other policy in this
-- schema, rather than being a second authorisation system maintained by
-- hand alongside the first.
--
-- Created here rather than by clicking in the dashboard so a fresh
-- environment comes up complete. Idempotent, so re-running is safe.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  -- PUBLIC READ. These are catalogue images destined for a public
  -- storefront and served through a CDN; signing every product photo would
  -- add a round trip per image and defeat caching, to protect something
  -- that is published by definition. Private uploads (the tile finder's
  -- source photos, generated PDFs, trade documents) belong in the separate
  -- `upload` table's bucket and are NOT covered by this.
  true,
  -- 25 MB, matching MAX_BYTES in src/infrastructure/media/upload.ts. Two
  -- places, deliberately: the app's check gives a good error message, this
  -- one is the guarantee — a caller with the service key still cannot
  -- exceed it.
  26214400,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ── Object policies ─────────────────────────────────────────────────────────
--
-- NOTE: the `media_public_read` SELECT policy created below was a MISTAKE and
-- is dropped again by migration 0024. A `public = true` bucket is served
-- without consulting RLS, so the policy granted nothing needed and did grant
-- listing. Left in place rather than rewritten because migrations are a
-- history, not a current-state document — see 0024 for the reasoning.
--
-- WRITES ARE CLOSED TO EVERYONE. Uploads go through the service-role client
-- (src/infrastructure/auth/supabase-admin.ts), which bypasses RLS, and every
-- caller of it has already passed `requirePermission('media.manage')` in the
-- application layer. Granting `authenticated` an INSERT policy here would
-- create a second, weaker path to the same bucket: a signed-in customer —
-- `authenticated` includes every storefront account — could write objects
-- without ever touching a permission check.

DROP POLICY IF EXISTS "media_public_read" ON storage.objects;
CREATE POLICY "media_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'media');

-- Named and empty on purpose: these make the intent explicit and stop a
-- later migration from assuming write access was simply forgotten.
DROP POLICY IF EXISTS "media_no_client_insert" ON storage.objects;
DROP POLICY IF EXISTS "media_no_client_update" ON storage.objects;
DROP POLICY IF EXISTS "media_no_client_delete" ON storage.objects;
