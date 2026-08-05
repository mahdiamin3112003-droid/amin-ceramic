"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { decideTradeAccountAction } from "@/application/actions/admin/people-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TRADE_STATUS_LABEL,
  TRADE_STATUS_TRANSITIONS,
  TRADE_TYPE_LABEL,
  type PriceTierRow,
  type TradeAccountRow,
  type TradeAccountStatus,
} from "@/domain/admin/people";
import { cn } from "@/lib/utils";

/**
 * Trade account review — docs/04 §14.5's `approveTradeAccount`.
 *
 * Approval is the operation that finally gives `price.trade.*` something to
 * govern: until an account is on a tier, those permissions guard a feature
 * nobody can reach.
 */
export function TradeAccountsTable({
  accounts,
  tiers,
}: {
  accounts: readonly TradeAccountRow[];
  tiers: readonly PriceTierRow[];
}) {
  const [deciding, setDeciding] = useState<{
    account: TradeAccountRow;
    to: TradeAccountStatus;
  } | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full min-w-3xl border-collapse text-body-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="p-3 text-start font-medium">
                Company
              </th>
              <th scope="col" className="p-3 text-start font-medium">
                Type
              </th>
              <th scope="col" className="p-3 text-start font-medium">
                Tier
              </th>
              <th scope="col" className="p-3 text-start font-medium">
                Status
              </th>
              <th scope="col" className="p-3 text-end font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr
                key={account.id}
                className="border-b border-border last:border-b-0"
              >
                <td className="p-3">
                  <span className="block font-medium">{account.companyName}</span>
                  <span className="block text-caption text-stone-500">
                    {account.email}
                  </span>
                  {account.taxId ? (
                    <span className="block text-caption font-mono text-stone-500">
                      Tax {account.taxId}
                    </span>
                  ) : null}
                </td>

                <td className="p-3">{TRADE_TYPE_LABEL[account.tradeType]}</td>

                <td className="p-3">
                  {account.priceTierName ?? (
                    <span className="text-stone-400">—</span>
                  )}
                  {account.paymentTermsDays !== null ? (
                    <span className="block text-caption text-stone-500 tabular-nums">
                      {account.paymentTermsDays} day terms
                    </span>
                  ) : null}
                </td>

                <td className="p-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-caption font-medium",
                      account.status === "approved" &&
                        "bg-success-50 text-success-600",
                      account.status === "pending" &&
                        "bg-warning-50 text-warning-600",
                      account.status === "rejected" &&
                        "bg-danger-50 text-danger-600",
                      account.status === "suspended" &&
                        "bg-stone-100 text-stone-600",
                    )}
                  >
                    {TRADE_STATUS_LABEL[account.status]}
                  </span>
                  {account.rejectionReason ? (
                    <span className="mt-1 block text-caption text-stone-600">
                      {account.rejectionReason}
                    </span>
                  ) : null}
                </td>

                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {/* Only the legal transitions, same principle as the
                        quote board — an illegal move is not offered. */}
                    {TRADE_STATUS_TRANSITIONS[account.status].map((to) => (
                      <Button
                        key={to}
                        variant={to === "approved" ? "primary" : "ghost"}
                        size="sm"
                        onClick={() => {
                          setDeciding({ account, to });
                        }}
                      >
                        {TRADE_STATUS_LABEL[to]}
                      </Button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DecisionDialog
        pending={deciding}
        tiers={tiers}
        onClose={() => {
          setDeciding(null);
        }}
      />
    </div>
  );
}

function DecisionDialog({
  pending,
  tiers,
  onClose,
}: {
  pending: { account: TradeAccountRow; to: TradeAccountStatus } | null;
  tiers: readonly PriceTierRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [tierId, setTierId] = useState("");
  const [reason, setReason] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  if (!pending) return null;

  const approving = pending.to === "approved";
  const rejecting = pending.to === "rejected";
  const blocked =
    (approving && tierId === "") || (rejecting && reason.trim() === "");

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          setTierId("");
          setReason("");
          setCreditLimit("");
          setPaymentTerms("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {TRADE_STATUS_LABEL[pending.to]} — {pending.account.companyName}
          </DialogTitle>
          <DialogDescription>
            {approving
              ? "The tier decides what this customer is quoted from now on."
              : rejecting
                ? "The reason is recorded and can be shown to the applicant."
                : `Currently ${TRADE_STATUS_LABEL[pending.account.status].toLowerCase()}.`}
          </DialogDescription>
        </DialogHeader>

        {approving ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="trade-tier">Price tier</Label>
              <select
                id="trade-tier"
                value={tierId}
                onChange={(e) => {
                  setTierId(e.target.value);
                }}
                className="h-11 rounded-sm border border-stone-300 bg-white px-3 text-body-sm"
              >
                <option value="">Select a tier</option>
                {tiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.name} — {tier.discountPct.toFixed(1)}% off
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="credit-limit">Credit limit (optional)</Label>
                <Input
                  id="credit-limit"
                  type="number"
                  min={0}
                  value={creditLimit}
                  onChange={(e) => {
                    setCreditLimit(e.target.value);
                  }}
                  className="tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="payment-terms">
                  Payment terms, days (optional)
                </Label>
                <Input
                  id="payment-terms"
                  type="number"
                  min={0}
                  max={365}
                  value={paymentTerms}
                  onChange={(e) => {
                    setPaymentTerms(e.target.value);
                  }}
                  className="tabular-nums"
                />
              </div>
            </div>
          </div>
        ) : null}

        {rejecting ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Input
              id="reject-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
              placeholder="Registration number could not be verified"
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={blocked || busy}
            onClick={() => {
              startTransition(async () => {
                const result = await decideTradeAccountAction({
                  id: pending.account.id,
                  status: pending.to,
                  priceTierId: tierId,
                  creditLimit,
                  paymentTermsDays: paymentTerms,
                  rejectionReason: reason,
                });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success(`${pending.account.companyName} ${pending.to}`);
                setTierId("");
                setReason("");
                setCreditLimit("");
                setPaymentTerms("");
                onClose();
                router.refresh();
              });
            }}
          >
            {TRADE_STATUS_LABEL[pending.to]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
