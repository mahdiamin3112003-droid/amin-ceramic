"use client";

import { useTranslations } from "next-intl";

import { useCompare } from "@/components/catalog/compare-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The persistent bottom bar — docs/02-ux-blueprint.md §3.2: "COMPARE TRAY
 * … 3 selected [ Compare → ] [Clear]". Renders nothing once selection is
 * empty; only ever mounted inside `CompareProvider` (the `(catalog)` route
 * group layout), so it's visible across `/products`, `/search` and the PDP.
 */
export function CompareTray() {
  const t = useTranslations("catalog.compareTray");
  const { ids, clear } = useCompare();

  if (ids.length === 0) return null;
  const canCompare = ids.length >= 2;

  return (
    <div className="inset-inline-0 fixed bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-gutter py-3">
        <p className="text-body-sm">{t("selectedCount", { count: ids.length })}</p>
        <div className="flex items-center gap-3">
          <Button type="button" variant="text" size="sm" onClick={clear}>
            {t("clear")}
          </Button>
          {canCompare ? (
            <Link
              href={`/compare?ids=${ids.join(",")}`}
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              {t("compare")}
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className={cn(
                buttonVariants({ variant: "primary", size: "sm" }),
                "pointer-events-none opacity-50",
              )}
            >
              {t("compare")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
