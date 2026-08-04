"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { recordMovementAction } from "@/application/actions/admin/inventory-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MANUAL_MOVEMENT_TYPES,
  requiresReason,
  signedQuantity,
  type ManualMovementType,
} from "@/domain/admin/inventory";

const TYPE_LABEL: Readonly<Record<ManualMovementType, string>> = {
  receipt: "Receipt (stock in)",
  adjustment: "Adjustment",
  damage: "Damage",
  write_off: "Write-off",
  count_correction: "Stocktake correction",
  return: "Customer return",
};

export function MovementForm({
  products,
  locations,
}: {
  products: readonly { id: string; label: string }[];
  locations: readonly { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ManualMovementType>("receipt");
  const [quantity, setQuantity] = useState("");

  const reasonRequired = requiresReason(type);
  const parsedQuantity = Number.parseFloat(quantity);
  // Previewed because the user types a magnitude and the type decides the
  // sign — showing the result removes the guesswork that produces phantom
  // stock.
  const effect = Number.isNaN(parsedQuantity)
    ? null
    : signedQuantity(type, parsedQuantity);

  if (!open) {
    return (
      <div>
        <Button
          onClick={() => {
            setOpen(true);
          }}
        >
          Record movement
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-border bg-white p-6"
      noValidate
      action={(formData) => {
        startTransition(async () => {
          const result = await recordMovementAction(
            Object.fromEntries(formData.entries()),
          );
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Movement recorded");
          setOpen(false);
          setQuantity("");
          router.refresh();
        });
      }}
    >
      <h2 className="font-display text-body-lg">Record a stock movement</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="productId">Product</Label>
          <select
            id="productId"
            name="productId"
            required
            className="h-11 rounded-sm border border-stone-300 bg-white px-3 text-body-sm"
          >
            <option value="">Select a product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="locationId">Location</Label>
          <select
            id="locationId"
            name="locationId"
            required
            className="h-11 rounded-sm border border-stone-300 bg-white px-3 text-body-sm"
          >
            <option value="">Select a location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="movementType">Movement type</Label>
          <select
            id="movementType"
            name="movementType"
            value={type}
            onChange={(e) => {
              setType(e.target.value as ManualMovementType);
            }}
            className="h-11 rounded-sm border border-stone-300 bg-white px-3 text-body-sm"
          >
            {MANUAL_MOVEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="lotNumber">Lot number</Label>
          <Input id="lotNumber" name="lotNumber" required className="font-mono" />
          <span className="text-caption text-stone-500">
            A lot that doesn&rsquo;t exist yet will be created.
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="quantityM2">Quantity (m²)</Label>
          <Input
            id="quantityM2"
            name="quantityM2"
            type="number"
            step="0.0001"
            required
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
            }}
            className="tabular-nums"
          />
          {effect !== null ? (
            <span
              aria-live="polite"
              className="text-caption font-mono tabular-nums"
            >
              Stock will change by {effect > 0 ? "+" : ""}
              {effect.toFixed(4)} m²
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="quantityBoxes">Boxes (optional)</Label>
          <Input
            id="quantityBoxes"
            name="quantityBoxes"
            type="number"
            min={0}
            className="tabular-nums"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="caliber">Caliber (optional)</Label>
          <Input id="caliber" name="caliber" className="font-mono" />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="shadeCode">Shade code (optional)</Label>
          <Input id="shadeCode" name="shadeCode" className="font-mono" />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="reason">
            Reason
            {reasonRequired ? (
              <span aria-hidden className="text-danger-600">
                {" *"}
              </span>
            ) : null}
          </Label>
          <Input
            id="reason"
            name="reason"
            required={reasonRequired}
            placeholder={
              reasonRequired
                ? "Required — recorded in the ledger and the audit log"
                : "Optional"
            }
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          Record movement
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
