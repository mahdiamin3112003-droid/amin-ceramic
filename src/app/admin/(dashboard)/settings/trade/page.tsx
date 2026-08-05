import type { Metadata } from "next";

import { EmptyState } from "@/app/admin/(dashboard)/empty-state";
import { SettingsTabs } from "@/app/admin/(dashboard)/settings/settings-tabs";
import { TradeAccountsTable } from "@/app/admin/(dashboard)/settings/trade/trade-table";
import {
  listPriceTiersForAdmin,
  listTradeAccountsForAdmin,
} from "@/application/use-cases/admin/people";

export const metadata: Metadata = { title: "Trade accounts" };

export default async function TradeAccountsPage() {
  const [accounts, tiers] = await Promise.all([
    listTradeAccountsForAdmin({}),
    listPriceTiersForAdmin(),
  ]);

  const pending = accounts.filter((a) => a.status === "pending").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h4 font-display">Trade accounts</h1>
        <p className="mt-1 max-w-2xl text-body-sm leading-relaxed text-stone-600">
          {pending > 0
            ? `${String(pending)} awaiting review. `
            : "Nothing awaiting review. "}
          Approving assigns a price tier — that tier is what the customer is quoted
          from then on.
        </p>
      </div>

      <SettingsTabs active="/admin/settings/trade" />

      {accounts.length === 0 ? (
        <EmptyState
          title="No trade applications yet"
          description="Designers and contractors who apply for trade pricing appear here for review."
        />
      ) : tiers.length === 0 ? (
        // Approving without a tier is refused, so say so before someone
        // tries rather than after.
        <EmptyState
          variant="no-results"
          title="No price tiers defined"
          description="A trade account cannot be approved without a tier to put it on, and none are seeded yet."
        />
      ) : (
        <TradeAccountsTable accounts={accounts} tiers={tiers} />
      )}
    </div>
  );
}
