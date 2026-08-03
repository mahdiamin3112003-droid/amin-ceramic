"use client";

import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { usePathname, useRouter } from "@/i18n/navigation";

/** `/search`'s query box — URL-driven like every other filter here, so a search is a shareable link. */
export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const t = useTranslations("catalog.search");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (value === (searchParams.get("q") ?? "")) return;
      const next = new URLSearchParams(searchParams.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      next.delete("cursor");
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`, { scroll: false });
      });
      // Deliberately depends only on `value`: including searchParams/pathname/
      // router would re-run this effect on the navigation it itself causes.
    }, 400);
    return () => {
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative w-full max-w-xl">
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-500"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        placeholder={t("placeholder")}
        aria-label={t("placeholder")}
        className="ps-10"
      />
    </div>
  );
}
