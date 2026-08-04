import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TaxonomyEditor } from "@/app/admin/(dashboard)/taxonomy/[resource]/taxonomy-editor";
import { listTaxonomyForAdmin } from "@/application/use-cases/admin/taxonomy";
import { TAXONOMY_DESCRIPTORS, isKeyedTaxonomy } from "@/domain/admin/taxonomy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ resource: string }>;
}): Promise<Metadata> {
  const { resource } = await params;
  if (!isKeyedTaxonomy(resource)) return { title: "Taxonomy" };
  return { title: TAXONOMY_DESCRIPTORS[resource].label };
}

export default async function TaxonomyResourcePage({
  params,
}: {
  params: Promise<{ resource: string }>;
}) {
  const { resource } = await params;
  // An unknown segment is a 404, not a 500 — the URL is user-controlled.
  if (!isKeyedTaxonomy(resource)) notFound();

  const descriptor = TAXONOMY_DESCRIPTORS[resource];
  const rows = await listTaxonomyForAdmin(resource);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/taxonomy"
          className="rounded-sm text-body-sm text-stone-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
        >
          ← Taxonomy
        </Link>
        <h1 className="text-h4 mt-2 font-display">{descriptor.label}</h1>
        <p className="mt-1 max-w-2xl text-body-sm leading-relaxed text-stone-600">
          {descriptor.blurb}
        </p>
      </div>

      <TaxonomyEditor descriptor={descriptor} rows={rows} />
    </div>
  );
}
