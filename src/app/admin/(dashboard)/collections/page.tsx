import type { Metadata } from "next";

import { CollectionsView } from "@/app/admin/(dashboard)/collections/collections-view";
import { hasPermission } from "@/application/auth/authorize";
import {
  listBrands,
  listCollections,
} from "@/application/use-cases/admin/collections";
import { listMedia } from "@/application/use-cases/admin/media";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const [collections, brands, mayManageMedia] = await Promise.all([
    listCollections(),
    listBrands(),
    hasPermission("media.manage"),
  ]);

  /**
   * Same gating as the product Media tab: `listMedia` requires
   * `media.manage`, so the permission is checked before the call rather
   * than the throw being caught after it. Someone without it still gets the
   * form — they just cannot pick a hero.
   */
  const mediaLibrary = mayManageMedia ? (await listMedia({ page: 1 })).assets : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h4 font-display">Collections</h1>
        <p className="mt-1 max-w-2xl text-body-sm leading-relaxed text-stone-600">
          Curated groups with their own page. A collection stays a draft until it
          has a name in every language, a hero image and at least one product — a
          published collection with nothing in it is a dead end customers can reach
          from the navigation.
        </p>
      </div>

      <CollectionsView
        collections={collections}
        brands={brands}
        mediaLibrary={mediaLibrary}
      />
    </div>
  );
}
