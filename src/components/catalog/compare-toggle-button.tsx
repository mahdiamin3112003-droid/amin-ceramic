"use client";

import { ArrowLeftRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCompare } from "@/components/catalog/compare-context";
import { cn } from "@/lib/utils";

/** The "⇄" card action — docs/02-ux-blueprint.md §3.2's compare toggle. */
export function CompareToggleButton({
  productId,
  className,
}: {
  productId: string;
  className?: string;
}) {
  const t = useTranslations("catalog.card");
  const { isSelected, toggle, isFull } = useCompare();
  const selected = isSelected(productId);
  const disabled = !selected && isFull;

  return (
    <button
      type="button"
      onClick={() => {
        toggle(productId);
      }}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={selected ? t("removeFromCompare") : t("addToCompare")}
      title={disabled ? t("compareFull") : undefined}
      className={cn(
        "flex size-11 items-center justify-center rounded-full bg-background/90 text-stone-600",
        "transition-surface duration-instant ease-material hover:bg-stone-50",
        "disabled:pointer-events-none disabled:opacity-40",
        selected && "text-primary",
        className,
      )}
    >
      <ArrowLeftRight className="size-4" aria-hidden="true" />
    </button>
  );
}
