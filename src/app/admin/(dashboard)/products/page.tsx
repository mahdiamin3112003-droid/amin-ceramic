import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/app/admin/(dashboard)/empty-state";
import { StatusBadge } from "@/app/admin/(dashboard)/products/status-badge";
import { ProductFilters } from "@/app/admin/(dashboard)/products/product-filters";
import { Button } from "@/components/ui/button";
import { PRODUCT_STATUSES, type ProductStatus } from "@/domain/admin/product";
import {
  listProductsForAdmin,
  getProductLookups,
} from "@/application/use-cases/admin/products";
import { hasPermission } from "@/application/auth/authorize";

export const metadata: Metadata = { title: "Products" };

interface SearchParams {
  q?: string;
  status?: string;
  brand?: string;
  collection?: string;
  page?: string;
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  // Narrowed against the known set rather than passed through — a
  // `?status=` the enum doesn't contain should be ignored, not sent to
  // Postgres to fail.
  const status = PRODUCT_STATUSES.includes(params.status as ProductStatus)
    ? (params.status as ProductStatus)
    : undefined;

  const page = Number.parseInt(params.page ?? "1", 10);

  const [result, lookups, mayCreate] = await Promise.all([
    listProductsForAdmin({
      ...(params.q ? { query: params.q } : {}),
      ...(status ? { status } : {}),
      ...(params.brand ? { brandId: params.brand } : {}),
      ...(params.collection ? { collectionId: params.collection } : {}),
      page: Number.isNaN(page) ? 1 : page,
    }),
    getProductLookups(),
    hasPermission("product.create"),
  ]);

  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  // Which of the two empty states applies — see EmptyState's doc comment.
  const hasFilters = Boolean(
    params.q ?? params.status ?? params.brand ?? params.collection,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-heading-md">Products</h1>
          <p className="mt-1 text-body-sm text-stone-600">
            {result.total} {result.total === 1 ? "product" : "products"}
          </p>
        </div>
        {/*
          The button is hidden without `product.create`, and /new checks the
          same permission server-side. Hiding is the courtesy; the check is
          the control.
        */}
        {mayCreate ? (
          <Button asChild>
            <Link href="/admin/products/new">New product</Link>
          </Button>
        ) : null}
      </div>

      <ProductFilters brands={lookups.brands} collections={lookups.collections} />

      {result.rows.length === 0 ? (
        hasFilters ? (
          <EmptyState
            variant="no-results"
            title="No products match those filters"
            description="Try a broader search, or clear the filters to see the whole catalogue."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/admin/products">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No products yet"
            description="Products you add appear here as drafts until they have the copy and imagery needed to publish."
            action={
              mayCreate ? (
                <Button asChild>
                  <Link href="/admin/products/new">Add the first product</Link>
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        // The table scrolls inside its own container rather than pushing the
        // page sideways — a horizontally scrolling admin page is unusable.
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full min-w-3xl border-collapse text-body-sm">
            <thead>
              <tr className="border-b border-border text-start">
                <th scope="col" className="p-3 text-start font-medium">
                  Product
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  SKU
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Status
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Format
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Price
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Locales
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0">
                  <td className="p-3">
                    <Link
                      href={`/admin/products/${row.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.name}
                    </Link>
                    <span className="block text-caption text-stone-500">
                      {row.brandName ?? "—"}
                      {row.collectionName ? ` · ${row.collectionName}` : ""}
                    </span>
                  </td>
                  {/* Tabular so SKUs align down the column and scan as a list. */}
                  <td className="p-3 text-caption font-mono tabular-nums">
                    {row.sku}
                  </td>
                  <td className="p-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="p-3 text-caption font-mono tabular-nums">
                    {row.nominalFormat ?? "—"}
                  </td>
                  <td className="p-3 text-caption font-mono tabular-nums">
                    {row.basePrice === null
                      ? "—"
                      : `${row.currency} ${row.basePrice.toFixed(2)}`}
                  </td>
                  <td className="p-3">
                    <span className="text-caption font-mono uppercase">
                      {row.translatedLocales.length > 0
                        ? row.translatedLocales.join(" · ")
                        : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lastPage > 1 ? (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between gap-4"
        >
          <PageLink
            params={params}
            page={result.page - 1}
            disabled={result.page <= 1}
          >
            Previous
          </PageLink>
          <span className="text-body-sm text-stone-600">
            Page <span className="tabular-nums">{result.page}</span> of{" "}
            <span className="tabular-nums">{lastPage}</span>
          </span>
          <PageLink
            params={params}
            page={result.page + 1}
            disabled={result.page >= lastPage}
          >
            Next
          </PageLink>
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: SearchParams;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-body-sm text-stone-500">{children}</span>;
  }

  const search = new URLSearchParams();
  // `Object.entries` widens the values to `any`; the explicit annotation
  // keeps this honest rather than silencing the rule.
  for (const [key, value] of Object.entries(params) as [
    string,
    string | undefined,
  ][]) {
    if (value && key !== "page") search.set(key, value);
  }
  search.set("page", String(page));

  return (
    <Link
      href={`/admin/products?${search.toString()}`}
      className="text-body-sm hover:underline"
    >
      {children}
    </Link>
  );
}
