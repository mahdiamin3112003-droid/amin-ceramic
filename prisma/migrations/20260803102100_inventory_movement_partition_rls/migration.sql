-- =============================================================================
-- 0018 · inventory_movement partitions — enable RLS
-- =============================================================================
--
-- Real gap caught by get_advisors after the partitioning migration: enabling
-- RLS on the partitioned parent does not enable it on the individual
-- partition tables, and PostgREST exposes every table in `public`, including
-- partitions, by name. A client could query `inventory_movement_2026_08`
-- directly and bypass the parent's policies entirely.
--
-- No policies are added on the partitions themselves — the app only ever
-- queries the `inventory_movement` parent (which carries the real policies
-- and pushes them down to whichever partition a row lives in). Enabling RLS
-- on a partition with zero policies denies all direct access to it, which is
-- exactly the correct default: nobody should reach a partition by name.

ALTER TABLE "inventory_movement_2026_08" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movement_2026_08" FORCE ROW LEVEL SECURITY;

ALTER TABLE "inventory_movement_2026_09" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movement_2026_09" FORCE ROW LEVEL SECURITY;

ALTER TABLE "inventory_movement_2026_10" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movement_2026_10" FORCE ROW LEVEL SECURITY;

ALTER TABLE "inventory_movement_default" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movement_default" FORCE ROW LEVEL SECURITY;
