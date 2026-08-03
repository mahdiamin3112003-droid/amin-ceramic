"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/catalog/product-card";
import type { ProductListingPage } from "@/domain/catalog/entity";
import type { ProductSummary } from "@/domain/product/entity";

/**
 * "Load more" button, not infinite scroll — docs/02-ux-blueprint.md §3.2:
 * "infinite scroll destroys back-button behaviour and makes the footer
 * unreachable." Appends client-side via `/api/v1/products`, reusing the
 * exact filter the server-rendered first page used.
 */
export function ProductGrid({
  initialPage,
  locale,
  wishlistedIds,
}: {
  initialPage: ProductListingPage;
  locale: string;
  wishlistedIds: ReadonlySet<string>;
}) {
  const t = useTranslations("catalog.grid");
  const searchParams = useSearchParams();
  const [items, setItems] = useState<readonly ProductSummary[]>(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [isPending, startTransition] = useTransition();

  function loadMore() {
    if (!nextCursor) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("locale", locale);
    params.set("cursor", nextCursor);

    startTransition(() => {
      void (async () => {
        const response = await fetch(`/api/v1/products?${params.toString()}`);
        if (!response.ok) return;
        const { data } = (await response.json()) as { data: ProductListingPage };
        setItems((prev) => [...prev, ...data.items]);
        setNextCursor(data.nextCursor);
      })();
    });
  }

  if (items.length === 0) {
    return (
      <p className="py-16 text-center text-body text-stone-600">{t("empty")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((product) => (
          <li key={product.id}>
            <ProductCard
              product={product}
              isWishlisted={wishlistedIds.has(product.id)}
            />
          </li>
        ))}
      </ul>
      {nextCursor ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={loadMore}
            loading={isPending}
            loadingLabel={t("loading")}
          >
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
