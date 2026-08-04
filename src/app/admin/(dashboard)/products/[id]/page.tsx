import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductForm } from "@/app/admin/(dashboard)/products/product-form";
import { StatusBadge } from "@/app/admin/(dashboard)/products/status-badge";
import { ProductActions } from "@/app/admin/(dashboard)/products/[id]/product-actions-bar";
import { NotFoundError, hasPermission } from "@/application/auth/authorize";
import {
  getProductForAdmin,
  getProductLookups,
  getPublishBlockers,
} from "@/application/use-cases/admin/products";
import { STATUS_TRANSITIONS } from "@/domain/admin/product";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let product;
  try {
    product = await getProductForAdmin(id);
  } catch (cause) {
    // A cross-tenant or non-existent id both land here as 404 — docs/04
    // §5.1. Anything else is a genuine fault and must not be swallowed into
    // a misleading "not found".
    if (cause instanceof NotFoundError) notFound();
    throw cause;
  }

  const [lookups, mayPublish, mayDelete] = await Promise.all([
    getProductLookups(),
    hasPermission("product.publish"),
    hasPermission("product.delete"),
  ]);

  const blockers = getPublishBlockers(product);
  const enName = product.translations.find((t) => t.locale === "en")?.name;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/admin/products"
            className="text-body-sm text-stone-600 hover:underline"
          >
            ← Products
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-heading-md">
              {enName ?? product.sku}
            </h1>
            <StatusBadge status={product.status} />
          </div>
          <p className="mt-1 text-caption font-mono text-stone-500">
            {product.sku}
          </p>
        </div>

        <ProductActions
          id={product.id}
          status={product.status}
          transitions={STATUS_TRANSITIONS[product.status]}
          blockers={blockers}
          mayPublish={mayPublish}
          mayDelete={mayDelete}
        />
      </div>

      <ProductForm product={product} lookups={lookups} publishBlockers={blockers} />
    </div>
  );
}
