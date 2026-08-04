import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AssignControl } from "@/app/admin/(dashboard)/requests/[id]/assign-control";
import { NotFoundError, hasPermission } from "@/application/auth/authorize";
import {
  getAssignableStaff,
  getQuoteForAdmin,
} from "@/application/use-cases/admin/quote-requests";
import {
  LOST_REASON_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
} from "@/domain/admin/quote-request";

export const metadata: Metadata = { title: "Quote request" };

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let quote;
  try {
    quote = await getQuoteForAdmin(id);
  } catch (cause) {
    // A well-formed id from another tenant is a 404, never a 403 (§5.1).
    if (cause instanceof NotFoundError) notFound();
    throw cause;
  }

  const canRespond = await hasPermission("request.respond");
  // Only fetched when it will be used — the list is meaningless to someone
  // who cannot assign.
  const staff = canRespond ? await getAssignableStaff() : [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/admin/requests"
          className="rounded-sm text-body-sm text-stone-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
        >
          ← Quote requests
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-h4 font-mono tabular-nums">{quote.reference}</h1>
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-caption font-medium">
            {STATUS_LABEL[quote.status]}
          </span>
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-caption text-stone-600">
            {SOURCE_LABEL[quote.source]}
          </span>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-body-lg">Items</h2>
            <div className="overflow-x-auto rounded-lg border border-border bg-white">
              <table className="w-full min-w-2xl border-collapse text-body-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="p-3 text-start font-medium">
                      Product
                    </th>
                    <th scope="col" className="p-3 text-end font-medium">
                      m²
                    </th>
                    <th scope="col" className="p-3 text-end font-medium">
                      Boxes
                    </th>
                    <th scope="col" className="p-3 text-end font-medium">
                      Unit
                    </th>
                    <th scope="col" className="p-3 text-end font-medium">
                      Line total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {quote.items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="p-3">
                        {/* The snapshot, not a live join — this is what was
                            quoted, whatever the product record says today. */}
                        <span className="block font-medium">{item.name}</span>
                        <span className="block text-caption font-mono text-stone-500">
                          {item.sku}
                        </span>
                        {item.notes ? (
                          <span className="mt-1 block text-caption text-stone-600">
                            {item.notes}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 text-end font-mono tabular-nums">
                        {item.quantityM2.toFixed(2)}
                      </td>
                      <td className="p-3 text-end font-mono tabular-nums">
                        {item.quantityBoxes ?? "—"}
                      </td>
                      <td className="p-3 text-end font-mono tabular-nums">
                        {item.unitPrice.toFixed(2)}
                      </td>
                      <td className="p-3 text-end font-mono font-medium tabular-nums">
                        {item.lineTotal.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td className="p-3 font-medium" colSpan={4}>
                      Subtotal
                    </td>
                    <td className="p-3 text-end font-mono font-medium tabular-nums">
                      {quote.subtotal === null
                        ? "—"
                        : `${quote.currency ?? ""} ${quote.subtotal.toFixed(2)}`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {quote.notes ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-body-lg">Customer notes</h2>
              <p className="rounded-lg border border-border bg-white p-4 text-body-sm leading-relaxed whitespace-pre-wrap">
                {quote.notes}
              </p>
            </section>
          ) : null}

          {/*
            docs/02 §2.6 also puts an AI conversation transcript and a
            one-click WhatsApp reply on this screen. Both are deliberately
            absent rather than stubbed: the transcript needs the Interior
            Assistant (roadmap phase 7) and the reply needs the WhatsApp
            connector (phase 9). An empty "Transcript" panel would read as a
            broken feature rather than an unbuilt one.
          */}
        </div>

        <aside className="flex flex-col gap-6">
          <section className="flex flex-col gap-3 rounded-lg border border-border bg-white p-5">
            <h2 className="font-display text-body-lg">Contact</h2>
            <dl className="flex flex-col gap-2 text-body-sm">
              <Field label="Name" value={quote.contactName} />
              <Field label="Company" value={quote.companyName} />
              <Field
                label="Email"
                value={quote.contactEmail}
                href={
                  quote.contactEmail === null
                    ? null
                    : `mailto:${quote.contactEmail}`
                }
              />
              <Field
                label="Phone"
                value={quote.contactPhone}
                href={
                  quote.contactPhone === null ? null : `tel:${quote.contactPhone}`
                }
              />
              <Field
                label="WhatsApp"
                value={quote.contactWhatsapp}
                href={
                  quote.contactWhatsapp === null
                    ? null
                    : `https://wa.me/${quote.contactWhatsapp.replace(/\D/g, "")}`
                }
              />
            </dl>
          </section>

          <section className="flex flex-col gap-3 rounded-lg border border-border bg-white p-5">
            <h2 className="font-display text-body-lg">Project</h2>
            <dl className="flex flex-col gap-2 text-body-sm">
              <Field label="Type" value={quote.projectType} />
              <Field label="Timeline" value={quote.timeline} />
              <Field label="City" value={quote.projectCity} />
              <Field label="Address" value={quote.projectAddress} />
              <Field
                label="Total area"
                value={
                  quote.totalAreaM2 === null
                    ? null
                    : `${quote.totalAreaM2.toFixed(2)} m²`
                }
              />
              <Field
                label="Weight"
                value={
                  quote.totalWeightKg === null
                    ? null
                    : `${quote.totalWeightKg.toFixed(0)} kg`
                }
              />
              {quote.lostReason ? (
                <Field
                  label="Lost because"
                  value={LOST_REASON_LABEL[quote.lostReason]}
                />
              ) : null}
            </dl>
          </section>

          {canRespond ? (
            <AssignControl
              quoteId={quote.id}
              currentEmail={quote.assignedToEmail}
              staff={staff}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption tracking-wide text-stone-500 uppercase">
        {label}
      </dt>
      <dd className="break-words">
        {value === null || value === "" ? (
          <span className="text-stone-400">—</span>
        ) : href ? (
          <a
            href={href}
            className="rounded-sm underline underline-offset-2 hover:text-navy-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
