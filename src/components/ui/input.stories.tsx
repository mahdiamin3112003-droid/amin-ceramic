import type { Meta, StoryObj } from "@storybook/nextjs";

import { expect, userEvent, within } from "storybook/test";

import { Field, Input } from "@/components/ui/input";

/**
 * Input — docs/02-ux-blueprint.md §4.8, all eight states.
 *
 * The `Field` wrapper is where the rules live: labels always visible above,
 * placeholders showing format examples only, and helper text REPLACED by the
 * error message rather than stacked with it.
 */
const meta = {
  title: "Primitives/Input",
  component: Input,
  parameters: {
    docs: {
      description: {
        component:
          "Height is 44px at `md`. §4.8 specifies 40px, but §6.5 and §7.5 both require 44×44 minimum — two sections and the accessibility argument beat one, so the documented 40px is available as `sm` for dense admin tables. See docs/adr/0008-input-height.md.",
      },
    },
  },
  argTypes: {
    inputSize: { control: "inline-radio", options: ["sm", "md", "lg"] },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rest: Story = {
  args: { placeholder: "e.g. 2.4" },
};

/** All eight states from §4.8 on one screen. */
export const States: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="grid max-w-lg gap-5">
      <Field
        label="Rest"
        helper="Placeholders show a format example, never the label"
      >
        <Input placeholder="e.g. 2.4" />
      </Field>

      <Field label="Filled">
        <Input defaultValue="2.4" />
      </Field>

      <Field label="Error" error="Enter a width between 0.1 and 50 metres.">
        <Input defaultValue="0" />
      </Field>

      <Field label="Success" helper="Used sparingly — async validation only">
        <Input defaultValue="amin@example.com" success />
      </Field>

      <Field label="Disabled" helper="No border change on hover">
        <Input defaultValue="Not editable" disabled />
      </Field>

      <Field label="Read-only" helper="Reads as a value, not an invitation to type">
        <Input defaultValue="AC-6012-MT" readOnly />
      </Field>

      <p className="max-w-prose text-body-sm text-stone-600">
        Hover and focus cannot be shown statically: hover raises the border to
        stone-500, focus raises it to navy-700 and adds the one global focus ring.
      </p>
    </div>
  ),
};

export const Sizes: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="grid max-w-lg gap-5">
      <Field label="sm — 40px, dense admin tables only">
        <Input inputSize="sm" placeholder="Small" />
      </Field>
      <Field label="md — 44px, the default">
        <Input inputSize="md" placeholder="Medium" />
      </Field>
      <Field label="lg — 52px">
        <Input inputSize="lg" placeholder="Large" />
      </Field>
    </div>
  ),
};

/**
 * Helper text is REPLACED by the error, not stacked with it (§4.8). Leaving
 * that to each call site is how you end up with both showing at once.
 */
export const ErrorReplacesHelper: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="grid max-w-lg gap-5">
      <Field label="Room width" helper="e.g. 2.4">
        <Input defaultValue="2.4" />
      </Field>
      <Field label="Room width" error="Must be greater than zero.">
        <Input defaultValue="0" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The helper is gone wherever an error is present.
    await expect(canvas.queryAllByText("e.g. 2.4")).toHaveLength(1);
    await expect(canvas.getByText("Must be greater than zero.")).toBeVisible();

    // The error is announced, and the control is marked invalid.
    await expect(canvas.getByText("Must be greater than zero.")).toHaveAttribute(
      "role",
      "alert",
    );
    const inputs = canvas.getAllByRole("textbox");
    await expect(inputs[1]).toHaveAttribute("aria-invalid", "true");
  },
};

/** The label is wired to the control, and the message to both. */
export const AccessibleWiring: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Field
      label="Email"
      required
      helper="We use this to send your quote reference."
    >
      <Input type="email" />
    </Field>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Clicking the label focuses the control — the htmlFor/id link is real.
    await userEvent.click(canvas.getByText("Email"));
    const input = canvas.getByRole("textbox");
    await expect(input).toHaveFocus();
    await expect(input).toHaveAccessibleDescription(
      "We use this to send your quote reference.",
    );
  },
};
