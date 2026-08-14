import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { CompareToggleButton } from "@/components/catalog/compare-toggle-button";
import { ProductGallery } from "@/components/catalog/product-gallery";
import { QuantityCalculator } from "@/components/catalog/quantity-calculator";
import { SimilarProductsRail } from "@/components/catalog/similar-products-rail";
import { SpecsTable } from "@/components/catalog/specs-table";
import { WishlistButton } from "@/components/catalog/wishlist-button";
import { SampleRequestDialog } from "@/components/quote/sample-request-dialog";
import {
  getProductBySlug,
  getSameCollectionProducts,
  getSimilarProducts,
} from "@/application/use-cases/catalog/get-product-detail";
import { listActiveLocations } from "@/application/use-cases/inventory/list-locations";
import { listWishlistProductIds } from "@/application/use-cases/quote/wishlist";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import type { StockStatus } from "@/domain/product/entity";

/**
 * `/products/[slug]` — docs/02-ux-blueprint.md §3.3. The hero and thumbnail
 * strip render `product.media` (falling back to the `colorHex` swatch when
 * a product has no photos yet — see `ProductGallery`). "In this space" is
 * still not built: it needs large room-scene photography with hotspots,
 * a step beyond a plain gallery, and is still a Phase 8 ingestion concern.
 * Everything else in the spec (complete the look, similar tiles, from the
 * same collection, order a sample, WhatsApp) is wired below.
 */
export const dynamic = "force-dynamic";

const STOCK_BADGE_VARIANT: Record<
  StockStatus,
  "inStock" | "lowStock" | "outOfStock"
> = {
  in_stock: "inStock",
  low_stock: "lowStock",
  out_of_stock: "outOfStock",
  on_order: "outOfStock",
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("catalog.pdp");
  // Sequential, not Promise.all — see the memory note on withRequestContext
  // concurrency (each of these opens its own transaction against a
  // connection_limit=1 pool).
  const { product, isWishlisted, error } = await getProductBySlug(locale, slug);
  if (error) {
    return (
      <main id="main" className="mx-auto max-w-content px-gutter py-16">
        <p className="rounded-md border border-warning-600 bg-warning-50 p-6 text-body text-warning-600">
          {t("loadError")}
        </p>
      </main>
    );
  }
  if (!product) notFound();

  const { products: completeTheLook } = await getSimilarProducts(
    locale,
    product.id,
    "complete_the_look",
  );
  const { products: similar } = await getSimilarProducts(locale, product.id);
  const { products: sameCollection } = product.collectionSlug
    ? await getSameCollectionProducts(locale, product.collectionSlug, product.id)
    : { products: [] };
  const { productIds: wishlistedIds } = await listWishlistProductIds();
  const { locations } = await listActiveLocations();

  return (
    <main id="main" className="mx-auto max-w-content px-gutter py-8">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{t("breadcrumb.home")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/products">{t("breadcrumb.products")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{product.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid gap-8 lg:grid-cols-[55%_1fr]">
        <ProductGallery
          media={product.media}
          productName={product.name}
          colorHex={product.colorHex}
        />

        <div className="flex flex-col gap-4">
          <div>
            <p className="text-caption text-stone-600">{product.brand.label}</p>
            <h1 className="text-display-sm font-display">{product.name}</h1>
            <p className="text-spec text-stone-600">
              {product.sku} · {product.material.label}
            </p>
          </div>

          <p className="text-heading-md">
            {product.basePrice !== null
              ? `${product.currency} ${product.basePrice.toFixed(2)}/m²`
              : t("priceOnRequest")}
          </p>

          <dl className="grid grid-cols-2 gap-3 border-y border-border py-4 text-body-sm">
            <div>
              <dt className="text-stone-600">{t("facts.format")}</dt>
              <dd>
                {product.nominalFormat ??
                  `${String(product.widthMm)}×${String(product.heightMm)} mm`}
              </dd>
            </div>
            <div>
              <dt className="text-stone-600">{t("facts.thickness")}</dt>
              <dd>{product.thicknessMm} mm</dd>
            </div>
            <div>
              <dt className="text-stone-600">{t("facts.finish")}</dt>
              <dd>{product.finish.label}</dd>
            </div>
            <div>
              <dt className="text-stone-600">{t("facts.indoorOutdoor")}</dt>
              <dd>
                {product.isIndoor && product.isOutdoor
                  ? t("facts.both")
                  : product.isOutdoor
                    ? t("facts.outdoorOnly")
                    : t("facts.indoorOnly")}
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <Badge variant={STOCK_BADGE_VARIANT[product.stockStatus]}>
              {t(`stock.${product.stockStatus}`)}
            </Badge>
            {product.availability.length > 0 ? (
              <ul className="flex flex-col gap-1 text-body-sm text-stone-600">
                {product.availability.map((location) => (
                  <li key={location.locationId} className="flex justify-between">
                    <span>{location.locationName}</span>
                    <span className="text-spec">
                      {location.availableM2 !== null
                        ? `${String(location.availableM2)} m²`
                        : t(`stock.${location.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <QuantityCalculator
            productId={product.id}
            locale={locale}
            unitPrice={product.basePrice}
            currency={product.currency}
            m2PerBox={product.m2PerBox}
          />

          <div className="flex flex-wrap items-center gap-3">
            <WishlistButton
              productId={product.id}
              initialWishlisted={isWishlisted}
              className="border border-border"
            />
            <CompareToggleButton
              productId={product.id}
              className="border border-border"
            />
            <SampleRequestDialog productId={product.id} locations={locations} />
          </div>
        </div>
      </div>

      <div className="mt-16">
        <SpecsTable product={product} />
      </div>

      <div className="mt-16">
        <SimilarProductsRail
          title={t("completeTheLook")}
          products={completeTheLook}
          wishlistedIds={new Set(wishlistedIds)}
        />
      </div>

      <div className="mt-16">
        <SimilarProductsRail
          title={t("similarTiles")}
          products={similar}
          wishlistedIds={new Set(wishlistedIds)}
        />
      </div>

      <div className="mt-16">
        <SimilarProductsRail
          title={t("sameCollection")}
          products={sameCollection}
          wishlistedIds={new Set(wishlistedIds)}
        />
      </div>
    </main>
  );
}
