-- Write policies for the tables the Tile Finder actually writes.
--
-- ── The gap ──
-- Phase 1 gave these tables RLS policies for READING: staff read the cost
-- log with `ai.costs.read`, a visitor reads their own finder results. Nobody
-- wrote INSERT policies, because at the time nothing inserted — the only
-- writer was `backfill-embeddings.ts`, which runs as the postgres superuser
-- through DIRECT_URL and is therefore not subject to RLS at all.
--
-- The first real request through the web app found it immediately:
--
--   new row violates row-level security policy for table "ai_interaction"
--
-- Request-time code runs as `app_runtime`, a role RLS genuinely constrains
-- (that is the whole point of RUNTIME_DATABASE_URL). So the finder could
-- call three paid APIs successfully and then fail to record that it had.
--
-- ── The one that would NOT have thrown ──
-- `finder_result` had SELECT and UPDATE but no DELETE. `persistResults`
-- clears prior rows before writing a new ranking, and under RLS a DELETE
-- with no matching policy removes ZERO rows without error. Re-running a
-- match would silently have appended a second ranking beside the first,
-- leaving the results page showing each product twice. A missing INSERT
-- policy is loud; a missing DELETE policy is not.

-- ── ai_interaction ────────────────────────────────────────────────────────
-- Append-only telemetry. The tenant scope is the whole check: the
-- application layer decides what to record, and RLS is the backstop that
-- stops a row being written against someone else's tenant (docs/03 §19 —
-- "authorisation belongs in the application; RLS is the last line").
--
-- No UPDATE or DELETE policy, deliberately. Cost attribution that can be
-- rewritten after the fact is not attribution, and nothing in the
-- application has any reason to amend a recorded call.
CREATE POLICY "ai_interaction_insert" ON "ai_interaction"
  FOR INSERT WITH CHECK (tenant_id = app.tenant_id());

-- ── finder_result ─────────────────────────────────────────────────────────
-- Scoped through the parent session, mirroring the existing SELECT and
-- UPDATE policies exactly rather than inventing a looser rule: a row may be
-- written or removed only for a session belonging to this tenant AND this
-- visitor.
CREATE POLICY "finder_result_owner_insert" ON "finder_result"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM finder_session fs
      WHERE fs.id = finder_result.finder_session_id
        AND fs.tenant_id = app.tenant_id()
        AND fs.visitor_id = app.visitor_id()
    )
  );

CREATE POLICY "finder_result_owner_delete" ON "finder_result"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM finder_session fs
      WHERE fs.id = finder_result.finder_session_id
        AND fs.tenant_id = app.tenant_id()
        AND fs.visitor_id = app.visitor_id()
    )
  );
