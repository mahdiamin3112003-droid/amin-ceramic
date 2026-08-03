import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getBasket } from "@/application/use-cases/quote/get-basket";
import { groupItemsByZone } from "@/domain/quote/entity";
import { isLocale } from "@/i18n/routing";

/**
 * `/basket/print` — the plan's PDF-export substitute (see `/basket/page.tsx`'s
 * note): no server-rendered PDF pipeline exists this phase, so this is a
 * plain, print-optimised page the browser's own print-to-PDF handles.
 * Deliberately minimal chrome — no header, no nav, no interactive controls.
 */
export const dynamic = "force-dynamic";

export default async function BasketPrintPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("quote.print");
  const { basket } = await getBasket();

  if (!basket || basket.items.length === 0) {
    return (
      <main className="p-8">
        <p>{t("empty")}</p>
      </main>
    );
  }

  const groups = groupItemsByZone(basket);

  return (
    <main className="mx-auto max-w-3xl p-8 text-foreground">
      <h1 className="mb-1 text-heading-lg font-semibold">{t("title")}</h1>
      <p className="mb-6 text-body-sm text-stone-600">
        {new Date().toLocaleDateString(locale)} · {t("reference")}: {basket.id}
      </p>

      {groups.map((group) => (
        <section key={group.zone?.id ?? "unassigned"} className="mb-6">
          <h2 className="mb-2 border-b border-border pb-1 text-heading-sm font-medium">
            {group.zone?.name ?? t("unassigned")}
          </h2>
          <table className="w-full border-collapse text-body-sm">
            <thead>
              <tr className="border-b border-border text-start">
                <th className="py-1 text-start">{t("item")}</th>
                <th className="py-1 text-end">{t("quantity")}</th>
                <th className="py-1 text-end">{t("boxes")}</th>
                <th className="py-1 text-end">{t("total")}</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((item) => (
                <tr key={item.id} className="border-b border-border">
                  <td className="py-1">
                    {item.nameSnapshot} ({item.skuSnapshot})
                  </td>
                  <td className="py-1 text-end">{item.quantityM2} m²</td>
                  <td className="py-1 text-end">{item.quantityBoxes}</td>
                  <td className="py-1 text-end">
                    {item.currencySnapshot} {item.lineTotal.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <div className="mt-8 border-t border-border pt-4 text-end">
        {basket.totalWeightKg !== null ? (
          <p className="text-body-sm text-stone-600">
            {t("totalWeight")}: {basket.totalWeightKg.toFixed(1)} kg
          </p>
        ) : null}
        <p className="text-heading-sm font-semibold">
          {t("subtotal")}: {basket.currency} {basket.subtotal?.toFixed(2) ?? "0.00"}
        </p>
      </div>
    </main>
  );
}
