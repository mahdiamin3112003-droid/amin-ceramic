import type { Metadata } from "next";
import Link from "next/link";

import { ProductForm } from "@/app/admin/(dashboard)/products/product-form";
import { getProductLookups } from "@/application/use-cases/admin/products";
import { requirePermission } from "@/application/auth/authorize";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  // Enforcement layer 2, before anything renders. The list page hides the
  // "New product" button without this permission, but hiding a link is not
  // a control — someone can type the URL.
  await requirePermission("product.create");

  const lookups = await getProductLookups();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/products"
          className="text-body-sm text-stone-600 hover:underline"
        >
          ← Products
        </Link>
        <h1 className="mt-2 font-display text-heading-md">New product</h1>
        <p className="mt-1 text-body-sm text-stone-600">
          Created as a draft. You can publish once the required copy and imagery are
          in place.
        </p>
      </div>

      <ProductForm product={null} lookups={lookups} />
    </div>
  );
}
