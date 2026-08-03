import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FilterRail } from "@/components/catalog/filter-rail";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Toolbar } from "@/components/catalog/toolbar";
import { toProductFilter } from "@/application/mappers/product-filter";
import { listProducts } from "@/application/use-cases/catalog/list-products";
import { listWishlistProductIds } from "@/application/use-cases/quote/wishlist";
import { isLocale } from "@/i18n/routing";
import { productFilterQuerySchema } from "@/lib/validation/catalog";

/**
 * `/products` — docs/02-ux-blueprint.md §3.2. Server-rendered first paint
 * (§2.1: reads call the use-case directly, no round trip through
 * `/api/v1/products`); the filter rail and "Load more" then refine
 * client-side against that same API route.
 */
export const dynamic = "force-dynamic";

function toStringRecord(
  searchParams: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") record[key] = value;
  }
  return record;
}

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const rawSearchParams = await searchParams;
  const query = productFilterQuerySchema.parse({
    ...toStringRecord(rawSearchParams),
    locale,
  });
  const filter = toProductFilter(query);

  // Sequential, not Promise.all: RUNTIME_DATABASE_URL is a pgbouncer
  // transaction-mode pool with connection_limit=1 (docs/03-database-design.md
  // §16), and each use-case opens its own withRequestContext transaction —
  // running two concurrently starves one of them ("Unable to start a
  // transaction in the given time"), found by hitting this page live.
  const t = await getTranslations("catalog");
  const { page, error } = await listProducts(locale, filter);
  const { productIds: wishlistedIds } = await listWishlistProductIds();

  return (
    <main id="main" className="min-h-dvh">
      <header className="border-b border-border px-gutter py-8">
        <div className="mx-auto flex max-w-content flex-col gap-2">
          <h1 className="font-display text-display-md">{t("title")}</h1>
          <p className="max-w-prose text-body-sm text-stone-600">{t("subtitle")}</p>
        </div>
      </header>

      <div className="mx-auto max-w-content px-gutter py-8">
        {error || !page ? (
          <p className="rounded-md border border-warning-600 bg-warning-50 p-6 text-body text-warning-600">
            {t("loadError")}
          </p>
        ) : (
          <div className="flex flex-col gap-8 lg:flex-row">
            <aside className="w-full shrink-0 lg:w-56">
              <FilterRail
                facets={page.facets}
                activeBrands={filter.brandSlugs ?? []}
                activeMaterials={filter.materialKeys ?? []}
                activeFinishes={filter.finishKeys ?? []}
                activeLooks={filter.surfaceLookKeys ?? []}
                activeColors={filter.colorFamilyKeys ?? []}
                activeSlipRatings={filter.slipRatings ?? []}
                activePriceRange={filter.priceRange ?? null}
              />
            </aside>
            <div className="flex-1 flex-col gap-6">
              <Toolbar totalCount={page.totalCount} facets={page.facets} />
              <div className="pt-6">
                <ProductGrid
                  initialPage={page}
                  locale={locale}
                  wishlistedIds={new Set(wishlistedIds)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
