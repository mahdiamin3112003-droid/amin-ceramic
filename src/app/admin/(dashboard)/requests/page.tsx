import type { Metadata } from "next";

import { EmptyState } from "@/app/admin/(dashboard)/empty-state";
import { QuoteBoardView } from "@/app/admin/(dashboard)/requests/quote-board";
import { getBoardForAdmin } from "@/application/use-cases/admin/quote-requests";
import { hasPermission } from "@/application/auth/authorize";

export const metadata: Metadata = { title: "Quote requests" };

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; assigned?: string }>;
}) {
  const { source, assigned } = await searchParams;

  const [board, canRespond] = await Promise.all([
    getBoardForAdmin({
      ...(source ? { source } : {}),
      ...(assigned ? { assignedTo: assigned } : {}),
    }),
    hasPermission("request.respond"),
  ]);

  const live = Object.values(board.columns).reduce(
    (n, cards) => n + cards.length,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h4 font-display">Quote requests</h1>
          <p className="mt-1 text-body-sm text-stone-600">
            {live} open · {board.closedCount} closed. Oldest sits at the top of each
            column.
          </p>
        </div>
        {!canRespond ? (
          // Said plainly rather than leaving someone clicking at nothing.
          <p className="text-body-sm text-stone-600">
            You can read the pipeline but not move requests.
          </p>
        ) : null}
      </div>

      {live === 0 ? (
        <EmptyState
          title="No open requests"
          description="Requests submitted from the catalogue, the tile finder or the showroom arrive here. Drafts — baskets nobody submitted — are deliberately not shown."
        />
      ) : (
        <QuoteBoardView board={board} canRespond={canRespond} />
      )}
    </div>
  );
}
