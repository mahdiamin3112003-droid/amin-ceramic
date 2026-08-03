import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { ProductCard } from "@/components/catalog/product-card";
import { listWishlistProducts } from "@/application/use-cases/quote/wishlist";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";

/**
 * `/wishlist` — the saved-items page behind the header's heart icon.
 * `saved_item` is keyed on the `ac_vid` visitor (docs/03-database-design.md
 * §8.1), so no account is needed; a visitor with no cookie yet simply sees
 * the empty state.
 *
 * Lives in the `(catalog)` route group so the compare tray's provider wraps
 * it too — a saved product's card carries the same compare toggle as
 * everywhere else.
 */
export const dynamic = "force-dynamic";

export default async function WishlistPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("wishlist");
  const { products, error } = await listWishlistProducts(locale);

  return (
    <main id="main" className="mx-auto max-w-content px-gutter py-8">
      <h1 className="mb-6 font-display text-display-md">{t("title")}</h1>

      {error ? (
        <p className="rounded-md border border-warning-600 bg-warning-50 p-6 text-body text-warning-600">
          {t("loadError")}
        </p>
      ) : products.length === 0 ? (
        <div className="py-16 text-center">
          <p className="mb-6 text-body text-stone-600">{t("empty")}</p>
          <Link href="/products" className={buttonVariants({ variant: "primary" })}>
            {t("browseProducts")}
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} isWishlisted />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
