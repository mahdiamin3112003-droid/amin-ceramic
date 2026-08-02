import type { Meta, StoryObj } from "@storybook/nextjs";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  type SheetSide,
} from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Overlays — docs/02-ux-blueprint.md §1.3.
 *
 * The rules enforced across all of them: never nest more than one, every overlay
 * traps focus and restores it to the trigger on close, Escape closes the topmost
 * only, and background scroll locks without layout shift.
 *
 * Switch the locale toolbar to Arabic on every story here. Overlays portal to
 * document.body, which is exactly where a direction bug hides — that is why the
 * preview decorator sets `dir` on documentElement rather than on a wrapper.
 */
const meta = {
  title: "Primitives/Overlays",
  parameters: { layout: "centered", controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const DialogStory: Story = {
  name: "Dialog",
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">Order a sample</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Order a sample</DialogTitle>
          <DialogDescription>
            Up to three free samples, delivered to your address. Nobody specifies a
            tile they haven&apos;t touched.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost">Cancel</Button>
          <Button variant="primary">Request samples</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

/**
 * Sheet takes LOGICAL sides, not "left"/"right".
 *
 * "The quote basket opens on the right" is only true in English. Flip the
 * locale toolbar to Arabic and `inline-end` opens on the left, with no change
 * at the call site — which is the whole argument for logical properties.
 */
export const SheetSides: Story = {
  name: "Sheet — logical sides",
  render: () => {
    const sides: { side: SheetSide; label: string; note: string }[] = [
      {
        side: "inline-end",
        label: "inline-end",
        note: "Quote basket, showroom booking, admin bulk edit",
      },
      { side: "inline-start", label: "inline-start", note: "Navigation drawer" },
      { side: "block-end", label: "block-end", note: "Mobile filter panel" },
      { side: "block-start", label: "block-start", note: "Rare — announcements" },
    ];

    return (
      <div className="flex flex-wrap gap-3">
        {sides.map(({ side, label, note }) => (
          <Sheet key={side}>
            <SheetTrigger asChild>
              <Button variant="secondary">{label}</Button>
            </SheetTrigger>
            <SheetContent side={side}>
              <SheetHeader>
                <SheetTitle>{label}</SheetTitle>
                <SheetDescription>{note}</SheetDescription>
              </SheetHeader>
              <div className="p-6">
                <p className="text-body-sm text-stone-600">
                  Switch the locale toolbar to Arabic and reopen this. The panel
                  moves to the other side; nothing at the call site changed.
                </p>
              </div>
            </SheetContent>
          </Sheet>
        ))}
      </div>
    );
  },
};

export const PopoverStory: Story = {
  name: "Popover",
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost">Why this match?</Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-xs">
        <p className="text-body-sm">
          Same warm beige and matte finish; veining is slightly finer. Grounded in
          the difference between your photo&apos;s extracted attributes and this
          product&apos;s stored ones — never free-form.
        </p>
      </PopoverContent>
    </Popover>
  ),
};

export const TooltipStory: Story = {
  name: "Tooltip",
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost">R11</Button>
        </TooltipTrigger>
        <TooltipContent>
          Slip resistance, DIN 51130. R11 suits wet floors and outdoor use.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};

/**
 * Toast — §4.18.
 *
 * "bottom-right desktop, top mobile, max 3 stacked, 4–5s, pause on hover,
 * dismissible." Success feedback is proportional to the effort completed: a
 * saved wishlist item does not deserve one, and a submitted quote deserves a
 * whole page rather than a toast.
 */
export const ToastStory: Story = {
  name: "Toast",
  render: () => (
    <>
      <Toaster />
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => toast.success("Product published.")}
        >
          Success
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast.warning("3 products are below 20 m² stock.", {
              action: { label: "View", onClick: () => undefined },
            })
          }
        >
          Warning + action
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast.error("Couldn't reach the catalog. Retrying in 5 seconds.")
          }
        >
          Error
        </Button>
        <Button
          variant="secondary"
          onClick={() => toast.loading("Computing embeddings…")}
        >
          Loading
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast("Price updated.", {
              action: { label: "Undo", onClick: () => undefined },
            })
          }
        >
          With undo
        </Button>
      </div>
    </>
  ),
};
