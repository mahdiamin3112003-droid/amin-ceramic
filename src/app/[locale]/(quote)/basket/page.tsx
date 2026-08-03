import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { ZoneGroupSection } from "@/components/quote/zone-group";
import { getBasket } from "@/application/use-cases/quote/get-basket";
import { basketItemCount, groupItemsByZone } from "@/domain/quote/entity";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";

/**
 * `/basket` — docs/02-ux-blueprint.md §3.7: zone-grouped, computed
 * quantities per line. PDF export is a print route (`/basket/print`), not a
 * server-rendered PDF — see the Phase 2 plan's "PDF export" note: no
 * PDF-generation infra is in this phase's scope, and the browser's own
 * print-to-PDF covers the same need.
 */
export const dynamic = "force-dynamic";

export default async function BasketPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("quote.basket");
  const { basket, error } = await getBasket();

  if (error) {
    return (
      <main id="main" className="mx-auto max-w-content px-gutter py-16">
        <p className="rounded-md border border-warning-600 bg-warning-50 p-6 text-body text-warning-600">
          {t("loadError")}
        </p>
      </main>
    );
  }

  if (!basket || basketItemCount(basket) === 0) {
    return (
      <main id="main" className="mx-auto max-w-content px-gutter py-16 text-center">
        <h1 className="mb-4 font-display text-display-md">{t("title")}</h1>
        <p className="mb-6 text-body text-stone-600">{t("empty")}</p>
        <Link href="/products" className={buttonVariants({ variant: "primary" })}>
          {t("browseProducts")}
        </Link>
      </main>
    );
  }

  const groups = groupItemsByZone(basket);

  return (
    <main id="main" className="mx-auto max-w-content px-gutter py-8">
      <h1 className="mb-6 font-display text-display-md">{t("title")}</h1>

      <div className="flex flex-col gap-10">
        {groups.map((group) => (
          <ZoneGroupSection
            key={group.zone?.id ?? "unassigned"}
            group={group}
            currency={basket.currency}
          />
        ))}
      </div>

      <div className="mt-10 flex flex-col items-end gap-2 border-t border-border pt-6">
        {basket.totalWeightKg !== null ? (
          <p className="text-body-sm text-stone-600">
            {t("totalWeight")}: {basket.totalWeightKg.toFixed(1)} kg
          </p>
        ) : null}
        <p className="text-heading-md">
          {t("subtotal")}: {basket.currency} {basket.subtotal?.toFixed(2) ?? "0.00"}
        </p>
        <div className="flex gap-3">
          <Link
            href="/basket/print"
            className={buttonVariants({ variant: "secondary" })}
          >
            {t("printLink")}
          </Link>
          <Link
            href="/basket/request"
            className={buttonVariants({ variant: "primary" })}
          >
            {t("requestQuote")}
          </Link>
        </div>
      </div>
    </main>
  );
}
