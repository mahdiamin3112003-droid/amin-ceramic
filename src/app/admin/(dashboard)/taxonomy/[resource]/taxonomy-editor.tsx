"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createTaxonomyAction,
  reorderTaxonomyAction,
  setTaxonomyActiveAction,
  updateTaxonomyAction,
} from "@/application/actions/admin/taxonomy-actions";
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
  activationBlockers,
  deactivationBlockedReason,
  missingTranslations,
  reorder,
  type TaxonomyDescriptor,
  type TaxonomyRow,
} from "@/domain/admin/taxonomy";
import { cn } from "@/lib/utils";

const LOCALES = ["en", "ar"] as const;

/**
 * One editor, six vocabularies.
 *
 * ── Reordering without drag-and-drop ──
 * Sort order decides the order of filter chips on the storefront, so it has
 * to be editable — but drag-only reordering is unusable by keyboard and
 * awkward on a touchpad. These are move-up/move-down buttons: every user
 * gets the same mechanism, it needs no library, and at a dozen rows it is
 * genuinely faster than dragging. Drag can be added on top later without
 * changing the action it calls.
 *
 * The list is reordered optimistically and the whole order is sent, which
 * is idempotent — see `reorder()` in the domain.
 */
export function TaxonomyEditor({
  descriptor,
  rows,
}: {
  descriptor: TaxonomyDescriptor;
  rows: readonly TaxonomyRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<TaxonomyRow | null>(null);
  const [creating, setCreating] = useState(false);

  /**
   * Optimistic ordering is held as IDS, not as rows.
   *
   * Holding whole rows was a bug: the re-sync guard compared id order, so
   * after an edit — same rows, same order, new contents — the stale copies
   * survived and a saved translation never appeared until a hard reload.
   *
   * Holding only the order means server data is always the source of truth
   * for CONTENT, while the local override affects nothing but sequence. The
   * override is dropped as soon as the server list arrives, since by then
   * the server order is the real one.
   */
  const [optimisticIds, setOptimisticIds] = useState<readonly string[] | null>(
    null,
  );
  const [syncedFrom, setSyncedFrom] = useState(rows);

  if (syncedFrom !== rows) {
    setSyncedFrom(rows);
    setOptimisticIds(null);
  }

  const order =
    optimisticIds === null
      ? rows
      : optimisticIds
          .map((id) => rows.find((r) => r.id === id))
          .filter((r): r is TaxonomyRow => r !== undefined);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;

    const instructions = reorder(
      order.map((r) => r.id),
      index,
      target,
    );
    const nextIds = instructions.map((i) => i.id);
    setOptimisticIds(nextIds);

    startTransition(async () => {
      const result = await reorderTaxonomyAction({
        resource: descriptor.resource,
        ids: nextIds,
      });
      if (!result.ok) {
        toast.error(result.error);
        setOptimisticIds(null);
        return;
      }
      router.refresh();
    });
  }

  function toggleActive(row: TaxonomyRow) {
    startTransition(async () => {
      const result = await setTaxonomyActiveAction({
        resource: descriptor.resource,
        id: row.id,
        isActive: !row.isActive,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        row.isActive ? "Hidden from the catalogue" : "Now live on the catalogue",
      );
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
          Add {descriptor.singular}
        </Button>
      </div>

      {order.length === 0 ? (
        <EmptyState
          title={`No ${descriptor.label.toLowerCase()} yet`}
          description={descriptor.blurb}
          action={
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              Add the first one
            </Button>
          }
        />
      ) : (
        // Named so assistive tech announces which list this is — and so a
        // test can scope to it rather than to every <li> on the page,
        // sidebar navigation included.
        <ul
          aria-label={descriptor.label}
          className="flex flex-col overflow-hidden rounded-lg border border-border bg-white"
        >
          {order.map((row, index) => {
            const missing = missingTranslations(row, LOCALES);
            // An entry can carry a translation row whose name is blank, so
            // falling back needs to test emptiness, not just absence — an
            // unnamed entry must still be identifiable by its key.
            const enName =
              row.translations.find((t) => t.locale === "en")?.name.trim() ?? "";
            const displayName = enName === "" ? row.key : enName;
            const blockedReason = deactivationBlockedReason(
              row,
              descriptor.singular,
            );
            const cannotActivate = activationBlockers(row, LOCALES).length > 0;

            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-4 border-b border-border p-4 last:border-b-0"
              >
                {/* Order controls. Labelled per row so a screen reader says
                    which one is moving. */}
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => {
                      move(index, -1);
                    }}
                    disabled={index === 0 || pending}
                    aria-label={`Move ${row.key} up`}
                    className="grid size-6 place-items-center rounded-sm text-stone-500 transition-surface hover:bg-stone-100 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-navy-700 disabled:opacity-30"
                  >
                    <Chevron direction="up" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      move(index, 1);
                    }}
                    disabled={index === order.length - 1 || pending}
                    aria-label={`Move ${row.key} down`}
                    className="grid size-6 place-items-center rounded-sm text-stone-500 transition-surface hover:bg-stone-100 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-navy-700 disabled:opacity-30"
                  >
                    <Chevron direction="down" />
                  </button>
                </div>

                {descriptor.hasColor ? (
                  <span
                    aria-hidden
                    className="size-8 shrink-0 rounded-sm border border-stone-300"
                    style={
                      row.colorHex ? { backgroundColor: row.colorHex } : undefined
                    }
                  />
                ) : null}

                <div className="min-w-0 flex-1">
                  <span className="block font-medium">{displayName}</span>
                  <span className="block text-caption font-mono text-stone-500">
                    {row.key}
                  </span>
                </div>

                {descriptor.hasWastage ? (
                  <span className="font-mono text-body-sm text-stone-600 tabular-nums">
                    {row.defaultWastagePct === null
                      ? "—"
                      : `${row.defaultWastagePct.toFixed(1)}% wastage`}
                  </span>
                ) : null}

                <span className="text-caption text-stone-500 tabular-nums">
                  {row.productCount > 0
                    ? `${String(row.productCount)} products`
                    : "unused"}
                </span>

                {missing.length > 0 ? (
                  <span className="text-caption text-warning-600">
                    Needs {missing.join(", ").toUpperCase()}
                  </span>
                ) : null}

                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-caption font-medium",
                    row.isActive
                      ? "bg-success-50 text-success-600"
                      : "bg-stone-100 text-stone-600",
                  )}
                >
                  {row.isActive ? "Live" : "Hidden"}
                </span>

                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(row);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={
                      pending ||
                      (row.isActive ? Boolean(blockedReason) : cannotActivate)
                    }
                    // The reason travels with the disabled control, so the
                    // answer to "why can't I?" is on the button itself.
                    {...(row.isActive && blockedReason
                      ? { title: blockedReason }
                      : cannotActivate && !row.isActive
                        ? {
                            title: `Needs a name in ${missing.join(" and ").toUpperCase()}`,
                          }
                        : {})}
                    onClick={() => {
                      toggleActive(row);
                    }}
                  >
                    {row.isActive ? "Hide" : "Make live"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TaxonomyDialog
        descriptor={descriptor}
        row={editing}
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          router.refresh();
        }}
      />
    </div>
  );
}

function TaxonomyDialog({
  descriptor,
  row,
  open,
  onClose,
  onSaved,
}: {
  descriptor: TaxonomyDescriptor;
  row: TaxonomyRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isNew = row === null;

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
          <DialogTitle>
            {isNew ? `New ${descriptor.singular}` : `Edit ${descriptor.singular}`}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "It stays hidden until it has a name in every language."
              : "The key cannot change — data and code both reference it."}
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
            }));

            startTransition(async () => {
              const payload = {
                resource: descriptor.resource,
                colorHex: values.colorHex ?? "",
                defaultWastagePct: values.defaultWastagePct ?? "",
                translations,
              };

              const result = isNew
                ? await createTaxonomyAction({ ...payload, key: values.key })
                : await updateTaxonomyAction({ ...payload, id: row.id });

              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(isNew ? "Created" : "Saved");
              onSaved();
              onClose();
            });
          }}
        >
          {isNew ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                name="key"
                required
                spellCheck={false}
                placeholder="bush-hammered"
                className="font-mono"
              />
              <span className="text-caption text-stone-600">
                Permanent. Lowercase letters, digits and <code>. _ -</code> only.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-caption tracking-wide text-stone-500 uppercase">
                Key
              </span>
              <code className="font-mono text-body-sm">{row.key}</code>
            </div>
          )}

          {descriptor.hasColor ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="colorHex">Swatch colour</Label>
              <Input
                id="colorHex"
                name="colorHex"
                defaultValue={row?.colorHex ?? ""}
                placeholder="#RRGGBB"
                className="font-mono"
              />
            </div>
          ) : null}

          {descriptor.hasWastage ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="defaultWastagePct">Default wastage (%)</Label>
              <Input
                id="defaultWastagePct"
                name="defaultWastagePct"
                type="number"
                step="0.1"
                min={0}
                max={40}
                defaultValue={row?.defaultWastagePct ?? ""}
                className="tabular-nums"
              />
              <span className="text-caption text-stone-600">
                The quantity calculator adds this to every order laid in this
                pattern.
              </span>
            </div>
          ) : null}

          {LOCALES.map((locale) => {
            const translation = row?.translations.find((t) => t.locale === locale);
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
                <Input
                  name={`description-${locale}`}
                  defaultValue={translation?.description ?? ""}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                  placeholder={`Description (${locale.toUpperCase()}, optional)`}
                />
              </div>
            );
          })}

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

function Chevron({ direction }: { direction: "up" | "down" }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className="size-3.5">
      <path
        d={direction === "up" ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
