import type { Metadata } from "next";
import Link from "next/link";

import { requirePermission } from "@/application/auth/authorize";
import { KEYED_TAXONOMIES, TAXONOMY_DESCRIPTORS } from "@/domain/admin/taxonomy";

export const metadata: Metadata = { title: "Taxonomy" };

/**
 * The hub.
 *
 * Six vocabularies rather than six nav items: they are edited rarely — a
 * merchandiser adds "bush-hammered" once a quarter — so giving each one a
 * permanent place in the sidebar would push the daily work down the list to
 * make room for something touched four times a year.
 */
export default async function TaxonomyHubPage() {
  await requirePermission("content.manage");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-h4 font-display">Taxonomy</h1>
        <p className="mt-2 max-w-2xl text-body-sm leading-relaxed text-stone-600">
          The vocabularies the catalogue filters by. These are data, not code — a
          new finish is an entry here, not a deploy. Each entry stays hidden until
          it has a name in every language.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {KEYED_TAXONOMIES.map((resource) => {
          const descriptor = TAXONOMY_DESCRIPTORS[resource];
          return (
            <li key={resource}>
              <Link
                href={`/admin/taxonomy/${resource}`}
                className="flex h-full flex-col gap-2 rounded-lg border border-border bg-white p-5 transition-surface hover:border-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
              >
                <span className="font-display text-body-lg">
                  {descriptor.label}
                </span>
                <span className="text-body-sm leading-relaxed text-stone-600">
                  {descriptor.blurb}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
