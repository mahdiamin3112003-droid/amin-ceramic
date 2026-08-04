"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  deleteProductAction,
  setProductStatusAction,
} from "@/application/actions/admin/product-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductStatus } from "@/domain/admin/product";

const TRANSITION_LABEL: Readonly<Record<ProductStatus, string>> = {
  draft: "Move to draft",
  review: "Send for review",
  published: "Publish",
  archived: "Archive",
  discontinued: "Discontinue",
};

export function ProductActions({
  id,
  status,
  transitions,
  blockers,
  mayPublish,
  mayDelete,
}: {
  id: string;
  status: ProductStatus;
  transitions: readonly ProductStatus[];
  blockers: readonly string[];
  mayPublish: boolean;
  mayDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  function changeStatus(next: ProductStatus) {
    startTransition(async () => {
      const result = await setProductStatusAction({ id, status: next });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Product ${next}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {mayPublish
        ? transitions.map((next) => {
            // Publishing is blocked by missing copy/imagery, but the button
            // stays visible and disabled rather than disappearing — the
            // reasons are listed under the form, and a vanished button
            // gives no clue where to look.
            const blocked = next === "published" && blockers.length > 0;
            return (
              <Button
                key={next}
                variant={next === "published" ? "primary" : "secondary"}
                size="sm"
                disabled={blocked || pending}
                {...(blocked ? { title: blockers.join(", ") } : {})}
                onClick={() => {
                  changeStatus(next);
                }}
              >
                {TRANSITION_LABEL[next]}
              </Button>
            );
          })
        : null}

      {mayDelete ? (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              Delete
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this product?</DialogTitle>
              <DialogDescription>
                It will be hidden everywhere but not erased — quotes and stock
                movements that reference it stay intact. An owner can restore it.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              <Label htmlFor="delete-reason">
                Reason (recorded in the audit log)
              </Label>
              <Input
                id="delete-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                }}
                placeholder="Discontinued by supplier"
              />
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setDeleteOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                // Matches the schema's `min(5)` — the button should not
                // offer to do something the boundary will reject.
                disabled={reason.trim().length < 5 || pending}
                loading={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await deleteProductAction({ id, reason });
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success("Product deleted");
                    setDeleteOpen(false);
                    router.push("/admin/products");
                  });
                }}
              >
                Delete product
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <span className="sr-only" aria-live="polite">
        Current status: {status}
      </span>
    </div>
  );
}
