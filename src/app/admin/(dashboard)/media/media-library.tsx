"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  deleteMediaAction,
  setAltTextAction,
  uploadMediaAction,
} from "@/application/actions/admin/media-actions";
import { EmptyState } from "@/app/admin/(dashboard)/empty-state";
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
import {
  formatBytes,
  missingAltLocales,
  type AdminMediaAsset,
  type AdminMediaPage,
} from "@/domain/admin/media";

const LOCALES = ["en", "ar"] as const;

export function MediaLibrary({
  page,
  query,
}: {
  page: AdminMediaPage;
  query: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<AdminMediaAsset | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function upload(files: FileList | null) {
    if (!files || files.length === 0) return;

    startTransition(async () => {
      let uploaded = 0;
      let deduplicated = 0;

      // Sequential, not `Promise.all`. Each upload re-encodes the full
      // ladder with sharp — five concurrent 25 MB files would exhaust
      // memory long before they saturated the network.
      for (const file of Array.from(files)) {
        const result = await uploadMediaAction(toFormData(file));
        if (!result.ok) {
          toast.error(`${file.name}: ${result.error}`);
          continue;
        }
        if (result.data.deduplicated) deduplicated += 1;
        else uploaded += 1;
      }

      if (uploaded > 0) toast.success(`Uploaded ${String(uploaded)}`);
      // Surfaced rather than silent: "I uploaded it and nothing appeared"
      // is confusing, and the honest answer is that we already had it.
      if (deduplicated > 0) {
        toast.info(
          `${String(deduplicated)} already in the library (identical file)`,
        );
      }

      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    });
  }

  function search(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-white p-4">
        <div className="flex min-w-52 flex-1 flex-col gap-2">
          <Label htmlFor="media-q">Search</Label>
          <Input
            id="media-q"
            type="search"
            defaultValue={query}
            placeholder="Filename, tag or alt text"
            onKeyDown={(e) => {
              if (e.key === "Enter") search(e.currentTarget.value);
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="media-upload">Upload</Label>
          <input
            ref={fileInput}
            id="media-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            disabled={pending}
            onChange={(e) => {
              upload(e.target.files);
            }}
            className="text-body-sm file:me-3 file:rounded-sm file:border-0 file:bg-navy-700 file:px-3 file:py-2 file:text-white"
          />
        </div>
      </div>

      {pending ? (
        <p role="status" aria-live="polite" className="text-body-sm text-stone-600">
          Processing images…
        </p>
      ) : null}

      {page.assets.length === 0 ? (
        <EmptyState
          {...(query
            ? {
                variant: "no-results" as const,
                title: "Nothing matches that search",
                description: "Try a different filename, tag or alt text.",
              }
            : {
                title: "The library is empty",
                description:
                  "Drop images in above. Each upload is converted to WebP and resized into a fixed ladder automatically.",
              })}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {page.assets.map((asset) => {
            const missing = missingAltLocales(asset, LOCALES);
            return (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(asset);
                  }}
                  className="w-full overflow-hidden rounded-lg border border-border bg-white text-start transition-surface hover:border-cyan-400"
                >
                  {/*
                    A plain <img>: these are Supabase Storage URLs whose
                    derivatives are already generated, so routing them
                    through next/image would re-optimise something that is
                    optimised. `dominantColor` fills the box before load so
                    the grid does not jump.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.url}
                    alt={asset.altText.en ?? ""}
                    loading="lazy"
                    width={asset.width ?? 400}
                    height={asset.height ?? 400}
                    className="aspect-square w-full object-cover"
                    style={
                      asset.dominantColor
                        ? { backgroundColor: asset.dominantColor }
                        : undefined
                    }
                  />
                  <div className="flex flex-col gap-1 p-3">
                    <span className="text-caption font-mono text-stone-600 tabular-nums">
                      {asset.width ?? "?"}×{asset.height ?? "?"} ·{" "}
                      {formatBytes(asset.bytes)}
                    </span>
                    {missing.length > 0 ? (
                      <span className="text-caption text-warning-600">
                        Missing alt: {missing.join(", ").toUpperCase()}
                      </span>
                    ) : null}
                    {asset.usageCount > 0 ? (
                      <span className="text-caption text-stone-500">
                        Used by {asset.usageCount}
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <AssetDialog
        asset={selected}
        onClose={() => {
          setSelected(null);
        }}
        onChanged={() => {
          router.refresh();
        }}
      />
    </div>
  );
}

function toFormData(file: File): FormData {
  const data = new FormData();
  data.set("file", file);
  return data;
}

function AssetDialog({
  asset,
  onClose,
  onChanged,
}: {
  asset: AdminMediaAsset | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  if (!asset) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Image details</DialogTitle>
          <DialogDescription className="text-caption font-mono break-all">
            {asset.publicId}
          </DialogDescription>
        </DialogHeader>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.url}
          alt={asset.altText.en ?? ""}
          className="max-h-64 w-full rounded-sm object-contain"
        />

        <form
          className="flex flex-col gap-4"
          action={(formData) => {
            startTransition(async () => {
              // Both locales in one submit — alt text is the field most
              // likely to be half-done, and making the user save twice is
              // how the second one gets forgotten.
              for (const locale of LOCALES) {
                const result = await setAltTextAction({
                  id: asset.id,
                  locale,
                  altText: formData.get(`alt-${locale}`),
                });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
              }
              toast.success("Alt text saved");
              onChanged();
              onClose();
            });
          }}
        >
          {LOCALES.map((locale) => (
            <div key={locale} className="flex flex-col gap-2">
              <Label htmlFor={`alt-${locale}`}>
                Alt text ({locale.toUpperCase()})
              </Label>
              <Input
                id={`alt-${locale}`}
                name={`alt-${locale}`}
                defaultValue={asset.altText[locale] ?? ""}
                dir={locale === "ar" ? "rtl" : "ltr"}
                placeholder="What the image shows, for someone who cannot see it"
              />
            </div>
          ))}

          <DialogFooter>
            {asset.usageCount === 0 ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await deleteMediaAction({ id: asset.id });
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success("Image deleted");
                    onChanged();
                    onClose();
                  });
                }}
              >
                Delete
              </Button>
            ) : (
              // Not just disabled — the reason is the useful part.
              <span className="text-caption text-stone-500">
                In use by {asset.usageCount} product image slot
                {asset.usageCount === 1 ? "" : "s"}
              </span>
            )}
            <Button type="submit" loading={pending}>
              Save alt text
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
