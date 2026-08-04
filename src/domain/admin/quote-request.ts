/**
 * Quote requests — the admin's daily loop (docs/02 §2.6).
 *
 * ── A gap in the spec, filled here ──
 * `quote_request_status` has nine values and docs/04 never defines the
 * transitions between them. §14.5 specifies user and settings operations
 * and stops; there is no `respondToRequest` contract anywhere. So the
 * machine below is derived rather than transcribed, and this comment is the
 * record of that — if the doc later disagrees, the doc is the newer opinion
 * and wins.
 *
 * The shape is taken from what the statuses plainly mean commercially:
 *
 *   draft        the visitor's basket. Never appears on the board — it is
 *                not a request until it is submitted.
 *   submitted    arrived, nobody has looked yet
 *   acknowledged a human has seen it and told the customer so
 *   quoted       a price has gone out
 *   negotiating  the customer came back with questions
 *   won / lost   terminal, commercially
 *   expired      the quote aged out without an answer
 *   cancelled    withdrawn by either side
 *
 * `domain/` imports nothing (ADR-0003).
 */

export type QuoteStatus =
  | "draft"
  | "submitted"
  | "acknowledged"
  | "quoted"
  | "negotiating"
  | "won"
  | "lost"
  | "expired"
  | "cancelled";

/**
 * The columns of the board, in order.
 *
 * `draft` is deliberately absent: a draft is an abandoned basket, not a
 * request, and putting hundreds of them in front of the sales team every
 * morning would bury the six that need answering. They remain queryable —
 * docs/04 §11.1 makes the point that an abandoned basket is analysable with
 * the same queries — just not on this board.
 *
 * The terminal states share the last column rather than getting three of
 * their own: nobody scans "expired" the way they scan "submitted", and four
 * dead columns of horizontal space is four columns not spent on live work.
 */
export const BOARD_COLUMNS = [
  "submitted",
  "acknowledged",
  "quoted",
  "negotiating",
] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const CLOSED_STATUSES = ["won", "lost", "expired", "cancelled"] as const;

export function isBoardColumn(status: QuoteStatus): status is BoardColumn {
  return (BOARD_COLUMNS as readonly string[]).includes(status);
}

export const STATUS_LABEL: Readonly<Record<QuoteStatus, string>> = {
  draft: "Draft basket",
  submitted: "New",
  acknowledged: "Acknowledged",
  quoted: "Quoted",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
  expired: "Expired",
  cancelled: "Cancelled",
};

/**
 * Legal moves.
 *
 * Two properties worth stating, because both are deliberate:
 *
 * 1. YOU CAN GO BACKWARDS. `quoted → acknowledged` is allowed, because
 *    sending a quote by mistake is a thing that happens and the alternative
 *    is a permanently wrong record.
 * 2. TERMINAL IS NOT PERMANENT. `lost → negotiating` is allowed, because
 *    customers come back. `won` is the one exception on the way out — a won
 *    quote becomes an order elsewhere, and re-opening it would leave two
 *    records disagreeing about the same money.
 */
export const STATUS_TRANSITIONS: Readonly<
  Record<QuoteStatus, readonly QuoteStatus[]>
> = {
  // A draft becomes a request by being submitted, which the storefront does.
  draft: ["submitted", "cancelled"],
  submitted: ["acknowledged", "quoted", "lost", "cancelled"],
  acknowledged: ["quoted", "negotiating", "lost", "cancelled"],
  quoted: ["negotiating", "won", "lost", "expired", "acknowledged"],
  negotiating: ["quoted", "won", "lost", "cancelled"],
  won: [],
  lost: ["negotiating", "quoted"],
  expired: ["quoted", "negotiating", "lost"],
  cancelled: ["submitted"],
};

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Moving to `lost` requires a reason.
 *
 * The one field that turns a pile of dead quotes into something a business
 * can act on. "We lost 40% on price" is a decision; "we lost 40%" is not.
 */
export function requiresLostReason(to: QuoteStatus): boolean {
  return to === "lost";
}

export type LostReason =
  "price" | "availability" | "timeline" | "competitor" | "no_response" | "other";

export const LOST_REASONS: readonly LostReason[] = [
  "price",
  "availability",
  "timeline",
  "competitor",
  "no_response",
  "other",
];

export const LOST_REASON_LABEL: Readonly<Record<LostReason, string>> = {
  price: "Price",
  availability: "Availability",
  timeline: "Timeline",
  competitor: "Went to a competitor",
  no_response: "No response",
  other: "Other",
};

// ── Rows ─────────────────────────────────────────────────────────────────────

export type QuoteSource =
  | "catalog"
  | "tile_finder"
  | "assistant"
  | "project"
  | "showroom"
  | "whatsapp"
  | "direct";

export const SOURCE_LABEL: Readonly<Record<QuoteSource, string>> = {
  catalog: "Catalogue",
  tile_finder: "Tile Finder",
  assistant: "Assistant",
  project: "Project",
  showroom: "Showroom",
  whatsapp: "WhatsApp",
  direct: "Direct",
};

export interface QuoteCard {
  readonly id: string;
  readonly reference: string;
  readonly status: QuoteStatus;
  readonly contactName: string | null;
  readonly companyName: string | null;
  readonly projectCity: string | null;
  readonly source: QuoteSource;
  readonly itemCount: number;
  readonly totalAreaM2: number | null;
  readonly subtotal: number | null;
  readonly currency: string | null;
  readonly submittedAt: Date | null;
  readonly updatedAt: Date;
  readonly assignedToEmail: string | null;
}

export interface QuoteBoard {
  readonly columns: Readonly<Record<BoardColumn, readonly QuoteCard[]>>;
  /** Closed requests are counted, not listed — see BOARD_COLUMNS. */
  readonly closedCount: number;
}

export interface QuoteItem {
  readonly id: string;
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly quantityM2: number;
  readonly quantityBoxes: number | null;
  readonly unitPrice: number;
  readonly lineTotal: number;
  readonly currency: string;
  readonly notes: string | null;
}

export interface QuoteDetail extends QuoteCard {
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly contactWhatsapp: string | null;
  readonly projectType: string | null;
  readonly projectAddress: string | null;
  readonly timeline: string | null;
  readonly notes: string | null;
  readonly quotedTotal: number | null;
  readonly totalWeightKg: number | null;
  readonly lostReason: LostReason | null;
  readonly respondedAt: Date | null;
  readonly closedAt: Date | null;
  readonly items: readonly QuoteItem[];
}

/**
 * How long a request has been waiting, in whole days.
 *
 * Only meaningful for the live columns — the age of a won quote is
 * trivia. Returns null for anything closed so the card can omit it rather
 * than showing a number nobody should act on.
 */
export function daysWaiting(
  card: Pick<QuoteCard, "status" | "submittedAt">,
  now: Date,
): number | null {
  if (!isBoardColumn(card.status) || !card.submittedAt) return null;
  const ms = now.getTime() - card.submittedAt.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * Cards that have been sitting too long, by column.
 *
 * A new request untouched for two days is a different kind of problem from
 * a negotiation that has gone quiet for a fortnight, so the threshold is
 * per column rather than global. These drive the card's urgency stripe.
 */
const STALE_AFTER_DAYS: Readonly<Record<BoardColumn, number>> = {
  submitted: 1,
  acknowledged: 3,
  quoted: 7,
  negotiating: 14,
};

export function isStale(
  card: Pick<QuoteCard, "status" | "submittedAt">,
  now: Date,
): boolean {
  const days = daysWaiting(card, now);
  if (days === null || !isBoardColumn(card.status)) return false;
  return days >= STALE_AFTER_DAYS[card.status];
}
