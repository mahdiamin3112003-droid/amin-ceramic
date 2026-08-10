import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { CatalogueView } from "@/components/catalog/catalogue-view";
import { getCollectionBySlug } from "@/application/use-cases/catalog/get-collection-detail";
import { listProducts } from "@/application/use-cases/catalog/list-products";
import { listWishlistProductIds } from "@/application/use-cases/quote/wishlist";
import { directionFor, isLocale } from "@/i18n/routing";
import { canonicalFor } from "@/lib/seo/site";

/**
 * `/collections/[slug]/catalogue` — the page-turn browse (ADR-0017).
 *
 * A presentation surface, not an indexable one: it carries no footer and no
 * navigation chrome by design, and every tile it shows already has a
 * canonical home at `/products/[slug]`. Indexing it would put a
 * chrome-less duplicate of the catalogue into search results competing
 * with the pages we actually want ranked, so it is `noindex` with the
 * canonical pointed back at the collection.
 */
export const dynamic = "force-dynamic";

const COLLECTION_PRODUCT_LIMIT = 24;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  return {
    robots: { index: false, follow: true },
    alternates: {
      canonical: isLocale(locale)
        ? canonicalFor(locale, `collections/${slug}`)
        : undefined,
    },
  };
}

export default async function CollectionCataloguePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ tile?: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  // Sequential, not Promise.all — see the pool note on /products.
  const { collection } = await getCollectionBySlug(locale, slug);
  if (!collection) notFound();

  const { page } = await listProducts(locale, {
    collectionSlug: collection.slug,
    limit: COLLECTION_PRODUCT_LIMIT,
  });
  const { productIds: wishlistedIds } = await listWishlistProductIds();

  const products = page?.items ?? [];
  const { tile } = await searchParams;

  // An unknown or absent `?tile=` opens at the first page rather than 404ing:
  // a stale link into a collection whose order changed should still land
  // somewhere useful.
  const requested = products.findIndex((p) => p.slug === tile);
  const initialIndex = requested >= 0 ? requested : 0;

  return (
    <main id="main">
      <CatalogueView
        products={products}
        collectionSlug={collection.slug}
        collectionName={collection.name}
        initialIndex={initialIndex}
        wishlistedIds={new Set(wishlistedIds)}
        isRtl={directionFor(locale) === "rtl"}
      />
    </main>
  );
}
