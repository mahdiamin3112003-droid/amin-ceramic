"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createBrandAction,
  createCollectionAction,
  setBrandActiveAction,
  setCollectionStatusAction,
  updateBrandAction,
  updateCollectionAction,
} from "@/application/actions/admin/collection-actions";
import { EmptyState } from "@/app/admin/(dashboard)/empty-state";
import { StatusBadge } from "@/app/admin/(dashboard)/products/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  brandDeactivationBlockedReason,
  collectionPublishBlockers,
  type BrandRow,
  type CollectionRow,
} from "@/domain/admin/collection";
import type { AdminMediaAsset } from "@/domain/admin/media";

const LOCALES = ["en", "ar"] as const;
const REQUIRED = ["en", "ar"];

/**
 * Collections and brands on one screen, in two tabs.
 *
 * They belong together: a collection's most important field after its name
 * is which brand it belongs to, and the two are curated in the same sitting.
 * Splitting them into separate nav items would mean leaving the page to
 * create the brand you need halfway through creating a collection.
 */
export function CollectionsView({
  collections,
  brands,
  mediaLibrary,
}: {
  collections: readonly CollectionRow[];
  brands: readonly BrandRow[];
  mediaLibrary: readonly AdminMediaAsset[];
}) {
  return (
    <Tabs defaultValue="collections">
      <TabsList>
        <TabsTrigger value="collections">
          Collections ({collections.length})
        </TabsTrigger>
        <TabsTrigger value="brands">Brands ({brands.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="collections" className="mt-5">
        <CollectionList
          collections={collections}
          brands={brands}
          mediaLibrary={mediaLibrary}
        />
      </TabsContent>

      <TabsContent value="brands" className="mt-5">
        <BrandList brands={brands} />
      </TabsContent>
    </Tabs>
  );
}

function CollectionList({
  collections,
  brands,
  mediaLibrary,
}: {
  collections: readonly CollectionRow[];
  brands: readonly BrandRow[];
  mediaLibrary: readonly AdminMediaAsset[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<CollectionRow | null>(null);
  const [creating, setCreating] = useState(false);

  function changeStatus(
    row: CollectionRow,
    status: "draft" | "published" | "archived",
  ) {
    startTransition(async () => {
      const result = await setCollectionStatusAction({ id: row.id, status });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Collection ${status}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setCreating(true);
          }}
        >
          New collection
        </Button>
      </div>

      {collections.length === 0 ? (
        <EmptyState
          title="No collections yet"
          description="A collection groups products under their own page — a supplier range, a look, a season."
          action={
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              Create the first one
            </Button>
          }
        />
      ) : (
        <ul
          aria-label="Collections"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {collections.map((collection) => {
            const blockers = collectionPublishBlockers(collection, REQUIRED);
            const name =
              collection.translations.find((t) => t.locale === "en")?.name.trim() ??
              "";

            return (
              <li
                key={collection.id}
                className="flex flex-col overflow-hidden rounded-lg border border-border bg-white"
              >
                {collection.heroUrl === null ? (
                  <div className="grid aspect-[3/2] w-full place-items-center bg-stone-50 text-caption text-stone-500">
                    No hero image
                  </div>
                ) : (
                  // A Supabase Storage URL whose derivatives are already
                  // generated — next/image would re-optimise what is optimised.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={collection.heroUrl}
                    alt=""
                    className="aspect-[3/2] w-full object-cover"
                    loading="lazy"
                  />
                )}

                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block font-medium">
                        {name === "" ? collection.slug : name}
                      </span>
                      <span className="block text-caption font-mono text-stone-500">
                        {collection.slug}
                      </span>
                    </div>
                    <StatusBadge status={collection.status} />
                  </div>

                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-stone-600">
                    <div className="flex gap-1">
                      <dt className="sr-only">Products</dt>
                      <dd className="tabular-nums">
                        {collection.productCount} products
                      </dd>
                    </div>
                    {collection.brandName ? (
                      <div className="flex gap-1">
                        <dt className="sr-only">Brand</dt>
                        <dd>{collection.brandName}</dd>
                      </div>
                    ) : null}
                    {collection.isFeatured ? <dd>Featured</dd> : null}
                  </dl>

                  {blockers.length > 0 && collection.status !== "published" ? (
                    // Named so the reasons are announced as a group rather
                    // than as loose text next to the card, and so they can be
                    // told apart from the placeholder tile that says the same
                    // words for a different purpose.
                    <ul
                      aria-label="Not ready to publish"
                      className="flex flex-col gap-0.5 text-caption text-warning-600"
                    >
                      {blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(collection);
                      }}
                    >
                      Edit
                    </Button>

                    {collection.status === "published" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          changeStatus(collection, "draft");
                        }}
                      >
                        Unpublish
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={pending || blockers.length > 0}
                        {...(blockers.length > 0
                          ? { title: blockers.join(", ") }
                          : {})}
                        onClick={() => {
                          changeStatus(collection, "published");
                        }}
                      >
                        Publish
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CollectionDialog
        collection={editing}
        brands={brands}
        mediaLibrary={mediaLibrary}
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function CollectionDialog({
  collection,
  brands,
  mediaLibrary,
  open,
  onClose,
}: {
  collection: CollectionRow | null;
  brands: readonly BrandRow[];
  mediaLibrary: readonly AdminMediaAsset[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isNew = collection === null;

  if (!open) return null;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "New collection" : "Edit collection"}</DialogTitle>
          <DialogDescription>
            {isNew
              ? "Created as a draft. Add products and a hero image, then publish."
              : "The slug appears in the collection's public URL."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-5"
          action={(formData) => {
            const values = Object.fromEntries(formData.entries());
            const translations = LOCALES.map((locale) => ({
              locale,
              name: values[`name-${locale}`],
              description: values[`description-${locale}`],
              seoTitle: values[`seoTitle-${locale}`],
              seoDescription: "",
            }));

            startTransition(async () => {
              const payload = {
                slug: values.slug,
                brandId: values.brandId,
                heroMediaId: values.heroMediaId,
                // Unchecked checkboxes are absent from FormData entirely.
                isFeatured: formData.get("isFeatured") === "on",
                translations,
              };

              const result = isNew
                ? await createCollectionAction(payload)
                : await updateCollectionAction({ ...payload, id: collection.id });

              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(isNew ? "Collection created" : "Saved");
              onClose();
              router.refresh();
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={collection?.slug ?? ""}
              required
              spellCheck={false}
              placeholder="marble-look"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="brandId">Brand</Label>
            <select
              id="brandId"
              name="brandId"
              defaultValue={collection?.brandId ?? ""}
              className="h-11 rounded-sm border border-stone-300 bg-white px-3 text-body-sm"
            >
              <option value="">No brand</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="heroMediaId">Hero image</Label>
            {/*
              Was a free-text box asking for a pasted UUID. That shipped a
              real bug: storage objects live at `{tenantId}/{hash}.webp`, so
              the first id visible in any image URL is the TENANT's, and the
              asset id appears nowhere in the path. A tenant id got pasted
              here, saved without complaint, and the hero silently rendered
              as nothing. A list of real assets makes that unrepresentable;
              the FK added in 20260814140000 is the backstop beneath it.
            */}
            <select
              id="heroMediaId"
              name="heroMediaId"
              defaultValue={collection?.heroMediaId ?? ""}
              disabled={mediaLibrary.length === 0}
              className="h-11 rounded-sm border border-stone-300 bg-background px-3 text-body"
            >
              <option value="">No hero image</option>
              {mediaLibrary.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.publicId}
                </option>
              ))}
            </select>
            {mediaLibrary.length === 0 ? (
              <span className="text-caption text-stone-600">
                No images in the library yet — upload one in Media first.
              </span>
            ) : null}
          </div>

          {LOCALES.map((locale) => {
            const translation = collection?.translations.find(
              (t) => t.locale === locale,
            );
            return (
              <div key={locale} className="flex flex-col gap-2">
                <Label htmlFor={`name-${locale}`}>
                  Name ({locale.toUpperCase()})
                </Label>
                <Input
                  id={`name-${locale}`}
                  name={`name-${locale}`}
                  defaultValue={translation?.name ?? ""}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                  {...(locale === "en" ? { required: true } : {})}
                />
                <textarea
                  name={`description-${locale}`}
                  defaultValue={translation?.description ?? ""}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                  rows={3}
                  placeholder={`Description (${locale.toUpperCase()}, optional)`}
                  className="w-full rounded-sm border border-stone-300 bg-white p-3 text-body-sm"
                />
                <Input
                  name={`seoTitle-${locale}`}
                  defaultValue={translation?.seoTitle ?? ""}
                  placeholder={`SEO title (${locale.toUpperCase()}, optional)`}
                />
              </div>
            );
          })}

          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name="isFeatured"
              defaultChecked={collection?.isFeatured ?? false}
              className="size-4 shrink-0 accent-navy-700"
            />
            <span className="text-body-sm">Feature on the homepage</span>
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {isNew ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BrandList({ brands }: { brands: readonly BrandRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<BrandRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setCreating(true);
          }}
        >
          New brand
        </Button>
      </div>

      {brands.length === 0 ? (
        <EmptyState
          title="No brands yet"
          description="Every product belongs to a brand, so at least one is needed before the catalogue can be filled."
          action={
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              Add the first brand
            </Button>
          }
        />
      ) : (
        <ul
          aria-label="Brands"
          className="flex flex-col overflow-hidden rounded-lg border border-border bg-white"
        >
          {brands.map((brand) => {
            const blocked = brandDeactivationBlockedReason(brand);
            return (
              <li
                key={brand.id}
                className="flex flex-wrap items-center gap-4 border-b border-border p-4 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <span className="block font-medium">{brand.name}</span>
                  <span className="block text-caption font-mono text-stone-500">
                    {brand.slug}
                    {brand.originCountry ? ` · ${brand.originCountry}` : ""}
                  </span>
                </div>

                <span className="text-caption text-stone-500 tabular-nums">
                  {brand.productCount} products · {brand.collectionCount}{" "}
                  collections
                </span>

                <span
                  className={
                    brand.isActive
                      ? "rounded-full bg-success-50 px-2.5 py-0.5 text-caption font-medium text-success-600"
                      : "rounded-full bg-stone-100 px-2.5 py-0.5 text-caption font-medium text-stone-600"
                  }
                >
                  {brand.isActive ? "Live" : "Hidden"}
                </span>

                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(brand);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pending || (brand.isActive && blocked !== null)}
                    {...(brand.isActive && blocked ? { title: blocked } : {})}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await setBrandActiveAction({
                          id: brand.id,
                          isActive: !brand.isActive,
                        });
                        if (!result.ok) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success(brand.isActive ? "Hidden" : "Now live");
                        router.refresh();
                      });
                    }}
                  >
                    {brand.isActive ? "Hide" : "Make live"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <BrandDialog
        brand={editing}
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function BrandDialog({
  brand,
  open,
  onClose,
}: {
  brand: BrandRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isNew = brand === null;

  if (!open) return null;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "New brand" : "Edit brand"}</DialogTitle>
          <DialogDescription>
            {isNew
              ? "The slug becomes part of the brand's public URL and cannot change afterwards."
              : "The slug is fixed — it is in published URLs."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-5"
          action={(formData) => {
            const values = Object.fromEntries(formData.entries());
            startTransition(async () => {
              const payload = {
                name: values.name,
                originCountry: values.originCountry,
                websiteUrl: values.websiteUrl,
              };
              const result = isNew
                ? await createBrandAction({ ...payload, slug: values.slug })
                : await updateBrandAction({ ...payload, id: brand.id });

              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(isNew ? "Brand created" : "Saved");
              onClose();
              router.refresh();
            });
          }}
        >
          {isNew ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="brand-slug">Slug</Label>
              <Input id="brand-slug" name="slug" required spellCheck={false} />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-caption tracking-wide text-stone-500 uppercase">
                Slug
              </span>
              <code className="font-mono text-body-sm">{brand.slug}</code>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="brand-name">Name</Label>
            <Input
              id="brand-name"
              name="name"
              defaultValue={brand?.name ?? ""}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="brand-country">Origin country (ISO-2)</Label>
            <Input
              id="brand-country"
              name="originCountry"
              maxLength={2}
              defaultValue={brand?.originCountry ?? ""}
              className="font-mono uppercase"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="brand-website">Website</Label>
            <Input
              id="brand-website"
              name="websiteUrl"
              type="url"
              defaultValue={brand?.websiteUrl ?? ""}
              placeholder="https://example.com"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {isNew ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
