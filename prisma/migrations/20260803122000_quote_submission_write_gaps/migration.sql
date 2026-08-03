-- =============================================================================
-- 0033 · quote_status_history + outbox_event — owner/tenant INSERT
-- =============================================================================
--
-- Two more gaps in the same family as the quote_request owner-update fix,
-- found the same way (testing the real submission flow end-to-end):
--
-- 1. quote_status_history only had a staff INSERT policy. A visitor
--    submitting their own quote (draft → submitted) writes the first status-
--    history row as part of that same action — that's the visitor's own
--    write, not staff's. Fixed with the same "owner OR staff" shape already
--    used by quote_request_zone_write/quote_request_item_write.
--
-- 2. outbox_event had NO insert policy at all. Its constraints migration
--    assumed writes would come from "the server-side service role, which
--    bypasses RLS" — true for a PostgREST-fronted app, where service_role
--    genuinely has BYPASSRLS. This app talks to Postgres directly through
--    Prisma as a single app_runtime role for every request context, visitor
--    and staff alike, so that assumption doesn't hold here: there is no
--    separate bypass path, and the transactional-outbox pattern's whole
--    point (§11.2 — the event is written in the same transaction as the
--    business change) requires the visitor's own submission to write it.
--    outbox_event's actual confidentiality boundary is already the SELECT
--    side (staff-only, unchanged) — an insert merely records that a tenant-
--    scoped action happened, which is what every request in this schema is
--    already trusted to do for its own tenant.

CREATE POLICY "quote_status_history_owner_insert" ON "quote_status_history"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "quote_request" qr
      WHERE qr."id" = "quote_status_history"."quote_request_id"
        AND qr."tenant_id" = app.tenant_id()
        AND (qr."visitor_id" = app.visitor_id() OR app.has_permission('request.respond'))
    )
  );

CREATE POLICY "outbox_event_tenant_insert" ON "outbox_event"
  FOR INSERT
  WITH CHECK ("tenant_id" = app.tenant_id());
