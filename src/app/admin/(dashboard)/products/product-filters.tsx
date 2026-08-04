"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRODUCT_STATUSES } from "@/domain/admin/product";
import type { AdminLookup } from "@/domain/admin/product";

/**
 * Filters live in the URL, not in component state.
 *
 * That is what makes a filtered view shareable ("look at the drafts with no
 * Arabic"), survivable across a refresh, and back-button-correct. The cost
 * is a round trip per change, which for an admin table is the right trade —
 * the list is server-rendered and the data must be fresh anyway.
 *
 * The text query is debounced; the selects are not. Typing produces a
 * keystroke per character and would fire a navigation for each; picking
 * from a select is a single deliberate act.
 */
export function ProductFilters({
  brands,
  collections,
}: {
  brands: readonly AdminLookup[];
  collections: readonly AdminLookup[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === "") params.delete(key);
      else params.set(key, value);
    }
    // Any filter change invalidates the page number — staying on page 4 of
    // a now-shorter result set shows an empty table.
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (query === current) return;

    const id = window.setTimeout(() => {
      apply({ q: query });
    }, 300);
    return () => {
      window.clearTimeout(id);
    };
    // `apply` is recreated every render and adding it would re-arm the
    // timer continuously; the query string is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchParams]);

  const hasFilters = ["q", "status", "brand", "collection"].some((k) =>
    searchParams.get(k),
  );

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-white p-4">
      <div className="flex min-w-52 flex-1 flex-col gap-2">
        <Label htmlFor="filter-q">Search</Label>
        <Input
          id="filter-q"
          type="search"
          placeholder="SKU or name"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
      </div>

      <FilterSelect
        id="filter-status"
        label="Status"
        value={searchParams.get("status") ?? ""}
        options={PRODUCT_STATUSES.map((s) => ({ id: s, label: s }))}
        onChange={(v) => {
          apply({ status: v });
        }}
      />

      <FilterSelect
        id="filter-brand"
        label="Brand"
        value={searchParams.get("brand") ?? ""}
        options={brands}
        onChange={(v) => {
          apply({ brand: v });
        }}
      />

      <FilterSelect
        id="filter-collection"
        label="Collection"
        value={searchParams.get("collection") ?? ""}
        options={collections}
        onChange={(v) => {
          apply({ collection: v });
        }}
      />

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            router.replace(pathname);
          }}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A native `<select>`, not the Radix one used on the storefront.
 *
 * Deliberate: this is a dense internal tool where keyboard-first filtering
 * beats a styled listbox, and the native control gets that for free in
 * every browser. The public catalogue's filters, which are part of the
 * brand experience, keep the designed component.
 */
function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly AdminLookup[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="h-11 rounded-sm border border-stone-300 bg-white px-3 text-body-sm capitalize"
      >
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
