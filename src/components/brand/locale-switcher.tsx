"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, localeNames, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Locale switcher — docs/02-ux-blueprint.md §1.3: "Preserves current route".
 *
 * That requirement is the whole design. `usePathname` from next-intl returns
 * the path *without* the locale prefix, so switching is a re-navigation to the
 * same logical route under a different locale rather than a bounce to the home
 * page. Search params are carried across too, which matters more than it
 * sounds: catalog filter state lives in the URL (docs/01-architecture.md §5.2),
 * so dropping the query would silently discard a user's filters when they
 * switch language.
 *
 * The chosen locale is persisted in the NEXT_LOCALE cookie by next-intl. No
 * browser storage is used, per CLAUDE.md.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations("common.localeSwitcher");
  // Typed as our Locale union via the AppConfig declaration in
  // src/types/next-intl.d.ts, so no assertion is needed here.
  const active = useLocale();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === active) return;

    // Repeated keys are collected into arrays rather than collapsed: catalog
    // filters legitimately repeat (?finish=matte&finish=polished), and losing
    // all but the last would quietly change the user's result set.
    const query: Record<string, string | string[]> = {};
    for (const key of new Set(searchParams.keys())) {
      const values = searchParams.getAll(key);
      query[key] = values.length > 1 ? values : (values[0] ?? "");
    }

    startTransition(() => {
      // `pathname` here is already locale-stripped and has its dynamic segments
      // resolved (/products/calacatta-oro, not /products/[slug]), so the target
      // locale's URL is this same path under the other prefix.
      router.replace({ pathname, query }, { locale: next });
    });
  }

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="group"
      aria-label={t("label")}
    >
      {locales.map((locale) => {
        const isActive = locale === active;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            onClick={() => {
              switchTo(locale);
            }}
            aria-current={isActive ? "true" : undefined}
            disabled={isPending}
            className={cn(
              "text-body-sm rounded-sm px-3 py-1.5 transition-colors",
              "duration-instant ease-material",
              "disabled:pointer-events-none disabled:opacity-60",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            {/* Each language names itself in its own script. */}
            <span aria-hidden="true">{localeNames[locale]}</span>
            <span className="sr-only">{t(locale)}</span>
          </button>
        );
      })}
    </div>
  );
}
