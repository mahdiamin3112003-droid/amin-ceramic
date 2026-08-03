import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { ProductCard } from "@/components/catalog/product-card";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { Hero } from "@/components/site/hero";
import { ShowroomCard } from "@/components/site/showroom-card";
import { listCollections } from "@/application/use-cases/catalog/list-collections";
import { listProducts } from "@/application/use-cases/catalog/list-products";
import { listActiveLocations } from "@/application/use-cases/inventory/list-locations";
import { listWishlistProductIds } from "@/application/use-cases/quote/wishlist";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";

/**
 * The homepage — docs/02-ux-blueprint.md §3.1. Replaces the Phase 0
 * foundation-proof demo that occupied this route.
 *
 * Sections built: hero, featured collection, in-stock-now rail, showrooms.
 * Not built (Phase 3 plan's "Out" list, each for a stated reason): the
 * "three doors" section (all three destinations are unbuilt routes), the
 * Tile Finder demo (Phase 6), and recent projects (no project data model).
 *
 * Imagery is token-derived placeholder geometry, not photography — the same
 * honest-placeholder approach Phase 2 used for product cards, swapped for
 * real assets later with no layout change.
 */
export const dynamic = "force-dynamic";

const IN_STOCK_LIMIT = 8;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("home");

  // Sequential, not Promise.all — connection_limit=1 pool (see /products).
  const { page } = await listProducts(locale, {
    availableOnly: true,
    limit: IN_STOCK_LIMIT,
  });
  const { collections } = await listCollections(locale);
  const { locations } = await listActiveLocations();
  const { productIds: wishlistedIds } = await listWishlistProductIds();

  const featured = collections.find((c) => c.isFeatured) ?? collections[0] ?? null;
  const wishlisted = new Set(wishlistedIds);

  return (
    <>
      <main id="main">
        <Hero
          eyebrow={t("heroEyebrow")}
          title={t("heroTitle")}
          lede={t("heroLede")}
          ctaLabel={t("heroCta")}
          secondaryCtaLabel={t("heroSecondaryCta")}
          scrollHint={t("scrollHint")}
        />

        {/* ── Featured collection ─────────────────────────────────────── */}
        {featured ? (
          <ScrollReveal className="border-b border-border">
            <section className="mx-auto flex max-w-content flex-col gap-4 px-gutter py-16">
              <p className="text-caption tracking-widest text-stone-600 uppercase">
                {t("featuredEyebrow")}
              </p>
              <h2 className="font-display text-display-md">{featured.name}</h2>
              {featured.description ? (
                <p className="max-w-prose text-body text-stone-600">
                  {featured.description}
                </p>
              ) : null}
              <Link
                href={`/collections/${featured.slug}`}
                className={`${buttonVariants({ variant: "secondary" })} w-fit`}
              >
                {t("viewCollection")}
              </Link>
            </section>
          </ScrollReveal>
        ) : null}

        {/* ── In stock now ────────────────────────────────────────────── */}
        {page && page.items.length > 0 ? (
          <ScrollReveal className="border-b border-border">
            <section className="mx-auto flex max-w-content flex-col gap-6 px-gutter py-16">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-heading-lg">{t("inStockTitle")}</h2>
                <Link
                  href="/products"
                  className="text-body-sm text-primary underline underline-offset-4"
                >
                  {t("viewAll")}
                </Link>
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
            </section>
          </ScrollReveal>
        ) : null}

        {/* ── Showrooms ───────────────────────────────────────────────── */}
        {locations.length > 0 ? (
          <ScrollReveal>
            <section className="mx-auto flex max-w-content flex-col gap-6 px-gutter py-16">
              <h2 className="text-heading-lg">{t("showroomsTitle")}</h2>
              <p className="max-w-prose text-body-sm text-stone-600">
                {t("showroomsLede")}
              </p>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {locations.map((location) => (
                  <li key={location.id}>
                    <ShowroomCard location={location} />
                  </li>
                ))}
              </ul>
            </section>
          </ScrollReveal>
        ) : null}
      </main>
    </>
  );
}
