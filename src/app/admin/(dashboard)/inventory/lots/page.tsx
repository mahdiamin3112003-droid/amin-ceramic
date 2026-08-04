import type { Metadata } from "next";

import { EmptyState } from "@/app/admin/(dashboard)/empty-state";

import { InventoryTabs } from "@/app/admin/(dashboard)/inventory/inventory-tabs";
import { listLotsForAdmin } from "@/application/use-cases/admin/inventory";

export const metadata: Metadata = { title: "Stock lots" };

export default async function AdminLotsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; location?: string; page?: string }>;
}) {
  const { product, location, page } = await searchParams;
  const parsed = Number.parseInt(page ?? "1", 10);

  const lots = await listLotsForAdmin({
    ...(product ? { productId: product } : {}),
    ...(location ? { locationId: location } : {}),
    page: Number.isNaN(parsed) ? 1 : parsed,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-heading-md">Stock lots</h1>
        <p className="mt-1 text-body-sm text-stone-600">
          Lot, caliber and shade are what decide whether a large order can be filled
          from one batch — tiles from different lots rarely match.
        </p>
      </div>

      <InventoryTabs active="/admin/inventory/lots" />

      {lots.rows.length === 0 ? (
        <EmptyState
          title="No lots recorded"
          description="A lot is created automatically the first time you record a receipt against a lot number."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full min-w-3xl border-collapse text-body-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="p-3 text-start font-medium">
                  SKU
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Lot
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Caliber / shade
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Location
                </th>
                <th scope="col" className="p-3 text-end font-medium">
                  Quantity
                </th>
                <th scope="col" className="p-3 text-end font-medium">
                  Available
                </th>
                <th scope="col" className="p-3 text-end font-medium">
                  Boxes
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {lots.rows.map((lot) => (
                <tr key={lot.id} className="border-b border-border last:border-b-0">
                  <td className="p-3 text-caption font-mono tabular-nums">
                    {lot.sku}
                  </td>
                  <td className="p-3 text-caption font-mono">{lot.lotNumber}</td>
                  <td className="p-3 text-caption font-mono text-stone-600">
                    {lot.caliber ?? "—"} / {lot.shadeCode ?? "—"}
                  </td>
                  <td className="p-3">{lot.locationName}</td>
                  <td className="p-3 text-end font-mono tabular-nums">
                    {lot.quantityM2.toFixed(2)}
                  </td>
                  <td className="p-3 text-end font-mono font-medium tabular-nums">
                    {lot.availableM2.toFixed(2)}
                  </td>
                  <td className="p-3 text-end font-mono tabular-nums">
                    {lot.boxes ?? "—"}
                  </td>
                  <td className="p-3 capitalize">
                    {lot.status.replace(/_/g, " ")}
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
