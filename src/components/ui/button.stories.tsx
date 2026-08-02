import type { Meta, StoryObj } from "@storybook/nextjs";

import { expect, userEvent, within } from "storybook/test";
import { Heart, Plus } from "lucide-react";

import { Icon } from "@/components/brand/icon";
import { Diamond } from "@/components/brand/diamond";
import { Button } from "@/components/ui/button";

/**
 * Button — docs/02-ux-blueprint.md §4.7.
 *
 * Six variants, three sizes, every state. The `Matrix` story is the one that
 * matters for review: it puts all six variants against all three sizes on one
 * screen, which is the only way to see whether they read as one family.
 */
const meta = {
  title: "Primitives/Button",
  component: Button,
  parameters: {
    docs: {
      description: {
        component:
          "Six variants (§4.7). Minimum touch target 44×44 everywhere, including icon buttons. Loading keeps the label in place and swaps the leading icon for a diamond spinner, without changing width — which prevents both layout shift and the accidental double-click you get when a button resizes under the cursor.",
      },
    },
  },
  args: { children: "Add to basket" },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost", "text", "destructive", "icon"],
    },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: "primary" } };
export const Secondary: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Text: Story = {
  args: { variant: "text", children: "View collection" },
};
export const Destructive: Story = {
  args: { variant: "destructive", children: "Delete product" },
};

export const IconOnly: Story = {
  args: {
    variant: "icon",
    iconOnly: true,
    children: <Icon icon={Heart} size="md" />,
    "aria-label": "Save to wishlist",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Icon-only controls always carry an aria-label (§7.2), and stay 44×44 regardless of the icon inside them.",
      },
    },
  },
};

/** Every variant against every size — the review view. */
export const Matrix: Story = {
  parameters: { controls: { disable: true } },
  render: () => {
    const variants = [
      "primary",
      "secondary",
      "ghost",
      "text",
      "destructive",
    ] as const;
    const sizes = ["sm", "md", "lg"] as const;

    return (
      <table className="border-separate border-spacing-4">
        <thead>
          <tr>
            <th className="text-start text-caption text-stone-600">variant</th>
            {sizes.map((size) => (
              <th key={size} className="text-start text-caption text-stone-600">
                {size}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => (
            <tr key={variant}>
              <td className="text-spec-sm text-stone-600">{variant}</td>
              {sizes.map((size) => (
                <td key={size}>
                  <Button variant={variant} size={size}>
                    Add to basket
                  </Button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
};

/** Every state of the primary variant, side by side. */
export const States: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-6">
      {(["primary", "secondary", "ghost", "destructive"] as const).map(
        (variant) => (
          <div key={variant} className="flex flex-col gap-2">
            <span className="text-caption text-stone-600">{variant}</span>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant={variant}>Rest</Button>
              <Button variant={variant} className="hover:!opacity-100" disabled>
                Disabled
              </Button>
              <Button variant={variant} loading loadingLabel="Saving">
                Loading
              </Button>
              <Button
                variant={variant}
                leadingIcon={<Icon icon={Plus} size="sm" />}
              >
                With icon
              </Button>
            </div>
          </div>
        ),
      )}
      <p className="max-w-prose text-body-sm text-stone-600">
        Hover, focus and active states cannot be shown statically. Hover a button,
        then Tab to it — the focus ring is the single global treatment from §7.4,
        never a per-component one.
      </p>
    </div>
  ),
};

/**
 * Loading is interaction-tested rather than eyeballed: the width must not
 * change, because a button that resizes under the cursor causes exactly the
 * double-click §4.7 is guarding against.
 */
export const LoadingDoesNotResize: Story = {
  args: { variant: "primary" },
  parameters: { controls: { disable: true } },
  render: (args) => (
    <div className="flex items-center gap-4">
      <Button {...args} leadingIcon={<Diamond className="size-4" />}>
        Add to basket
      </Button>
      <Button {...args} loading loadingLabel="Adding to basket">
        Add to basket
      </Button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [idle, loading] = canvas.getAllByRole("button");

    await expect(idle).toBeDefined();
    await expect(loading).toBeDefined();
    // Same label, same padding, same icon slot -> same width.
    await expect(
      Math.abs(
        idle!.getBoundingClientRect().width -
          loading!.getBoundingClientRect().width,
      ),
    ).toBeLessThanOrEqual(1);

    // A loading button is not clickable, and announces itself.
    await expect(loading).toBeDisabled();
    await expect(loading).toHaveAttribute("aria-busy", "true");
  },
};

/** Tab order and the one focus treatment. */
export const Focus: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <Button variant="primary">First</Button>
        <Button variant="secondary">Second</Button>
        <Button variant="ghost">Third</Button>
        <Button variant="primary" disabled>
          Skipped (disabled)
        </Button>
      </div>
      <div
        data-ground="dark"
        className="flex flex-wrap gap-3 rounded-lg bg-navy-900 p-6"
      >
        <Button variant="primary">On dark</Button>
        <Button
          variant="secondary"
          className="border-white text-white hover:bg-navy-800"
        >
          Also on dark
        </Button>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "First" })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Second" })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Third" })).toHaveFocus();
    // Disabled controls are skipped, not focused-then-ignored.
    await userEvent.tab();
    await expect(
      canvas.getByRole("button", { name: "Skipped (disabled)" }),
    ).not.toHaveFocus();
  },
};
