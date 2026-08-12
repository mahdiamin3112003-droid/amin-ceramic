"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  attachMediaAction,
  detachMediaAction,
} from "@/application/actions/admin/media-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminMediaAsset } from "@/domain/admin/media";
import {
  PRODUCT_MEDIA_ROLES,
  type AdminProductMedia,
  type ProductMediaRole,
} from "@/domain/admin/product";

/**
 * The product form's `#media` tab — docs/02 §1.2.
 *
 * ── Why this is not part of the form submission ──
 * Everything else in the product editor is save-on-submit; attaching and
 * detaching are their own server actions that apply IMMEDIATELY. That is a
 * genuine inconsistency in the editor, and rather than hide it the panel
 * says so in one line. The alternative — staging attachments in form state
 * and reconciling them on save — means an image can be uploaded, referenced
 * and then orphaned by a cancelled save, which is a worse problem than a
 * visible difference in behaviour.
 *
 * None of the controls here carry a `name`, deliberately: they sit inside
 * the product form's single `<form>`, and a named input would be swept into
 * its FormData and rejected by the product schema on save.
 */

const ROLE_LABELS: Record<ProductMediaRole, string> = {
  primary: "Primary",
  gallery: "Gallery",
  room_scene: "Room scene",
  macro_detail: "Macro detail",
  installed: "Installed",
  technical_drawing: "Technical drawing",
  packaging: "Packaging",
  swatch: "Swatch",
};

// From the domain list, not from `Object.keys` — key order is incidental,
// and this keeps the dropdown in the same order as the schema.
const ROLES = PRODUCT_MEDIA_ROLES;

export function ProductMediaPanel({
  productId,
  attached,
  library,
  canManageMedia,
}: {
  productId: string;
  attached: readonly AdminProductMedia[];
  library: readonly AdminMediaAsset[];
  canManageMedia: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [assetId, setAssetId] = useState("");
  const [role, setRole] = useState<ProductMediaRole>("primary");
  const [sortOrder, setSortOrder] = useState("0");

  if (!canManageMedia) {
    return (
      <p className="rounded-md border border-border bg-stone-50 p-6 text-body-sm text-stone-600">
        Your role can edit this product but not its images — that needs{" "}
        <code className="text-spec-sm">media.manage</code>.
      </p>
    );
  }

  function attach() {
    if (!assetId) {
      toast.error("Choose an image first.");
      return;
    }
    startTransition(() => {
      void (async () => {
        const result = await attachMediaAction({
          productId,
          mediaAssetId: assetId,
          role,
          sortOrder: Number(sortOrder) || 0,
        });
        if (result.ok) {
          toast.success("Image attached");
          setAssetId("");
          router.refresh();
        } else {
          toast.error(result.error);
        }
      })();
    });
  }

  function detach(mediaAssetId: string, slotRole: ProductMediaRole) {
    startTransition(() => {
      void (async () => {
        const result = await detachMediaAction({
          productId,
          mediaAssetId,
          role: slotRole,
        });
        if (result.ok) {
          toast.success("Image removed");
          router.refresh();
        } else {
          toast.error(result.error);
        }
      })();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-body-sm text-stone-600">
        Image changes save immediately — they do not wait for &ldquo;Save&rdquo;.
      </p>

      {/* ── What is attached now ──────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h3 className="text-heading-sm">Attached images</h3>
        {attached.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-body-sm text-stone-600">
            No images yet. A product with no image cannot be published.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Attached images">
            {attached.map((item) => (
              <li
                key={`${item.mediaAssetId}-${item.role}`}
                className="flex items-center gap-4 rounded-md border border-border p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- derivatives are pregenerated at upload (ADR-0013); next/image would re-optimise what is already optimised */}
                <img
                  src={item.url}
                  alt={item.altText ?? ""}
                  className="size-16 shrink-0 rounded-sm bg-stone-100 object-cover"
                />
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-body-sm font-medium">
                    {ROLE_LABELS[item.role]}
                  </span>
                  <span className="text-spec-sm text-stone-600">
                    position {item.sortOrder}
                  </span>
                  {item.altText === null || item.altText.trim() === "" ? (
                    // Alt text is set in the media library, not here — it
                    // belongs to the asset, not to this product's use of it.
                    <span className="text-caption text-warning-600">
                      No alt text — set it in the media library
                    </span>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    detach(item.mediaAssetId, item.role);
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Attach one from the library ───────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h3 className="text-heading-sm">Add an image</h3>
        {library.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-body-sm text-stone-600">
            The media library is empty. Upload images in the{" "}
            <Link href="/admin/media" className="text-primary underline">
              media library
            </Link>{" "}
            first.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex min-w-64 flex-col gap-2">
              <Label htmlFor="media-asset">Image</Label>
              <select
                id="media-asset"
                value={assetId}
                onChange={(e) => {
                  setAssetId(e.target.value);
                }}
                className="h-11 rounded-sm border border-stone-300 bg-background px-3 text-body"
              >
                <option value="">Choose…</option>
                {library.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.publicId}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="media-role">Role</Label>
              <select
                id="media-role"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as ProductMediaRole);
                }}
                className="h-11 rounded-sm border border-stone-300 bg-background px-3 text-body"
              >
                {ROLES.map((value) => (
                  <option key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex w-28 flex-col gap-2">
              <Label htmlFor="media-sort">Position</Label>
              <Input
                id="media-sort"
                inputMode="numeric"
                value={sortOrder}
                onChange={(e) => {
                  setSortOrder(e.target.value);
                }}
              />
            </div>

            <Button
              type="button"
              variant="secondary"
              loading={pending}
              loadingLabel="Attaching"
              onClick={attach}
            >
              Attach
            </Button>
          </div>
        )}
        <p className="text-caption text-stone-500">
          One image per role. Attaching a second image to a role that is already
          filled replaces it.
        </p>
      </section>
    </div>
  );
}
