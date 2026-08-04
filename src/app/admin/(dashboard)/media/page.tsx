import type { Metadata } from "next";

import { MediaLibrary } from "@/app/admin/(dashboard)/media/media-library";
import { listMedia } from "@/application/use-cases/admin/media";

export const metadata: Metadata = { title: "Media" };

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  const parsed = Number.parseInt(page ?? "1", 10);

  const result = await listMedia({
    ...(q ? { query: q } : {}),
    page: Number.isNaN(parsed) ? 1 : parsed,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-heading-md">Media</h1>
        <p className="mt-1 text-body-sm text-stone-600">
          {result.total} {result.total === 1 ? "image" : "images"}. Uploads are
          converted to WebP and resized into a fixed ladder automatically.
        </p>
      </div>

      <MediaLibrary page={result} query={q ?? ""} />
    </div>
  );
}
