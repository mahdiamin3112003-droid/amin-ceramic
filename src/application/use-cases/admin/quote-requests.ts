import { adminMutation, adminQuery } from "@/application/auth/admin-mutation";
import { NotFoundError } from "@/application/auth/authorize";
import {
  canTransition,
  requiresLostReason,
  STATUS_LABEL,
  type LostReason,
  type QuoteBoard,
  type QuoteDetail,
  type QuoteStatus,
} from "@/domain/admin/quote-request";
import {
  assignQuote,
  getQuoteBoard,
  getQuoteDetail,
  listAssignableStaff,
  setQuoteStatus,
} from "@/infrastructure/db/repositories/quote-admin-repository";

/**
 * Quote-request use-cases.
 *
 * Reading is `request.read`; every write is `request.respond`. That split
 * matters: `viewer` holds the first and not the second, so a viewer can see
 * the pipeline without being able to tell a customer anything.
 */

export async function getBoardForAdmin(filter: {
  assignedTo?: string;
  source?: string;
}): Promise<QuoteBoard> {
  return adminQuery("request.read", (tx, ctx) =>
    getQuoteBoard(tx, ctx.tenantId, filter),
  );
}

export async function getQuoteForAdmin(id: string): Promise<QuoteDetail> {
  return adminQuery("request.read", async (tx, ctx) => {
    const quote = await getQuoteDetail(tx, ctx.tenantId, id);
    // 404 rather than 403 for another tenant's reference — docs/04 §5.1.
    if (!quote) throw new NotFoundError("quote request not found");
    return quote;
  });
}

export async function getAssignableStaff(): Promise<
  { id: string; email: string; fullName: string | null }[]
> {
  return adminQuery("request.read", (tx, ctx) =>
    listAssignableStaff(tx, ctx.tenantId),
  );
}

/**
 * Move a request through the pipeline.
 *
 * The transition is validated against the row as it actually is, not
 * against what the board last rendered — two people working the same queue
 * is the normal case, not the exception, and the second one must not be
 * able to drag a card from a column it has already left.
 */
export async function moveQuote(
  id: string,
  status: QuoteStatus,
  lostReason: LostReason | null,
): Promise<void> {
  return adminMutation("request.respond", async (tx, ctx) => {
    const before = await getQuoteDetail(tx, ctx.tenantId, id);
    if (!before) throw new NotFoundError("quote request not found");

    if (before.status === status) {
      throw new Error(
        `this request is already ${STATUS_LABEL[status].toLowerCase()}`,
      );
    }
    if (!canTransition(before.status, status)) {
      throw new Error(
        `a ${STATUS_LABEL[before.status].toLowerCase()} request cannot move to ${STATUS_LABEL[status].toLowerCase()}`,
      );
    }
    if (requiresLostReason(status) && lostReason === null) {
      throw new Error("marking a request lost needs a reason");
    }

    await setQuoteStatus(tx, ctx.tenantId, id, status, lostReason);

    return {
      result: undefined,
      audit: {
        action: `request.${status}`,
        entityType: "quote_request",
        entityId: id,
        // The reference, not the uuid — it is what appears on the customer's
        // email and what someone searching the log will actually have.
        entityLabel: before.reference,
        before: { status: before.status },
        after: { status, lostReason },
        changedFields: ["status"],
        ...(lostReason ? { reason: lostReason } : {}),
      },
    };
  });
}

export async function assignQuoteToStaff(
  id: string,
  appUserId: string | null,
): Promise<void> {
  return adminMutation("request.respond", async (tx, ctx) => {
    const before = await getQuoteDetail(tx, ctx.tenantId, id);
    if (!before) throw new NotFoundError("quote request not found");

    await assignQuote(tx, ctx.tenantId, id, appUserId);

    return {
      result: undefined,
      audit: {
        action: appUserId === null ? "request.unassign" : "request.assign",
        entityType: "quote_request",
        entityId: id,
        entityLabel: before.reference,
        before: { assignedTo: before.assignedToEmail },
        after: { assignedTo: appUserId },
        changedFields: ["assignedTo"],
      },
    };
  });
}
