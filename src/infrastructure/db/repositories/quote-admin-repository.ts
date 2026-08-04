import type { Prisma } from "@prisma/client";

import {
  BOARD_COLUMNS,
  CLOSED_STATUSES,
  type BoardColumn,
  type LostReason,
  type QuoteBoard,
  type QuoteCard,
  type QuoteDetail,
  type QuoteStatus,
} from "@/domain/admin/quote-request";

/**
 * Quote requests, admin side.
 *
 * Separate from `quote-repository.ts`, which serves the visitor's own
 * basket and is scoped to `visitor_id`. This one reads across the tenant
 * and is only ever reached through `adminQuery`/`adminMutation`, so the
 * RLS claims carry `request.read` / `request.respond`.
 */

function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

const CARD_SELECT = {
  id: true,
  reference: true,
  status: true,
  contactName: true,
  companyName: true,
  projectCity: true,
  source: true,
  totalAreaM2: true,
  subtotal: true,
  currency: true,
  submittedAt: true,
  updatedAt: true,
  assignedTo: true,
  _count: { select: { items: true } },
} satisfies Prisma.QuoteRequestSelect;

type CardRow = Prisma.QuoteRequestGetPayload<{ select: typeof CARD_SELECT }>;

function toCard(row: CardRow, assigneeEmail: string | null): QuoteCard {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    contactName: row.contactName,
    companyName: row.companyName,
    projectCity: row.projectCity,
    source: row.source,
    itemCount: row._count.items,
    totalAreaM2: toNumber(row.totalAreaM2),
    subtotal: toNumber(row.subtotal),
    currency: row.currency,
    submittedAt: row.submittedAt,
    updatedAt: row.updatedAt,
    assignedToEmail: assigneeEmail,
  };
}

/**
 * Resolve assignee emails in one pass.
 *
 * `assigned_to` is a bare uuid rather than an FK — the same choice the
 * inventory ledger makes, so a request survives the staff member who owned
 * it being deleted. That costs a second query instead of a join.
 */
async function resolveAssignees(
  tx: Prisma.TransactionClient,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();

  const users = await tx.appUser.findMany({
    where: { id: { in: unique } },
    select: { id: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u.email]));
}

/**
 * The board.
 *
 * One query for the live columns plus a count for the closed pile, rather
 * than five queries. Drafts are excluded here rather than filtered in the
 * UI — see `BOARD_COLUMNS`.
 */
export async function getQuoteBoard(
  tx: Prisma.TransactionClient,
  tenantId: string,
  filter: { assignedTo?: string; source?: string } = {},
): Promise<QuoteBoard> {
  const where: Prisma.QuoteRequestWhereInput = {
    tenantId,
    status: { in: [...BOARD_COLUMNS] },
    ...(filter.assignedTo ? { assignedTo: filter.assignedTo } : {}),
    ...(filter.source ? { source: filter.source as "catalog" } : {}),
  };

  const [rows, closedCount] = await Promise.all([
    tx.quoteRequest.findMany({
      where,
      // Oldest first WITHIN a column: the point of the board is that the
      // thing nearest the top is the thing that has waited longest.
      orderBy: { submittedAt: "asc" },
      take: 400,
      select: CARD_SELECT,
    }),
    tx.quoteRequest.count({
      where: { tenantId, status: { in: [...CLOSED_STATUSES] } },
    }),
  ]);

  const assignees = await resolveAssignees(
    tx,
    rows.map((r) => r.assignedTo),
  );

  const columns = Object.fromEntries(
    BOARD_COLUMNS.map((column) => [column, [] as QuoteCard[]]),
  ) as Record<BoardColumn, QuoteCard[]>;

  for (const row of rows) {
    const card = toCard(
      row,
      row.assignedTo ? (assignees.get(row.assignedTo) ?? null) : null,
    );
    // `status` is constrained to BOARD_COLUMNS by the query above.
    columns[row.status as BoardColumn].push(card);
  }

  return { columns, closedCount };
}

