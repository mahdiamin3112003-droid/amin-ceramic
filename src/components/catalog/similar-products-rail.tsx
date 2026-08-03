import { ProductCard } from "@/components/catalog/product-card";
import type { ProductSummary } from "@/domain/product/entity";

/**
 * Generic labelled product rail — docs/02-ux-blueprint.md §3.3 items 10–12:
 * "Complete the look", "Similar tiles" and "From the same collection" are
 * all the same shape (a titled row of cards), differing only in which
 * relation query fed them and the label over the row.
 */
export function SimilarProductsRail({
  title,
  products,
  wishlistedIds,
}: {
  title: string;
  products: readonly ProductSummary[];
  wishlistedIds: ReadonlySet<string>;
}) {
  if (products.length === 0) return null;

  return (
    <section className="flex flex-col gap-6 border-t border-border pt-12">
      <h2 className="text-heading-md">{title}</h2>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard
              product={product}
              isWishlisted={wishlistedIds.has(product.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
