import type { Meta, StoryObj } from "@storybook/nextjs";

import { expect, within } from "storybook/test";

import { Badge, MatchBadge } from "@/components/ui/badge";

/**
 * Badge — docs/02-ux-blueprint.md §4.12. All twelve variants.
 *
 * The constraint that shapes the API: "Semantic colour never carries meaning
 * alone — always paired with an icon or text label" (§4.1 rule 4). The stock
 * indicators are real shapes (filled / half / hollow), so the three stock states
 * are distinguishable without colour at all.
 */
const meta = {
  title: "Primitives/Badge",
  component: Badge,
  args: { children: "In stock" },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "inStock",
        "lowStock",
        "outOfStock",
        "new",
        "bestSeller",
        "outdoor",
        "slip",
        "shade",
        "tradeOnly",
        "discontinued",
        "aiGenerated",
      ],
    },
    shadeLevel: { control: "inline-radio", options: [1, 2, 3, 4] },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** All twelve, as §4.12 lists them. */
export const AllVariants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-caption text-stone-600">Availability</span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="inStock">In stock</Badge>
          <Badge variant="lowStock">Low stock — 18 m²</Badge>
          <Badge variant="outOfStock">Out of stock</Badge>
          <Badge variant="discontinued">Discontinued</Badge>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-caption text-stone-600">Merchandising</span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="new">New</Badge>
          <Badge variant="bestSeller">Best seller</Badge>
          <Badge variant="tradeOnly">Trade only</Badge>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-caption text-stone-600">Technical</span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outdoor">Outdoor</Badge>
          <Badge variant="slip">R11 anti-slip</Badge>
          <Badge variant="shade" shadeLevel={1}>
            V1 shade
          </Badge>
          <Badge variant="shade" shadeLevel={2}>
            V2 shade
          </Badge>
          <Badge variant="shade" shadeLevel={3}>
            V3 shade
          </Badge>
          <Badge variant="shade" shadeLevel={4}>
            V4 shade
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-caption text-stone-600">Admin</span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="aiGenerated">AI generated</Badge>
        </div>
      </div>
    </div>
  ),
};

/**
 * The shade icon teaches the concept rather than labelling it: V1 is four
 * identical tiles, V4 is four visibly different ones — which is exactly what
 * shade variation means to a customer standing in a showroom.
 */
export const ShadeVariationScale: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {([1, 2, 3, 4] as const).map((level) => (
        <Badge key={level} variant="shade" shadeLevel={level}>
          V{level} shade
        </Badge>
      ))}
    </div>
  ),
};

/**
 * Match percentage — §4.12 and §5.9.
 *
 * The value is a CALIBRATED score, never raw cosine distance
 * (docs/01-architecture.md §6.3 step 8: "0.71 cosine is not '71% match'").
 * The reason is part of the accessible name, because §7.2 requires the
 * explanation to be announced with the number rather than left to a
 * neighbouring element.
 */
export const MatchPercentage: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <MatchBadge
        value={94}
        reason="Same warm beige and matte finish; veining is slightly finer."
      />
      <MatchBadge value={78} reason="Same look, one format larger." />
      <MatchBadge value={52} reason="Similar tone, different surface texture." />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByLabelText(
        "94% match. Same warm beige and matte finish; veining is slightly finer.",
      ),
    ).toBeVisible();
  },
};

/**
 * Colour is never the only signal (§7.3). Rendered greyscale, the three stock
 * states are still distinguishable by dot shape and by their text.
 */
export const ColourIsNotTheOnlySignal: Story = {
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          "Greyscale simulation. If these are still tellable apart, the badge passes §7.3 — verified against deuteranopia, protanopia and tritanopia as part of the Phase 9 audit.",
      },
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-2 grayscale">
      <Badge variant="inStock">In stock</Badge>
      <Badge variant="lowStock">Low stock</Badge>
      <Badge variant="outOfStock">Out of stock</Badge>
    </div>
  ),
};
