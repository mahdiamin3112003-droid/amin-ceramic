import type { Meta, StoryObj } from "@storybook/nextjs";

import { useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Form controls — docs/02-ux-blueprint.md §3.5 and §4.8.
 *
 * These are the controls the catalog filter rail is built from (§3.2), so their
 * touch targets matter more than their size suggests: the box may be 20px, but
 * the hit area is 44×44 via a pseudo-element, per §6.5.
 */
const meta = {
  title: "Primitives/Form controls",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const CheckboxStory: Story = {
  name: "Checkbox",
  render: function CheckboxRender() {
    const [checked, setChecked] = useState<Record<string, boolean>>({
      marble: true,
      wood: false,
    });
    return (
      <fieldset className="flex max-w-xs flex-col gap-3">
        <legend className="pb-2 text-caption text-stone-600">Look</legend>
        {[
          { id: "marble", label: "Marble", count: 340 },
          { id: "wood", label: "Wood", count: 210 },
          { id: "concrete", label: "Concrete", count: 0 },
        ].map(({ id, label, count }) => (
          <div key={id} className="flex items-center gap-3">
            <Checkbox
              id={id}
              checked={checked[id] ?? false}
              disabled={count === 0}
              onCheckedChange={(value) => {
                setChecked((prev) => ({ ...prev, [id]: value === true }));
              }}
            />
            <Label htmlFor={id} className="flex-1 justify-between">
              {label}
              {/* Facet counts stay visible and zero-result options are disabled
                  rather than hidden — hiding them makes the filter feel broken
                  (§3.2). */}
              <span className="text-spec-sm text-stone-600">{count}</span>
            </Label>
          </div>
        ))}
        <p className="text-body-sm text-stone-600">
          The box is 20px; the hit area is 44×44. Tap near a label on a phone — it
          still registers.
        </p>
      </fieldset>
    );
  },
};

export const RadioStory: Story = {
  name: "Radio group",
  render: () => (
    <RadioGroup defaultValue="10" className="flex max-w-xs flex-col gap-3">
      <span className="text-caption text-stone-600">Wastage</span>
      {(
        [
          { value: "7", label: "7% — straight grid" },
          { value: "10", label: "10% — default" },
          { value: "15", label: "15% — herringbone" },
        ] as const
      ).map(({ value, label }) => (
        <div key={value} className="flex items-center gap-3">
          <RadioGroupItem value={value} id={`wastage-${value}`} />
          <Label htmlFor={`wastage-${value}`}>{label}</Label>
        </div>
      ))}
    </RadioGroup>
  ),
};

export const SwitchStory: Story = {
  name: "Switch",
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Switch id="spec-mode" />
        <Label htmlFor="spec-mode">Spec mode</Label>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="spec-mode-on" defaultChecked />
        <Label htmlFor="spec-mode-on">Spec mode (on)</Label>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="spec-mode-off" disabled />
        <Label htmlFor="spec-mode-off">Disabled</Label>
      </div>
      <p className="max-w-prose text-body-sm text-stone-600">
        Spec mode is the toggle that lets one catalog serve consumers and trade
        without becoming two sites (decision of record #2). In RTL the thumb travels
        the other way — check the locale toolbar.
      </p>
    </div>
  ),
};

export const SliderStory: Story = {
  name: "Slider (dual handle)",
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Label>Price per m²</Label>
        <Slider defaultValue={[18, 42]} min={0} max={80} step={1} />
      </div>
      <p className="text-body-sm text-stone-600">
        Dual handle for the price and dimension filters (§4.8). Each thumb has a
        44×44 hit area and responds to arrow keys.
      </p>
    </div>
  ),
};

export const SelectStory: Story = {
  name: "Select",
  render: () => (
    <div className="flex w-64 flex-col gap-2">
      <Label htmlFor="sort">Sort</Label>
      <Select defaultValue="relevance">
        <SelectTrigger id="sort">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="relevance">Relevance</SelectItem>
          <SelectItem value="price-asc">Price, low to high</SelectItem>
          <SelectItem value="price-desc">Price, high to low</SelectItem>
          <SelectItem value="newest">Newest</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

/**
 * Combobox is a COMPOSITION (Popover + Command), not a Radix primitive. §3.5
 * names it as a primitive, so it ships as one rather than being re-derived at
 * every call site.
 */
export const ComboboxStory: Story = {
  name: "Combobox",
  render: function ComboboxRender() {
    const [value, setValue] = useState("");
    return (
      <div className="flex w-72 flex-col gap-2">
        <Label htmlFor="brand">Brand</Label>
        <Combobox
          id="brand"
          value={value}
          onValueChange={setValue}
          placeholder="Select a brand"
          searchPlaceholder="Search brands…"
          empty={
            <div className="flex flex-col gap-1 py-6 text-center">
              <p className="text-body-sm">No brand found</p>
              <p className="text-body-sm text-stone-600">
                Check the spelling, or add it in Settings.
              </p>
            </div>
          }
          options={[
            { value: "marazzi", label: "Marazzi", hint: "IT · 412" },
            { value: "porcelanosa", label: "Porcelanosa", hint: "ES · 288" },
            { value: "atlas", label: "Atlas Concorde", hint: "IT · 190" },
            { value: "iris", label: "Iris Ceramica", hint: "IT · 96" },
          ]}
        />
        <p className="text-body-sm text-stone-600">
          The empty state is required, not optional — §4.15: never a bare &ldquo;No
          results&rdquo;.
        </p>
      </div>
    );
  },
};

export const TabsStory: Story = {
  name: "Tabs",
  render: () => (
    <Tabs defaultValue="specs" className="w-[32rem]">
      <TabsList>
        <TabsTrigger value="specs">Specifications</TabsTrigger>
        <TabsTrigger value="stock">Stock</TabsTrigger>
        <TabsTrigger value="downloads">Downloads</TabsTrigger>
      </TabsList>
      <TabsContent value="specs" className="pt-4">
        <p className="text-spec">600 × 1200 mm · 9 mm · Matte · R10 · V2</p>
      </TabsContent>
      <TabsContent value="stock" className="pt-4">
        <p className="text-body-sm">In stock — Baabda, 48 m², lot #A4471</p>
      </TabsContent>
      <TabsContent value="downloads" className="pt-4">
        <p className="text-body-sm">Datasheet PDF · Technical drawing</p>
      </TabsContent>
    </Tabs>
  ),
};

export const AccordionStory: Story = {
  name: "Accordion",
  render: () => (
    <div className="flex w-[32rem] flex-col gap-4">
      <Accordion type="single" collapsible>
        <AccordionItem value="delivery">
          <AccordionTrigger>Delivery and lead times</AccordionTrigger>
          <AccordionContent>
            Regional delivery across Lebanon. In-stock items ship within 3 working
            days; anything requiring a new lot takes 2–4 weeks.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="lots">
          <AccordionTrigger>Why order from one lot?</AccordionTrigger>
          <AccordionContent>
            Tiles from different production lots differ in shade. Ordering a whole
            job from one lot, plus wastage for cuts, avoids a visible mismatch
            across the floor.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <p className="text-body-sm text-stone-600">
        Note: product specification tables are never put in an accordion (decision
        of record #12) — trade users need Ctrl+F to find a value.
      </p>
    </div>
  ),
};

export const SeparatorStory: Story = {
  name: "Separator",
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <p className="text-body-sm">Hairlines do most of the separation work.</p>
      <Separator />
      <p className="text-body-sm text-stone-600">
        Shadow is reserved for things that genuinely float (§4.6).
      </p>
    </div>
  ),
};
