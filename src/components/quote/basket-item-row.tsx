"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  removeBasketItemAction,
  updateBasketItemAction,
} from "@/application/actions/basket-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { QuoteItem } from "@/domain/quote/entity";

export function BasketItemRow({ item }: { item: QuoteItem }) {
  const t = useTranslations("quote.basket");
  const [requiredM2, setRequiredM2] = useState(String(item.quantityM2));
  const [isUpdating, startUpdating] = useTransition();
  const [isRemoving, startRemoving] = useTransition();

  function updateQuantity() {
    const parsed = Number(requiredM2);
    if (!(parsed > 0)) return;
    startUpdating(() => {
      void (async () => {
        const result = await updateBasketItemAction({
          itemId: item.id,
          requiredM2: parsed,
        });
        if (!result.ok) toast.error(t("updateFailed"));
      })();
    });
  }

  function remove() {
    startRemoving(() => {
      void (async () => {
        const result = await removeBasketItemAction({ itemId: item.id });
        if (!result.ok) toast.error(t("removeFailed"));
      })();
    });
  }

  return (
    <div className="flex items-center gap-4 border-b border-border py-4 last:border-0">
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-body-sm font-medium">{item.nameSnapshot}</span>
        <span className="text-spec-sm text-stone-600">{item.skuSnapshot}</span>
        {item.notes ? (
          <span className="text-caption text-stone-600">{item.notes}</span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Input
          inputSize="sm"
          inputMode="decimal"
          value={requiredM2}
          onChange={(e) => {
            setRequiredM2(e.target.value);
          }}
          onBlur={updateQuantity}
          className="w-20"
          aria-label={t("quantityLabel")}
        />
        <span className="text-caption text-stone-600">m²</span>
      </div>

      <span className="w-16 text-end text-spec-sm text-stone-600">
        {item.quantityBoxes} {t("boxesAbbr")}
      </span>

      <span className="w-24 text-end text-spec">
        {item.currencySnapshot} {item.lineTotal.toFixed(2)}
      </span>

      <Button
        type="button"
        variant="icon"
        iconOnly
        size="sm"
        onClick={remove}
        loading={isRemoving || isUpdating}
        loadingLabel={t("updating")}
        aria-label={t("removeItem")}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
