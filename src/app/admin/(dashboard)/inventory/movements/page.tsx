import type { Metadata } from "next";

import { EmptyState } from "@/app/admin/(dashboard)/empty-state";

import { InventoryTabs } from "@/app/admin/(dashboard)/inventory/inventory-tabs";
import { listMovementsForAdmin } from "@/application/use-cases/admin/inventory";

export const metadata: Metadata = { title: "Stock movements" };

export default async function AdminMovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; location?: string; page?: string }>;
}) {
  const { product, location, page } = await searchParams;
  const parsed = Number.parseInt(page ?? "1", 10);

  const movements = await listMovementsForAdmin({
    ...(product ? { productId: product } : {}),
    ...(location ? { locationId: location } : {}),
    page: Number.isNaN(parsed) ? 1 : parsed,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-heading-md">Stock movements</h1>
        <p className="mt-1 text-body-sm text-stone-600">
          Append-only. Corrections are new entries, never edits — so this list is
          the complete history of how the totals got where they are.
        </p>
      </div>

      <InventoryTabs active="/admin/inventory/movements" />

      {movements.rows.length === 0 ? (
        <EmptyState
          title="No movements recorded"
          description="Every receipt, adjustment and write-off is appended here, and nothing is ever edited or removed."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full min-w-3xl border-collapse text-body-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="p-3 text-start font-medium">
                  When
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  SKU
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Lot
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Type
                </th>
                <th scope="col" className="p-3 text-end font-medium">
                  Δ m²
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Reason
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  By
                </th>
              </tr>
            </thead>
            <tbody>
              {movements.rows.map((movement) => (
                <tr
                  key={movement.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="p-3 text-caption font-mono whitespace-nowrap tabular-nums">
                    {/*
                      Fixed locale and UTC. An admin ledger read by staff in
                      different places must not render the same row with two
                      different timestamps, and the server/client hydration
                      mismatch that a locale-dependent format produces is
                      real as well as cosmetic.
                    */}
                    {movement.occurredAt
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </td>
                  <td className="p-3 text-caption font-mono tabular-nums">
                    {movement.sku}
                  </td>
                  <td className="p-3 text-caption font-mono">
                    {movement.lotNumber}
                  </td>
                  <td className="p-3 capitalize">
                    {movement.movementType.replace(/_/g, " ")}
                  </td>
                  <td
                    className={
                      movement.quantityM2 < 0
                        ? "p-3 text-end font-mono text-danger-600 tabular-nums"
                        : "p-3 text-end font-mono text-success-600 tabular-nums"
                    }
                  >
                    {movement.quantityM2 > 0 ? "+" : ""}
                    {movement.quantityM2.toFixed(2)}
                  </td>
                  <td className="p-3 text-stone-600">{movement.reason ?? "—"}</td>
                  <td className="p-3 text-caption text-stone-600">
                    {movement.performedByEmail ?? "system"}
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
