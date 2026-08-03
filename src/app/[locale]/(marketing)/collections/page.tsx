import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { listCollections } from "@/application/use-cases/catalog/list-collections";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";

/**
 * `/collections` — docs/02-ux-blueprint.md §1.1's COLLECTION INDEX.
 *
 * No hero imagery: `collection.heroMediaId` points at a `media_asset` row,
 * and no media pipeline exists until Phase 8 — the card uses the brand
 * gradient instead, same placeholder approach as the homepage hero.
 */
export const dynamic = "force-dynamic";

export default async function CollectionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("collections");
  const { collections, error } = await listCollections(locale);

  return (
    <main id="main" className="mx-auto max-w-content px-gutter py-8">
      <h1 className="mb-2 font-display text-display-md">{t("title")}</h1>
      <p className="mb-8 max-w-prose text-body-sm text-stone-600">
        {t("subtitle")}
      </p>

      {error ? (
        <p className="rounded-md border border-warning-600 bg-warning-50 p-6 text-body text-warning-600">
          {t("loadError")}
        </p>
      ) : collections.length === 0 ? (
        <p className="py-16 text-center text-body text-stone-600">{t("empty")}</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection, index) => (
            <li key={collection.id}>
              <ScrollReveal delay={Math.min(index, 5) * 0.06}>
                <Link
                  href={`/collections/${collection.slug}`}
                  className="flex flex-col overflow-hidden rounded-md border border-border transition-surface duration-quick ease-material hover:shadow-hover focus-visible:outline-none"
                >
                  <div
                    className="aspect-[4/3] w-full bg-gradient-to-br from-navy-700 via-blue-500 to-cyan-400"
                    aria-hidden="true"
                  />
                  <div className="flex flex-col gap-2 p-5">
                    <h2 className="font-display text-heading-md">
                      {collection.name}
                    </h2>
                    {collection.description ? (
                      <p className="line-clamp-3 text-body-sm text-stone-600">
                        {collection.description}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </ScrollReveal>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
