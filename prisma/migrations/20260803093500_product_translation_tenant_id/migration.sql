-- product_translation needs its own tenant_id: CLAUDE.md requires tenant_id
-- leading every composite index and every uniqueness constraint tenant-scoped,
-- and the slug-uniqueness index in the next migration can't get there via a
-- join to product. Denormalised by trigger in the following migration.
--
-- (The `product.color_lab` DROP/ADD and the `app_user` RenameIndex that
-- `prisma migrate diff` also emitted here are the same recurring diff
-- artifacts excluded from every prior migration in this project — no-ops
-- against the live schema, not real changes.)

ALTER TABLE "product_translation" ADD COLUMN "tenant_id" UUID NOT NULL;
