import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { CompareToggleButton } from "@/components/catalog/compare-toggle-button";
import { QuickAddButton } from "@/components/catalog/quick-add-button";
import { WishlistButton } from "@/components/catalog/wishlist-button";
import { Link } from "@/i18n/navigation";
import type { ProductSummary, StockStatus } from "@/domain/product/entity";

/**
 * Grid card — docs/02-ux-blueprint.md §3.2: "Card shows finish and stock
 * without hovering. Hover-only information fails on touch."
 *
 * No product media pipeline exists yet (Phase 2 scope, see the plan's
 * "Out" list — ingestion is Phase 8), so `primaryMediaId` is currently
 * always null from seed data. The colour swatch below is a deliberate
 * placeholder for that gap, not a final visual — it uses the product's own
 * `colorHex`, so it is at least true to the tile rather than a generic grey box.
 */

const STOCK_BADGE_VARIANT: Record<
  StockStatus,
  "inStock" | "lowStock" | "outOfStock"
> = {
  in_stock: "inStock",
  low_stock: "lowStock",
  out_of_stock: "outOfStock",
  on_order: "outOfStock",
};

export function ProductCard({
  product,
  isWishlisted,
}: {
  product: ProductSummary;
  isWishlisted: boolean;
}) {
  const t = useTranslations("catalog.card");

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-md border border-border bg-background">
      <div className="relative aspect-square w-full overflow-hidden bg-stone-100">
        <div
          className="absolute inset-0"
          style={{ backgroundColor: product.colorHex ?? undefined }}
          aria-hidden="true"
        />
        <div className="absolute end-2 top-2 flex flex-col gap-1">
          <WishlistButton productId={product.id} initialWishlisted={isWishlisted} />
          <CompareToggleButton productId={product.id} />
        </div>
        {product.isNew ? (
          <Badge variant="new" className="absolute start-2 top-2">
            {t("new")}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link
          href={`/products/${product.slug}`}
          className="flex flex-col gap-1 focus-visible:outline-none"
        >
          <h3 className="text-body-sm font-medium text-foreground">
            {product.name}
          </h3>
          <p className="text-caption text-stone-600">
            {product.nominalFormat ??
              `${String(product.widthMm)}×${String(product.heightMm)}`}{" "}
            · {product.finish.label}
          </p>
        </Link>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="flex flex-col gap-1">
            <span className="text-spec">
              {product.basePrice !== null
                ? `${product.currency} ${product.basePrice.toFixed(2)}/m²`
                : t("priceOnRequest")}
            </span>
            <Badge variant={STOCK_BADGE_VARIANT[product.stockStatus]}>
              {t(`stock.${product.stockStatus}`)}
            </Badge>
          </div>
          <QuickAddButton productId={product.id} m2PerBox={product.m2PerBox} />
        </div>
      </div>
    </article>
  );
}
