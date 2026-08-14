"use client";

import { useState } from "react";

import type { ProductMediaItem } from "@/domain/product/entity";

/**
 * PDP hero + thumbnail strip. `media` is already sorted by `sortOrder`
 * (product-repository.ts) — the first item is the initial main image, not
 * necessarily `role: "primary"`, matching what the admin Media tab lets an
 * editor control via position.
 */
export function ProductGallery({
  media,
  productName,
  colorHex,
}: {
  media: readonly ProductMediaItem[];
  productName: string;
  colorHex: string | null;
}) {
  // `sortOrder` ties (e.g. every image left at the form's default position
  // 0) leave the DB order undefined — prefer `role: "primary"` explicitly
  // rather than showing whichever tied row the query happened to return first.
  const initialIndex = Math.max(
    media.findIndex((item) => item.role === "primary"),
    0,
  );
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const active = media[activeIndex];

  if (!active) {
    return (
      <div
        className="aspect-square w-full rounded-md bg-stone-100"
        style={{ backgroundColor: colorHex ?? undefined }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-square w-full overflow-hidden rounded-md bg-stone-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed
            Storage derivative widths (storage.ts), not Next's optimizer. */}
        <img
          src={active.url}
          alt={active.altText ?? productName}
          className="h-full w-full object-cover"
        />
      </div>

      {media.length > 1 ? (
        <ul className="flex flex-wrap gap-2">
          {media.map((item, index) => (
            <li key={item.mediaAssetId + item.role}>
              <button
                type="button"
                onClick={() => {
                  setActiveIndex(index);
                }}
                aria-current={index === activeIndex}
                className="size-16 overflow-hidden rounded-sm border border-border outline-offset-2 aria-[current=true]:border-navy-700"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed
                    Storage derivative widths (storage.ts), not Next's optimizer. */}
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
