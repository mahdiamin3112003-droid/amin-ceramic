"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { moveQuoteAction } from "@/application/actions/admin/quote-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  BOARD_COLUMNS,
  LOST_REASONS,
  LOST_REASON_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_TRANSITIONS,
  daysWaiting,
  isStale,
  type BoardColumn,
  type QuoteBoard,
  type QuoteCard,
  type QuoteStatus,
} from "@/domain/admin/quote-request";
import { cn } from "@/lib/utils";

/**
 * The requests board — docs/02 §2.6's daily loop.
 *
 * ── Why not drag-and-drop ──
 * The spec says "drag to Quoted", and drag will come. It is not what ships
 * first, because a drag-only board is unusable by keyboard, hostile on a
 * touchpad, and impossible to operate on the phone a salesperson is
 * actually holding on a showroom floor.
 *
 * Each card carries an explicit move control listing exactly the
 * transitions its current status allows — which is strictly more
 * informative than dragging, because the illegal moves are not offered at
 * all rather than discovered by having a card snap back. Drag can be
 * layered on top later; it will call the same action.
 *
 * ── Why the columns are `<section>`s and the cards a list ──
 * A board is a set of named lists, and that is what it should be to a
 * screen reader too: four regions, each with a heading and a count, each
 * containing an ordered list. The visual arrangement is a grid; the
 * semantics are not.
 */
export function QuoteBoardView({
  board,
  canRespond,
}: {
  board: QuoteBoard;
  canRespond: boolean;
}) {
  const [moving, setMoving] = useState<{ card: QuoteCard; to: QuoteStatus } | null>(
    null,
  );

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-4">
        {BOARD_COLUMNS.map((column) => (
          <BoardColumnView
            key={column}
            column={column}
            cards={board.columns[column]}
            canRespond={canRespond}
            onMove={(card, to) => {
              setMoving({ card, to });
            }}
          />
        ))}
      </div>

      <MoveDialog
        pending={moving}
        onClose={() => {
          setMoving(null);
        }}
      />
    </>
  );
}

