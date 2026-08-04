import type { ProductStatus } from "@/domain/admin/product";
import { cn } from "@/lib/utils";

/**
 * Workflow status pill.
 *
 * Not `<Badge>`: that component's variants are catalogue semantics —
 * `inStock`, `lowStock`, `discontinued` — and reusing `lowStock` to mean
 * "in review" would make the shared vocabulary lie for the sake of saving
 * a file. These are the same tokens, applied to a different meaning.
 *
 * `published` is the only status with the success green. Everything else is
 * a shade of "not live yet", and giving `review` a celebratory colour makes
 * a scan of the table read as more finished than it is.
 *
 * No `cyan-400` anywhere — it is never a text colour on a light surface
 * (CLAUDE.md, 2.0:1 fails WCAG AA).
 */
const STYLES: Readonly<Record<ProductStatus, string>> = {
  draft: "bg-stone-100 text-stone-600",
  review: "bg-warning-50 text-warning-600",
  published: "bg-success-50 text-success-600",
  archived: "bg-stone-100 text-stone-500",
  discontinued: "bg-stone-100 text-stone-600 line-through",
};

export function StatusBadge({ status }: { status: ProductStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-medium capitalize",
        STYLES[status],
      )}
    >
      {status}
    </span>
  );
}
