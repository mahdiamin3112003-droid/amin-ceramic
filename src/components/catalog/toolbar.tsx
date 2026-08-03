"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Facets, ProductSort } from "@/domain/catalog/entity";

const SORT_OPTIONS: readonly ProductSort[] = [
  "relevance",
  "price_asc",
  "price_desc",
  "newest",
  "name_asc",
];

const CHIP_KEYS = ["brand", "material", "finish", "look", "color"] as const;
type ChipKey = (typeof CHIP_KEYS)[number];

const FACET_FOR_KEY: Record<
  ChipKey,
  "brand" | "material" | "finish" | "surfaceLook" | "colorFamily"
> = {
  brand: "brand",
  material: "material",
  finish: "finish",
  look: "surfaceLook",
  color: "colorFamily",
};

export function Toolbar({
  totalCount,
  facets,
}: {
  totalCount: number;
  facets: Facets;
}) {
  const t = useTranslations("catalog.toolbar");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function navigate(next: URLSearchParams) {
    next.delete("cursor");
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  function setSort(sort: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (sort === "relevance") next.delete("sort");
    else next.set("sort", sort);
    navigate(next);
  }

  function removeChipValue(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (key === "priceRange") {
      next.delete(key);
    } else {
      const remaining = (next.get(key) ?? "")
        .split(",")
        .filter((v) => v && v !== value);
      if (remaining.length > 0) next.set(key, remaining.join(","));
      else next.delete(key);
    }
    navigate(next);
  }

  function clearAll() {
    navigate(new URLSearchParams());
  }

  const facetChips = CHIP_KEYS.flatMap((key) => {
    const raw = searchParams.get(key);
    if (!raw) return [];
    const values = raw.split(",").filter(Boolean);
    const facetOptions = facets[FACET_FOR_KEY[key]];
    return values.map((value) => ({
      key,
      value,
      label: facetOptions.find((o) => o.value === value)?.label ?? value,
    }));
  });

  const slipRaw = searchParams.get("slip");
  const slipChips = slipRaw
    ? slipRaw
        .split(",")
        .filter(Boolean)
        .map((value) => ({ key: "slip", value, label: value }))
    : [];

  const priceRaw = searchParams.get("priceRange");
  const priceChips = priceRaw
    ? [{ key: "priceRange", value: priceRaw, label: priceRaw.replace(",", "–") }]
    : [];

  const chips = [...facetChips, ...slipChips, ...priceChips];

  const currentSort = searchParams.get("sort") ?? "relevance";

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-body-sm text-stone-600 tabular-nums">
          {t("resultCount", { count: totalCount })}
        </p>
        <Select value={currentSort} onValueChange={setSort}>
          <SelectTrigger size="sm" aria-label={t("sortLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`sort.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={`${chip.key}-${chip.value}`}
              type="button"
              onClick={() => {
                removeChipValue(chip.key, chip.value);
              }}
              className="flex items-center gap-1.5 rounded-sm border border-border bg-stone-50 px-2 py-1 text-caption text-stone-800 hover:bg-stone-100"
            >
              {chip.label}
              <X className="size-3" aria-hidden="true" />
            </button>
          ))}
          <Button type="button" variant="text" size="sm" onClick={clearAll}>
            {t("clearAll")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
