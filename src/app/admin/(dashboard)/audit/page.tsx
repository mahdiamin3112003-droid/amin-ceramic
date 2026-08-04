import type { Metadata } from "next";

import { EmptyState } from "@/app/admin/(dashboard)/empty-state";

import { listAudit } from "@/application/use-cases/admin/audit";
import { isHighSeverity } from "@/domain/admin/audit";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    actor?: string;
    action?: string;
    entity?: string;
    page?: string;
  }>;
}) {
  const { actor, action, entity, page } = await searchParams;
  const parsed = Number.parseInt(page ?? "1", 10);

  const log = await listAudit({
    ...(actor ? { actorEmail: actor } : {}),
    ...(action ? { action } : {}),
    ...(entity ? { entityId: entity } : {}),
    page: Number.isNaN(parsed) ? 1 : parsed,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-heading-md">Audit log</h1>
        <p className="mt-1 text-body-sm text-stone-600">
          Every change, written in the same transaction as the change itself.
          Nothing here can be edited or removed — the table has no UPDATE or DELETE
          grant.
        </p>
      </div>

      {/*
        A GET form, not a client component. The whole page is a server
        render over URL params, so the browser's own form submission does
        exactly the right thing with no JavaScript at all.
      */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-white p-4"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="actor" className="text-body-sm font-medium">
            Actor email
          </label>
          <input
            id="actor"
            name="actor"
            defaultValue={actor ?? ""}
            className="h-11 rounded-sm border border-stone-300 px-3 text-body-sm"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="action" className="text-body-sm font-medium">
            Action starts with
          </label>
          <input
            id="action"
            name="action"
            defaultValue={action ?? ""}
            placeholder="product."
            className="h-11 rounded-sm border border-stone-300 px-3 font-mono text-body-sm"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="entity" className="text-body-sm font-medium">
            Entity ID
          </label>
          <input
            id="entity"
            name="entity"
            defaultValue={entity ?? ""}
            className="h-11 rounded-sm border border-stone-300 px-3 font-mono text-body-sm"
          />
        </div>
        <button
          type="submit"
          className="h-11 rounded-sm bg-navy-700 px-4 text-body-sm text-white"
        >
          Filter
        </button>
      </form>

      {log.rows.length === 0 ? (
        <EmptyState
          variant="no-results"
          title="No entries match those filters"
          description="Every change is written in the same transaction as the change itself, so the log is never incomplete."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full min-w-3xl border-collapse text-body-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="p-3 text-start font-medium">
                  When (UTC)
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Actor
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Action
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Entity
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Changed
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {log.rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0">
                  <td className="p-3 text-caption font-mono whitespace-nowrap tabular-nums">
                    {row.occurredAt.toISOString().slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="p-3 text-caption">
                    {row.actorEmail ?? (
                      <span className="text-stone-500">{row.actorType}</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "p-3 text-caption font-mono",
                      isHighSeverity(row.action) && "font-medium text-danger-600",
                    )}
                  >
                    {row.action}
                  </td>
                  <td className="p-3">
                    <span className="block">
                      {row.entityLabel ?? row.entityType ?? "—"}
                    </span>
                    {row.entityId ? (
                      <span className="block text-caption font-mono text-stone-500">
                        {row.entityId}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-3 text-caption font-mono text-stone-600">
                    {row.changedFields.length > 0
                      ? row.changedFields.join(", ")
                      : "—"}
                  </td>
                  <td className="p-3 text-stone-600">{row.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-caption text-stone-500">
        Showing <span className="tabular-nums">{log.rows.length}</span> of{" "}
        <span className="tabular-nums">{log.total}</span> entries.
      </p>
    </div>
  );
}
