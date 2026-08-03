"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { Facets, FacetOption, PriceBounds } from "@/domain/catalog/entity";

/**
 * Filter rail — docs/02-ux-blueprint.md §3.2. Facet counts are always
 * visible; a zero-count option is disabled, not hidden ("hiding them makes
 * the filter feel broken"). Colour is swatches, not a checkbox list —
 * "nobody thinks 'greige'; everybody recognises it."
 *
 * State lives entirely in the URL (multi-select CSV per key for checkbox
 * facets, `min,max` for price), same contract
 * `toProductFilter`/`productFilterQuerySchema` expect — a filtered listing
 * is always a shareable, back-button-safe link.
 */

function useSetFilterParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  return function setParam(key: string, values: readonly string[]) {
    const next = new URLSearchParams(searchParams.toString());
    if (values.length > 0) {
      next.set(key, values.join(","));
    } else {
      next.delete(key);
    }
    next.delete("cursor");
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    });
  };
}

function toggle(current: readonly string[], value: string): readonly string[] {
  return current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
}

function CheckboxGroup({
  paramKey,
  options,
  active,
}: {
  paramKey: string;
  options: readonly FacetOption[];
  active: readonly string[];
}) {
  const setParam = useSetFilterParam();

  return (
    <ul className="flex flex-col gap-2">
      {options.map((option) => {
        const checked = active.includes(option.value);
        const disabled = option.count === 0 && !checked;
        return (
          <li key={option.value} className="flex items-center gap-2">
            <Checkbox
              id={`${paramKey}-${option.value}`}
              checked={checked}
              disabled={disabled}
              onCheckedChange={() => {
                setParam(paramKey, toggle(active, option.value));
              }}
            />
            <label
              htmlFor={`${paramKey}-${option.value}`}
              className={cn(
                "flex flex-1 items-center justify-between gap-2 text-body-sm",
                disabled && "text-stone-500",
              )}
            >
              <span>{option.label}</span>
              <span className="text-caption text-stone-600 tabular-nums">
                {option.count}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function ColorSwatches({
  options,
  active,
}: {
  options: Facets["colorFamily"];
  active: readonly string[];
}) {
  const setParam = useSetFilterParam();

  return (
    <ul className="flex flex-wrap gap-2">
      {options.map((option) => {
        const checked = active.includes(option.value);
        const disabled = option.count === 0 && !checked;
        return (
          <li key={option.value}>
            <button
              type="button"
              disabled={disabled}
              aria-pressed={checked}
              aria-label={`${option.label} (${String(option.count)})`}
              onClick={() => {
                setParam("color", toggle(active, option.value));
              }}
              className={cn(
                "relative size-9 rounded-full border-2 transition-surface duration-instant ease-material",
                checked ? "border-primary" : "border-border",
                disabled && "opacity-40",
              )}
              style={{ backgroundColor: option.colorHex }}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** Dual-thumb price slider — local drag state, committed to the URL only on release (not every tick). */
function PriceRangeFilter({
  bounds,
  active,
}: {
  bounds: PriceBounds;
  active: readonly [number, number] | null;
}) {
  const setParam = useSetFilterParam();
  const [value, setValue] = useState<[number, number]>(
    active ? [active[0], active[1]] : [bounds.min, bounds.max],
  );

  useEffect(() => {
    setValue(active ? [active[0], active[1]] : [bounds.min, bounds.max]);
  }, [active, bounds.min, bounds.max]);

  if (bounds.min >= bounds.max) return null;

  return (
    <div className="flex flex-col gap-4">
      <Slider
        min={bounds.min}
        max={bounds.max}
        step={1}
        value={value}
        onValueChange={(next) => {
          setValue(next as [number, number]);
        }}
        onValueCommit={(next) => {
          const [min, max] = next as [number, number];
          setParam(
            "priceRange",
            min === bounds.min && max === bounds.max
              ? []
              : [`${String(min)},${String(max)}`],
          );
        }}
      />
      <div className="flex justify-between text-caption text-stone-600 tabular-nums">
        <span>{value[0]}</span>
        <span>{value[1]}</span>
      </div>
    </div>
  );
}

function RailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-6">
      <h3 className="text-caption font-medium text-stone-600 uppercase">{title}</h3>
      {children}
    </div>
  );
}

export function FilterRail({
  facets,
  activeBrands,
  activeMaterials,
  activeFinishes,
  activeLooks,
  activeColors,
  activeSlipRatings,
  activePriceRange,
}: {
  facets: Facets;
  activeBrands: readonly string[];
  activeMaterials: readonly string[];
  activeFinishes: readonly string[];
  activeLooks: readonly string[];
  activeColors: readonly string[];
  activeSlipRatings: readonly string[];
  activePriceRange: readonly [number, number] | null;
}) {
  const t = useTranslations("catalog.filters");
  const setAvailability = useSetFilterParam();
  const searchParams = useSearchParams();
  const availableOnly = searchParams.get("availability") === "true";

  return (
    <nav aria-label={t("label")} className="flex flex-col gap-6">
      <RailSection title={t("colour")}>
        <ColorSwatches options={facets.colorFamily} active={activeColors} />
      </RailSection>
      <RailSection title={t("look")}>
        <CheckboxGroup
          paramKey="look"
          options={facets.surfaceLook}
          active={activeLooks}
        />
      </RailSection>
      <RailSection title={t("finish")}>
        <CheckboxGroup
          paramKey="finish"
          options={facets.finish}
          active={activeFinishes}
        />
      </RailSection>
      <RailSection title={t("material")}>
        <CheckboxGroup
          paramKey="material"
          options={facets.material}
          active={activeMaterials}
        />
      </RailSection>
      <RailSection title={t("brand")}>
        <CheckboxGroup
          paramKey="brand"
          options={facets.brand}
          active={activeBrands}
        />
      </RailSection>
      {facets.slipRating.length > 0 ? (
        <RailSection title={t("slipRating")}>
          <CheckboxGroup
            paramKey="slip"
            options={facets.slipRating}
            active={activeSlipRatings}
          />
        </RailSection>
      ) : null}
      {facets.priceBounds ? (
        <RailSection title={t("price")}>
          <PriceRangeFilter bounds={facets.priceBounds} active={activePriceRange} />
        </RailSection>
      ) : null}
      <RailSection title={t("availability")}>
        <div className="flex items-center gap-2">
          <Checkbox
            id="availability-in-stock"
            checked={availableOnly}
            onCheckedChange={(checked) => {
              setAvailability("availability", checked ? ["true"] : []);
            }}
          />
          <label htmlFor="availability-in-stock" className="text-body-sm">
            {t("inStockOnly")}
          </label>
        </div>
      </RailSection>
    </nav>
  );
}
