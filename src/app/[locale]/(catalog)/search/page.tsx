import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FilterRail } from "@/components/catalog/filter-rail";
import { ProductGrid } from "@/components/catalog/product-grid";
import { SearchBox } from "@/components/catalog/search-box";
import { Toolbar } from "@/components/catalog/toolbar";
import { toProductFilter } from "@/application/mappers/product-filter";
import { searchProducts } from "@/application/use-cases/catalog/search";
import { listWishlistProductIds } from "@/application/use-cases/quote/wishlist";
import { isLocale } from "@/i18n/routing";
import { productFilterQuerySchema } from "@/lib/validation/catalog";

/**
 * `/search` — docs/04-api-architecture.md §7.2: "search reuses the listing
 * facet contract" (`ProductListingPage`), so this page is `/products`'s
 * page (task #35) plus a query box, not a parallel implementation.
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

export default async function SearchPage({
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

  // Sequential, not Promise.all — see the connection_limit=1 pool note on
  // the /products page; each of these opens its own DB transaction.
  const t = await getTranslations("catalog.search");
  const { page, error } = query.q
    ? await searchProducts(locale, filter)
    : { page: null, error: null };
  const { productIds: wishlistedIds } = await listWishlistProductIds();

  return (
    <main id="main" className="min-h-dvh">
      <header className="border-b border-border px-gutter py-8">
        <div className="mx-auto flex max-w-content flex-col gap-4">
          <h1 className="font-display text-display-md">{t("title")}</h1>
          <SearchBox initialQuery={query.q ?? ""} />
        </div>
      </header>

      <div className="mx-auto max-w-content px-gutter py-8">
        {!query.q ? (
          <p className="py-16 text-center text-body text-stone-600">
            {t("prompt")}
          </p>
        ) : error || !page ? (
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
