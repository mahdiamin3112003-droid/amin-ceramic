-- =============================================================================
-- 0032 · quote_request — owner UPDATE (fixes another real gap)
-- =============================================================================
--
-- Found the same way as the DELETE-grant gap: testing Phase 2's basket
-- repository against the real app_runtime role. quote_request had
-- owner INSERT + SELECT and staff-only UPDATE — meaning the visitor who
-- owns a draft could never update it themselves. That blocks the basket's
-- entire normal lifecycle: recomputing subtotal/weight after every item
-- add/remove, and the visitor's own act of submitting the quote (draft →
-- submitted) — both are UPDATEs on quote_request, and both are things the
-- owning visitor does, not staff.
--
-- Fix: an owner-UPDATE policy, scoped to rows still in `draft` (qual) —
-- once a quote leaves draft, only staff can touch it (the existing
-- quote_request_staff_update policy already covers that) — and the
-- with_check keeps the visitor from reassigning the row to someone else or
-- jumping straight to a staff-only status; `submitted` is the one
-- self-transition a visitor's own submission action needs.

CREATE POLICY "quote_request_owner_update" ON "quote_request"
  FOR UPDATE
  USING (
    "tenant_id" = app.tenant_id()
    AND "visitor_id" = app.visitor_id()
    AND "status" = 'draft'
  )
  WITH CHECK (
    "tenant_id" = app.tenant_id()
    AND "visitor_id" = app.visitor_id()
    AND "status" IN ('draft', 'submitted')
  );
