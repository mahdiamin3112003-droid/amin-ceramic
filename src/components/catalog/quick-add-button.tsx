"use client";

import { useTransition } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { addBasketItemAction } from "@/application/actions/basket-actions";
import { Button } from "@/components/ui/button";

/**
 * Grid-card quick add — docs/02-ux-blueprint.md §3.2's "+" card action.
 * Adds one box's worth of area, the smallest meaningful unit a visitor can
 * commit to without opening the PDP's full calculator; the basket page
 * lets them adjust the quantity afterwards.
 */
export function QuickAddButton({
  productId,
  m2PerBox,
}: {
  productId: string;
  m2PerBox: number;
}) {
  const t = useTranslations("catalog.card");
  const [isPending, startTransition] = useTransition();

  function add() {
    startTransition(() => {
      void (async () => {
        const result = await addBasketItemAction({
          productId,
          requiredM2: m2PerBox,
        });
        if (result.ok) {
          toast.success(t("addedToBasket"));
        } else {
          toast.error(t("addToBasketFailed"));
        }
      })();
    });
  }

  return (
    <Button
      type="button"
      variant="icon"
      iconOnly
      size="sm"
      onClick={add}
      loading={isPending}
      loadingLabel={t("addingToBasket")}
      aria-label={t("addToBasket")}
    >
      <Plus className="size-4" aria-hidden="true" />
    </Button>
  );
}
