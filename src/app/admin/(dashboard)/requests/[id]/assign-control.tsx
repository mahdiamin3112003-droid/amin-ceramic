"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { assignQuoteAction } from "@/application/actions/admin/quote-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Ownership of a request.
 *
 * The staff list is restricted to people holding `request.respond` — there
 * is no point assigning a quote to someone who cannot answer it, and
 * offering the whole directory is how that happens.
 *
 * Unassigning is a first-class option rather than an oversight: a card
 * whose owner is on leave needs to go back in the pool, and the alternative
 * is reassigning it to an arbitrary colleague.
 */
export function AssignControl({
  quoteId,
  currentEmail,
  staff,
}: {
  quoteId: string;
  currentEmail: string | null;
  staff: readonly { id: string; email: string; fullName: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = staff.find((s) => s.email === currentEmail);
  const [selected, setSelected] = useState(current?.id ?? "");

  const dirty = selected !== (current?.id ?? "");

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-white p-5">
      <h2 className="font-display text-body-lg">Owner</h2>

      <div className="flex flex-col gap-2">
        <Label htmlFor="assign-to">Assigned to</Label>
        <select
          id="assign-to"
          value={selected}
          disabled={pending}
          onChange={(e) => {
            setSelected(e.target.value);
          }}
          className="h-11 rounded-sm border border-stone-300 bg-white px-3 text-body-sm"
        >
          <option value="">Unassigned</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.fullName ?? member.email}
            </option>
          ))}
        </select>

        {staff.length === 0 ? (
          <span className="text-caption text-stone-600">
            Nobody holds the permission to answer requests yet.
          </span>
        ) : null}
      </div>

      <Button
        // Enabled only when there is a change to save — a Save button that
        // does nothing is a Save button people stop trusting.
        disabled={!dirty || pending}
        loading={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await assignQuoteAction({
              id: quoteId,
              appUserId: selected,
            });
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success(selected === "" ? "Unassigned" : "Assigned");
            router.refresh();
          });
        }}
      >
        Save owner
      </Button>
    </section>
  );
}