function BoardColumnView({
  column,
  cards,
  canRespond,
  onMove,
}: {
  column: BoardColumn;
  cards: readonly QuoteCard[];
  canRespond: boolean;
  onMove: (card: QuoteCard, to: QuoteStatus) => void;
}) {
  const now = new Date();

  return (
    <section
      aria-labelledby={`column-${column}`}
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-border pb-2">
        <h2 id={`column-${column}`} className="text-body-sm font-medium">
          {STATUS_LABEL[column]}
        </h2>
        <span className="text-caption text-stone-500 tabular-nums">
          {cards.length}
        </span>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 p-4 text-center text-caption text-stone-500">
          Nothing here
        </p>
      ) : (
        <ul aria-label={STATUS_LABEL[column]} className="flex flex-col gap-3">
          {cards.map((card) => (
            <li key={card.id}>
              <QuoteCardView
                card={card}
                now={now}
                canRespond={canRespond}
                onMove={(to) => {
                  onMove(card, to);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QuoteCardView({
  card,
  now,
  canRespond,
  onMove,
}: {
  card: QuoteCard;
  now: Date;
  canRespond: boolean;
  onMove: (to: QuoteStatus) => void;
}) {
  const waiting = daysWaiting(card, now);
  const stale = isStale(card, now);
  const moves = STATUS_TRANSITIONS[card.status];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border bg-white p-4 transition-surface",
        // The urgency stripe is a border, not a background wash: it reads at
        // a glance down a column without making the card harder to read.
        stale ? "border-warning-600/50" : "border-border",
      )}
    >
      {stale ? (
        <span
          aria-hidden
          style={{ insetBlock: 0, insetInlineStart: 0 }}
          className="absolute w-1 bg-warning-600"
        />
      ) : null}

      <div className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/admin/requests/${card.id}`}
            className="rounded-sm text-caption font-mono font-medium tabular-nums hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
          >
            {card.reference}
          </Link>
          <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-caption text-stone-600">
            {SOURCE_LABEL[card.source]}
          </span>
        </div>

        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium">
            {card.contactName ?? card.companyName ?? "No contact name"}
          </p>
          {card.companyName && card.contactName ? (
            <p className="truncate text-caption text-stone-600">
              {card.companyName}
            </p>
          ) : null}
          {card.projectCity ? (
            <p className="truncate text-caption text-stone-500">
              {card.projectCity}
            </p>
          ) : null}
        </div>

        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-stone-600">
          <div className="flex gap-1">
            <dt className="sr-only">Items</dt>
            <dd className="tabular-nums">{card.itemCount} items</dd>
          </div>
          {card.totalAreaM2 !== null ? (
            <div className="flex gap-1">
              <dt className="sr-only">Area</dt>
              <dd className="font-mono tabular-nums">
                {card.totalAreaM2.toFixed(1)} m²
              </dd>
            </div>
          ) : null}
          {card.subtotal !== null ? (
            <div className="flex gap-1">
              <dt className="sr-only">Subtotal</dt>
              <dd className="font-mono font-medium text-foreground tabular-nums">
                {card.currency} {card.subtotal.toFixed(0)}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
          <span
            className={cn(
              "text-caption tabular-nums",
              stale ? "font-medium text-warning-600" : "text-stone-500",
            )}
          >
            {waiting === null
              ? "—"
              : waiting === 0
                ? "Today"
                : `${String(waiting)} day${waiting === 1 ? "" : "s"}`}
          </span>

          {card.assignedToEmail ? (
            <span className="max-w-32 truncate text-caption text-stone-500">
              {card.assignedToEmail}
            </span>
          ) : (
            <span className="text-stone-400 text-caption">Unassigned</span>
          )}
        </div>

        {canRespond && moves.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {/*
              Only the legal moves, as buttons. An illegal transition is not
              offered at all — better than a card that snaps back and leaves
              the user guessing which moves exist.
            */}
            {moves.map((to) => (
              <Button
                key={to}
                variant="secondary"
                size="sm"
                onClick={() => {
                  onMove(to);
                }}
              >
                {STATUS_LABEL[to]}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Confirmation, and the one place a lost reason is captured.
 *
 * Every move goes through here rather than firing on click. A status change
 * is customer-visible work — it is what decides whether someone gets a
 * quote — and a mis-click on a small button in a dense column is exactly
 * the mistake worth one extra keystroke to prevent.
 */
function MoveDialog({
  pending,
  onClose,
}: {
  pending: { card: QuoteCard; to: QuoteStatus } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [reason, setReason] = useState<string>("");

  if (!pending) return null;

  const needsReason = pending.to === "lost";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Move {pending.card.reference} to{" "}
            {STATUS_LABEL[pending.to].toLowerCase()}?
          </DialogTitle>
          <DialogDescription>
            {needsReason
              ? "Recording why is what turns lost quotes into something the business can act on."
              : `Currently ${STATUS_LABEL[pending.card.status].toLowerCase()}.`}
          </DialogDescription>
        </DialogHeader>

        {needsReason ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="lost-reason">Reason</Label>
            <select
              id="lost-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
              className="h-11 rounded-sm border border-stone-300 bg-white px-3 text-body-sm"
            >
              <option value="">Select a reason</option>
              {LOST_REASONS.map((value) => (
                <option key={value} value={value}>
                  {LOST_REASON_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={needsReason && reason === ""}
            onClick={() => {
              startTransition(async () => {
                const result = await moveQuoteAction({
                  id: pending.card.id,
                  status: pending.to,
                  lostReason: reason,
                });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success(`Moved to ${STATUS_LABEL[pending.to].toLowerCase()}`);
                setReason("");
                onClose();
                router.refresh();
              });
            }}
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
