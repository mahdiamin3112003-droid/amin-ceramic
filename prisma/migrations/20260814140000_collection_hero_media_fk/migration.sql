-- `collection.hero_media_id` gets the foreign key it never had.
--
-- ── The bug this closes ──
-- `product.primary_media_id` has had `product_primary_media_id_fkey` since
-- the catalog tables were created. The equivalent column on `collection` was
-- declared as a bare UUID with no constraint, so Postgres accepted any value
-- at all. The admin form asks an operator to PASTE a media id, and Zod only
-- checked that the string was UUID-SHAPED, never that it referenced a real
-- row. Nothing between the textbox and the disk could tell a real asset id
-- from any other UUID.
--
-- It failed exactly as you would expect: a collection was saved with the
-- TENANT id in `hero_media_id`, copied from a storage URL — media objects are
-- stored at `{tenant_id}/{hash}.webp`, so the first UUID visible in any image
-- URL is the tenant, and the asset id never appears in the path at all. The
-- save reported success, the value was meaningless, and the hero silently
-- rendered as nothing.
--
-- The FK makes that class of mistake a rejected write instead of silent
-- corruption. ON DELETE SET NULL matches `product.primary_media_id`: deleting
-- an asset should clear the reference, never cascade into deleting the
-- collection that used it.

-- ── Clear dangling references first ───────────────────────────────────────
-- The constraint cannot be added while any row violates it. These values are
-- not recoverable data — a hero_media_id that matches no media_asset never
-- pointed at an image — so nulling them loses nothing. Reported rather than
-- done silently, because "the migration quietly edited my rows" is its own
-- kind of surprise.
DO $$
DECLARE
  dangling bigint;
BEGIN
  SELECT count(*) INTO dangling
  FROM collection c
  WHERE c.hero_media_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM media_asset m WHERE m.id = c.hero_media_id);

  IF dangling > 0 THEN
    RAISE NOTICE 'Clearing % collection hero_media_id value(s) that reference no media_asset row.', dangling;

    UPDATE collection c
    SET hero_media_id = NULL
    WHERE c.hero_media_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM media_asset m WHERE m.id = c.hero_media_id);
  END IF;
END $$;

-- ── The constraint ────────────────────────────────────────────────────────
ALTER TABLE "collection"
  ADD CONSTRAINT "collection_hero_media_id_fkey"
  FOREIGN KEY ("hero_media_id") REFERENCES "media_asset"("id")
  ON DELETE SET NULL;

-- FK-covering index, single-column, for the same reason as the set in
-- docs/adr/0018: Postgres only uses an index for a foreign-key constraint
-- check when the FK column LEADS it, so the existing (tenant_id, …)
-- composites do not cover this one. Cheap now, and this is the column
-- `ON DELETE SET NULL` has to scan whenever a media asset is removed.
CREATE INDEX "collection_hero_media_id_idx" ON "collection" ("hero_media_id");