export async function getQuoteDetail(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
): Promise<QuoteDetail | null> {
  // Declared inline rather than spreading CARD_SELECT: spreading a
  // `satisfies`-typed object erases Prisma's literal inference, and the
  // resulting payload silently loses `_count` and `items`.
  const row = await tx.quoteRequest.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      reference: true,
      status: true,
      contactName: true,
      companyName: true,
      projectCity: true,
      source: true,
      totalAreaM2: true,
      subtotal: true,
      currency: true,
      submittedAt: true,
      updatedAt: true,
      assignedTo: true,
      _count: { select: { items: true } },
      contactEmail: true,
      contactPhone: true,
      contactWhatsapp: true,
      projectType: true,
      projectAddress: true,
      timeline: true,
      notes: true,
      quotedTotal: true,
      totalWeightKg: true,
      lostReason: true,
      respondedAt: true,
      closedAt: true,
      items: {
        // The table has no timestamp column, so ordering is by the
        // snapshotted SKU: arbitrary, but STABLE, which is what stops the
        // line items reshuffling between two renders of the same quote.
        orderBy: { skuSnapshot: "asc" },
        select: {
          id: true,
          productId: true,
          skuSnapshot: true,
          nameSnapshot: true,
          quantityM2: true,
          quantityBoxes: true,
          unitPriceSnapshot: true,
          currencySnapshot: true,
          lineTotal: true,
          notes: true,
        },
      },
    },
  });

  if (!row) return null;

  const assignees = await resolveAssignees(tx, [row.assignedTo]);

  return {
    ...toCard(row, row.assignedTo ? (assignees.get(row.assignedTo) ?? null) : null),
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    contactWhatsapp: row.contactWhatsapp,
    projectType: row.projectType,
    projectAddress: row.projectAddress,
    timeline: row.timeline,
    notes: row.notes,
    quotedTotal: toNumber(row.quotedTotal),
    totalWeightKg: toNumber(row.totalWeightKg),
    lostReason: row.lostReason,
    respondedAt: row.respondedAt,
    closedAt: row.closedAt,
    items: row.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      // The SNAPSHOT, not the product's current name. A quote must keep
      // saying what was quoted even after the product is renamed or
      // repriced — that is the whole reason these columns exist.
      sku: item.skuSnapshot,
      name: item.nameSnapshot,
      quantityM2: item.quantityM2.toNumber(),
      quantityBoxes: item.quantityBoxes,
      unitPrice: item.unitPriceSnapshot.toNumber(),
      lineTotal: item.lineTotal.toNumber(),
      currency: item.currencySnapshot,
      notes: item.notes,
    })),
  };
}

/**
 * Move a request to a new status.
 *
 * The timestamp columns are maintained here rather than by the caller so
 * they cannot drift from the status they describe:
 *   respondedAt  first time a price goes out
 *   closedAt     any terminal state
 */
export async function setQuoteStatus(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
  status: QuoteStatus,
  lostReason: LostReason | null,
): Promise<void> {
  const isClosing = (CLOSED_STATUSES as readonly string[]).includes(status);

  const { count } = await tx.quoteRequest.updateMany({
    where: { id, tenantId },
    data: {
      status,
      updatedAt: new Date(),
      // Only ever set, never cleared — re-opening a lost quote must not
      // erase the fact that it was once answered.
      ...(status === "quoted" ? { respondedAt: new Date() } : {}),
      ...(isClosing ? { closedAt: new Date() } : { closedAt: null }),
      // The reason belongs to `lost`; moving anywhere else clears it.
      lostReason: status === "lost" ? lostReason : null,
    },
  });

  if (count === 0) throw new Error("quote request not found");
}

export async function assignQuote(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
  appUserId: string | null,
): Promise<void> {
  const { count } = await tx.quoteRequest.updateMany({
    where: { id, tenantId },
    data: { assignedTo: appUserId, updatedAt: new Date() },
  });
  if (count === 0) throw new Error("quote request not found");
}

/** Staff who may be assigned a request — those holding `request.respond`. */
export async function listAssignableStaff(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<{ id: string; email: string; fullName: string | null }[]> {
  return tx.appUser.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: "active",
      userType: "staff",
      userRoles: {
        some: {
          role: { rolePermissions: { some: { permissionKey: "request.respond" } } },
        },
      },
    },
    select: { id: true, email: true, fullName: true },
    orderBy: { email: "asc" },
  });
}
