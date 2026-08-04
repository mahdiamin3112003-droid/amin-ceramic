import type { Metadata } from "next";

import { EmptyState } from "@/app/admin/(dashboard)/empty-state";

import { InventoryTabs } from "@/app/admin/(dashboard)/inventory/inventory-tabs";
import { MovementForm } from "@/app/admin/(dashboard)/inventory/movement-form";
import { hasPermission } from "@/application/auth/authorize";
import {
  getInventoryTargets,
  listStockForAdmin,
} from "@/application/use-cases/admin/inventory";

export const metadata: Metadata = { title: "Inventory" };

/**
 * Stock levels — the `location_id IS NULL` roll-up row per product, which
 * is the tenant-wide total the catalogue's availability facet also reads.
 */
export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; low?: string; page?: string }>;
}) {
  const { q, low, page } = await searchParams;
  const parsed = Number.parseInt(page ?? "1", 10);

  const [stock, mayAdjust] = await Promise.all([
    listStockForAdmin({
      ...(q ? { query: q } : {}),
      ...(low === "1" ? { lowOnly: true } : {}),
      page: Number.isNaN(parsed) ? 1 : parsed,
    }),
    hasPermission("inventory.adjust"),
  ]);

  // Only fetched when it will be used — the product list is capped at 500
  // rows and there is no reason to pay for it on a read-only visit.
  const targets = mayAdjust ? await getInventoryTargets() : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-heading-md">Inventory</h1>
        <p className="mt-1 text-body-sm text-stone-600">
          Totals are derived from the movement ledger — they are never edited
          directly.
        </p>
      </div>

      <InventoryTabs active="/admin/inventory" />

      {targets ? (
        <MovementForm products={targets.products} locations={targets.locations} />
      ) : null}

      {stock.rows.length === 0 ? (
        <EmptyState
          title="No stock records yet"
          description="Stock appears here once the first movement is recorded against a product and location."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full min-w-3xl border-collapse text-body-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="p-3 text-start font-medium">
                  Product
                </th>
                <th scope="col" className="p-3 text-end font-medium">
                  On hand (m²)
                </th>
                <th scope="col" className="p-3 text-end font-medium">
                  Reserved
                </th>
                <th scope="col" className="p-3 text-end font-medium">
                  Available
                </th>
                <th scope="col" className="p-3 text-end font-medium">
                  Lots
                </th>
                <th scope="col" className="p-3 text-end font-medium">
                  Largest lot
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {stock.rows.map((row) => (
                <tr
                  key={row.productId}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="p-3">
                    <span className="font-medium">{row.name}</span>
                    <span className="block text-caption font-mono text-stone-500">
                      {row.sku}
                    </span>
                  </td>
                  {/*
                    Right-aligned and tabular: these are quantities that get
                    compared down the column, and proportional digits make
                    that impossible to do by eye.
                  */}
                  <td className="p-3 text-end font-mono tabular-nums">
                    {row.quantityM2.toFixed(2)}
                  </td>
                  <td className="p-3 text-end font-mono text-stone-600 tabular-nums">
                    {row.reservedM2.toFixed(2)}
                  </td>
                  <td className="p-3 text-end font-mono font-medium tabular-nums">
                    {row.availableM2.toFixed(2)}
                  </td>
                  <td className="p-3 text-end font-mono tabular-nums">
                    {row.lotCount}
                  </td>
                  <td className="p-3 text-end font-mono tabular-nums">
                    {row.largestLotM2 === null ? "—" : row.largestLotM2.toFixed(2)}
                  </td>
                  <td className="p-3 text-body-sm capitalize">
                    {row.stockStatus.replace(/_/g, " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
