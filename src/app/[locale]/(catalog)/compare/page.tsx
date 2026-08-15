import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { QuickAddButton } from "@/components/catalog/quick-add-button";
import { compareProducts } from "@/application/use-cases/catalog/compare";
import type { ProductId } from "@/domain/product/entity";
import { isLocale } from "@/i18n/routing";

/**
 * `/compare?ids=` — docs/02-ux-blueprint.md §3.6: sticky label column,
 * differing rows highlighted, per-column add-to-basket. Reached today only
 * by a hand-built `ids=` link — the listing card's "⇄" compare-tray
 * selector (docs' persistent bottom bar) isn't wired yet, a scope trim
 * flagged in `src/components/catalog/product-card.tsx`'s absence of a
 * compare toggle, not an oversight here.
 */
export const dynamic = "force-dynamic";

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("catalog.compare");
  const { ids } = await searchParams;
  const productIds = (ids ?? "").split(",").filter(Boolean) as ProductId[];

  if (productIds.length < 2) {
    return (
      <main id="main" className="mx-auto max-w-content px-gutter py-16">
        <h1 className="mb-4 font-display text-display-md">{t("title")}</h1>
        <p className="text-body text-stone-600">{t("needMore")}</p>
      </main>
    );
  }

  const { products, rows, error } = await compareProducts(locale, productIds);

  if (error) {
    return (
      <main id="main" className="mx-auto max-w-content px-gutter py-16">
        <p className="rounded-md border border-warning-600 bg-warning-50 p-6 text-body text-warning-600">
          {error}
        </p>
      </main>
    );
  }

  const groupTitles: Record<string, string> = {
    dimensions: t("groups.dimensions"),
    material: t("groups.material"),
    surface: t("groups.surface"),
    performance: t("groups.performance"),
    packaging: t("groups.packaging"),
    price: t("groups.price"),
  };

  let lastGroup: string | null = null;

  return (
    <main id="main" className="mx-auto max-w-content px-gutter py-8">
      <h1 className="mb-6 font-display text-display-md">{t("title")}</h1>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body-sm">
          <thead>
            <tr>
              <th className="sticky start-0 z-10 w-40 bg-background p-3 text-start" />
              {products.map((product) => (
                <th
                  key={product.id}
                  className="min-w-48 border-s border-border p-3 text-start align-top"
                >
                  <div className="flex flex-col gap-2">
                    <div className="aspect-square w-full overflow-hidden rounded-md bg-stone-100">
                      {product.primaryImageUrl ? (
                        // alt="" — the product name is the very next
                        // element in this cell.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.primaryImageUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div
                          className="h-full w-full"
                          style={{ backgroundColor: product.colorHex ?? undefined }}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <span className="font-medium">{product.name}</span>
                    <span className="text-spec text-stone-600">{product.sku}</span>
                    <QuickAddButton
                      productId={product.id}
                      m2PerBox={product.m2PerBox}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const showGroupHeader = row.groupKey !== lastGroup;
              lastGroup = row.groupKey;
              return (
                <>
                  {showGroupHeader ? (
                    <tr key={`${row.groupKey}-header`}>
                      <td
                        colSpan={products.length + 1}
                        className="sticky start-0 bg-stone-50 px-3 py-2 text-caption font-medium text-stone-600 uppercase"
                      >
                        {groupTitles[row.groupKey] ?? row.groupKey}
                      </td>
                    </tr>
                  ) : null}
                  <tr
                    key={row.attributeKey}
                    className={row.differs ? "bg-cyan-50" : undefined}
                  >
                    <th className="sticky start-0 z-10 bg-background p-3 text-start font-normal text-stone-600">
                      {row.label}
                    </th>
                    {row.values.map((value, index) => (
                      <td
                        key={index}
                        className="border-s border-border p-3 text-spec"
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
