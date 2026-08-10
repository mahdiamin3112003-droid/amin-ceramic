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
import { buttonVariants } from "@/components/ui/button";
import { ProductCard } from "@/components/catalog/product-card";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { getCollectionBySlug } from "@/application/use-cases/catalog/get-collection-detail";
import { listProducts } from "@/application/use-cases/catalog/list-products";
import { listWishlistProductIds } from "@/application/use-cases/quote/wishlist";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";

/**
 * `/collections/[slug]` — the collection story page (docs/02 §1.1).
 * Products in the collection reuse `listProducts` with
 * `filter.collectionSlug`, which the Phase 2 repository already supports —
 * no bespoke query.
 */
export const dynamic = "force-dynamic";

const COLLECTION_PRODUCT_LIMIT = 24;

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("collections");
  const tc = await getTranslations("catalogue");

  // Sequential, not Promise.all — connection_limit=1 pool (see /products).
  const { collection, error } = await getCollectionBySlug(locale, slug);
  if (error) {
    return (
      <main id="main" className="mx-auto max-w-content px-gutter py-16">
        <p className="rounded-md border border-warning-600 bg-warning-50 p-6 text-body text-warning-600">
          {t("loadError")}
        </p>
      </main>
    );
  }
  if (!collection) notFound();

  const { page } = await listProducts(locale, {
    collectionSlug: collection.slug,
    limit: COLLECTION_PRODUCT_LIMIT,
  });
  const { productIds: wishlistedIds } = await listWishlistProductIds();
  const wishlisted = new Set(wishlistedIds);

  return (
    <main id="main">
      <section className="relative overflow-hidden border-b border-border">
        {/* Gradient + navy scrim — see the homepage hero: the scrim sets the
            contrast floor for the text above it, independent of where the
            gradient lands. */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-navy-950 via-navy-700 to-cyan-400"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-navy-950/75" aria-hidden="true" />
        <div className="relative mx-auto flex max-w-content flex-col gap-4 px-gutter py-20">
          <Breadcrumb>
            {/* eslint-disable-next-line amin/no-cyan-text -- on the navy-950/75 scrim above: 8.2:1 worst case (measured against the gradient's lightest stop, cyan-400) */}
            <BreadcrumbList className="text-cyan-100">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/collections">{t("title")}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-white">
                  {collection.name}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <h1 className="font-display text-display-lg text-white">
            {collection.name}
          </h1>
          {collection.description ? (
            // eslint-disable-next-line amin/no-cyan-text -- same navy-950/75 scrim, 8.2:1 worst case
            <p className="max-w-prose text-body-lg text-cyan-100">
              {collection.description}
            </p>
          ) : null}
        </div>
      </section>

      <ScrollReveal>
        <section className="mx-auto flex max-w-content flex-col gap-6 px-gutter py-16">
          {page && page.items.length > 0 ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <h2 className="text-heading-lg">{t("productsInCollection")}</h2>
                <div className="flex flex-wrap items-center gap-4">
                  {/* The catalogue view is offered HERE and not on /products
                      because a collection is a sequence and a filtered result
                      set is not — docs/02 §5.7, ADR-0017. */}
                  <Link
                    href={`/collections/${collection.slug}/catalogue`}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    {tc("enter")}
                  </Link>
                  <Link
                    href={`/products?collection=${collection.slug}`}
                    className="text-body-sm text-primary underline underline-offset-4"
                  >
                    {t("filterInCatalogue")}
                  </Link>
                </div>
              </div>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {page.items.map((product) => (
                  <li key={product.id}>
                    <ProductCard
                      product={product}
                      isWishlisted={wishlisted.has(product.id)}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="py-8 text-center">
              <p className="mb-6 text-body text-stone-600">{t("noProducts")}</p>
              <Link
                href="/products"
                className={buttonVariants({ variant: "primary" })}
              >
                {t("browseAll")}
              </Link>
            </div>
          )}
        </section>
      </ScrollReveal>
    </main>
  );
}
