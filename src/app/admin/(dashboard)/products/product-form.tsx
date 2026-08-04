"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import {
  createProductAction,
  saveProductTranslationAction,
  updateProductAction,
} from "@/application/actions/admin/product-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AdminProductDetail,
  AdminProductLookups,
  AdminLookup,
} from "@/domain/admin/product";

/**
 * The product editor — docs/02 §1.2's tabbed form.
 *
 * ONE `<form>` wraps every tab, and the tabs are `forceMount`ed. That is
 * the whole reason this works: if each tab were its own form, or unmounted
 * when hidden, a user who filled in Specs and then clicked Copy would lose
 * the Specs values on save. Tabs here are a viewport onto one document, not
 * a wizard.
 *
 * Creating and editing share this component because the fields are
 * identical; only the submit target differs. `product` being null is what
 * distinguishes them.
 */
export function ProductForm({
  product,
  lookups,
  publishBlockers,
}: {
  product: AdminProductDetail | null;
  lookups: AdminProductLookups;
  publishBlockers?: readonly string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [locale, setLocale] = useState<"en" | "ar">("en");

  const isNew = product === null;
  const translation = product?.translations.find((t) => t.locale === locale);

  function onSubmit(formData: FormData) {
    const raw = Object.fromEntries(formData.entries());

    // Unchecked checkboxes are absent from FormData entirely, so every
    // boolean has to be reconstructed rather than read. Missing this is how
    // a checkbox silently becomes un-clearable.
    const booleans = [
      "isRectified",
      "isIndoor",
      "isOutdoor",
      "isFeatured",
      "isNew",
    ] as const;
    const productValues: Record<string, unknown> = { ...raw };
    for (const key of booleans) {
      productValues[key] = formData.get(key) === "on";
    }
    // Tri-state: "" means unknown, which is different from false.
    productValues.isFrostResistant =
      raw.isFrostResistant === "" ? "" : formData.get("isFrostResistant") === "on";

    const translationValues = {
      locale,
      name: raw.name,
      slug: raw.slug,
      shortDescription: raw.shortDescription,
      description: raw.description,
      installationNotes: raw.installationNotes,
      careInstructions: raw.careInstructions,
      seoTitle: raw.seoTitle,
      seoDescription: raw.seoDescription,
      tags: raw.tags,
    };

    startTransition(async () => {
      if (isNew) {
        const result = await createProductAction({
          product: productValues,
          translation: translationValues,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Product created");
        router.push(`/admin/products/${result.data.id}`);
        return;
      }

      // Two calls, deliberately: the product row and its translation are
      // separate concerns with separate schemas, and an edit to Basics
      // should not require the Copy tab to be valid.
      const saved = await updateProductAction({
        id: product.id,
        product: productValues,
      });
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }

      const translated = await saveProductTranslationAction({
        id: product.id,
        translation: translationValues,
      });
      if (!translated.ok) {
        toast.error(translated.error);
        return;
      }

      toast.success("Saved");
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-6" noValidate>
      <Tabs defaultValue="basics">
        <TabsList>
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="specs">Specs</TabsTrigger>
          <TabsTrigger value="commerce">Commerce</TabsTrigger>
          <TabsTrigger value="copy">Copy &amp; SEO</TabsTrigger>
        </TabsList>

        {/*
          `forceMount` on every panel: hidden tabs must stay in the DOM or
          their inputs vanish from FormData on submit. The `data-[state]`
          rule is what actually hides them, since forceMount defeats Radix's
          own unmounting.
        */}
        <TabsContent
          value="basics"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <Section title="Identification">
            <Field label="SKU" htmlFor="sku" required>
              <Input
                id="sku"
                name="sku"
                defaultValue={product?.sku ?? ""}
                required
                spellCheck={false}
                className="font-mono"
              />
            </Field>
            <Field label="Supplier SKU" htmlFor="supplierSku">
              <Input
                id="supplierSku"
                name="supplierSku"
                defaultValue={product?.supplierSku ?? ""}
                className="font-mono"
              />
            </Field>
          </Section>

          <Section title="Classification">
            <SelectField
              label="Brand"
              name="brandId"
              options={lookups.brands}
              defaultValue={product?.brandId}
              required
            />
            <SelectField
              label="Collection"
              name="collectionId"
              options={lookups.collections}
              defaultValue={product?.collectionId}
              allowEmpty
            />
            <SelectField
              label="Category"
              name="categoryId"
              options={lookups.categories}
              defaultValue={product?.categoryId}
              required
            />
          </Section>
        </TabsContent>

        <TabsContent
          value="specs"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <Section title="Dimensions">
            <Field label="Width (mm)" htmlFor="widthMm" required>
              <Input
                id="widthMm"
                name="widthMm"
                type="number"
                min={10}
                max={3200}
                defaultValue={product?.widthMm ?? ""}
                required
                className="tabular-nums"
              />
            </Field>
            <Field label="Height (mm)" htmlFor="heightMm" required>
              <Input
                id="heightMm"
                name="heightMm"
                type="number"
                min={10}
                max={3200}
                defaultValue={product?.heightMm ?? ""}
                required
                className="tabular-nums"
              />
            </Field>
            <Field label="Thickness (mm)" htmlFor="thicknessMm" required>
              <Input
                id="thicknessMm"
                name="thicknessMm"
                type="number"
                step="0.01"
                defaultValue={product?.thicknessMm ?? ""}
                required
                className="tabular-nums"
              />
            </Field>
          </Section>

          <Section title="Material">
            <SelectField
              label="Material"
              name="materialId"
              options={lookups.materials}
              defaultValue={product?.materialId}
              required
            />
            <SelectField
              label="Finish"
              name="finishId"
              options={lookups.finishes}
              defaultValue={product?.finishId}
              required
            />
            <SelectField
              label="Surface look"
              name="surfaceLookId"
              options={lookups.surfaceLooks}
              defaultValue={product?.surfaceLookId}
              required
            />
            <SelectField
              label="Colour family"
              name="colorFamilyId"
              options={lookups.colorFamilies}
              defaultValue={product?.colorFamilyId}
              required
            />
            <Field label="Colour hex" htmlFor="colorHex">
              <Input
                id="colorHex"
                name="colorHex"
                placeholder="#RRGGBB"
                defaultValue={product?.colorHex ?? ""}
                className="font-mono"
              />
            </Field>
          </Section>

          <Section title="Performance">
            <SelectField
              label="Shade variation"
              name="shadeVariation"
              options={["V1", "V2", "V3", "V4"].map((v) => ({ id: v, label: v }))}
              defaultValue={product?.shadeVariation}
              allowEmpty
            />
            <SelectField
              label="Slip rating"
              name="slipRating"
              options={["R9", "R10", "R11", "R12", "R13"].map((v) => ({
                id: v,
                label: v,
              }))}
              defaultValue={product?.slipRating}
              allowEmpty
            />
            <Field label="PEI class" htmlFor="peiClass">
              <Input
                id="peiClass"
                name="peiClass"
                type="number"
                min={0}
                max={5}
                defaultValue={product?.peiClass ?? ""}
                className="tabular-nums"
              />
            </Field>
            <Field label="Water absorption (%)" htmlFor="waterAbsorptionPct">
              <Input
                id="waterAbsorptionPct"
                name="waterAbsorptionPct"
                type="number"
                step="0.001"
                defaultValue={product?.waterAbsorptionPct ?? ""}
                className="tabular-nums"
              />
            </Field>
            <CheckboxField
              label="Rectified"
              name="isRectified"
              defaultChecked={product?.isRectified ?? false}
            />
            <CheckboxField
              label="Suitable indoors"
              name="isIndoor"
              defaultChecked={product?.isIndoor ?? true}
            />
            <CheckboxField
              label="Suitable outdoors"
              name="isOutdoor"
              defaultChecked={product?.isOutdoor ?? false}
            />
          </Section>
        </TabsContent>

        <TabsContent
          value="commerce"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <Section title="Packaging">
            {/*
              These three drive the quantity calculator, which rounds every
              quote up to whole boxes. A wrong m² per box produces a wrong
              order, not a validation error — hence `required` on all three
              and matching bounds in the Zod schema.
            */}
            <Field label="Pieces per box" htmlFor="piecesPerBox" required>
              <Input
                id="piecesPerBox"
                name="piecesPerBox"
                type="number"
                min={1}
                defaultValue={product?.piecesPerBox ?? ""}
                required
                className="tabular-nums"
              />
            </Field>
            <Field label="m² per box" htmlFor="m2PerBox" required>
              <Input
                id="m2PerBox"
                name="m2PerBox"
                type="number"
                step="0.0001"
                defaultValue={product?.m2PerBox ?? ""}
                required
                className="tabular-nums"
              />
            </Field>
            <Field label="kg per box" htmlFor="kgPerBox" required>
              <Input
                id="kgPerBox"
                name="kgPerBox"
                type="number"
                step="0.001"
                defaultValue={product?.kgPerBox ?? ""}
                required
                className="tabular-nums"
              />
            </Field>
            <Field label="Boxes per pallet" htmlFor="boxesPerPallet">
              <Input
                id="boxesPerPallet"
                name="boxesPerPallet"
                type="number"
                min={1}
                defaultValue={product?.boxesPerPallet ?? ""}
                className="tabular-nums"
              />
            </Field>
          </Section>

          <Section title="Pricing">
            <Field label="Base price" htmlFor="basePrice">
              <Input
                id="basePrice"
                name="basePrice"
                type="number"
                step="0.0001"
                defaultValue={product?.basePrice ?? ""}
                className="tabular-nums"
              />
            </Field>
            <Field label="Currency" htmlFor="currency" required>
              <Input
                id="currency"
                name="currency"
                maxLength={3}
                defaultValue={product?.currency ?? "USD"}
                required
                className="font-mono uppercase"
              />
            </Field>
            <SelectField
              label="Price visibility"
              name="priceVisibility"
              options={[
                { id: "public", label: "Public" },
                { id: "trade_only", label: "Trade only" },
                { id: "on_request", label: "On request" },
              ]}
              defaultValue={product?.priceVisibility ?? "public"}
              required
            />
            <Field label="Origin country (ISO-2)" htmlFor="originCountry">
              <Input
                id="originCountry"
                name="originCountry"
                maxLength={2}
                defaultValue={product?.originCountry ?? ""}
                className="font-mono uppercase"
              />
            </Field>
          </Section>

          <Section title="Merchandising">
            <CheckboxField
              label="Featured"
              name="isFeatured"
              defaultChecked={product?.isFeatured ?? false}
            />
            <CheckboxField
              label="Mark as new"
              name="isNew"
              defaultChecked={product?.isNew ?? false}
            />
          </Section>
        </TabsContent>

        <TabsContent
          value="copy"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="text-body-sm text-stone-600">Editing:</span>
            {(["en", "ar"] as const).map((code) => (
              <Button
                key={code}
                type="button"
                variant={locale === code ? "primary" : "ghost"}
                size="sm"
                onClick={() => {
                  setLocale(code);
                }}
              >
                {code.toUpperCase()}
              </Button>
            ))}
          </div>
          {/*
            `key` forces React to rebuild these inputs when the locale
            switches. Without it, `defaultValue` is ignored on re-render and
            the Arabic tab shows the English text.
          */}
          <div key={locale} className="flex flex-col gap-6">
            <Section title="Content">
              <Field label="Name" htmlFor="name" required>
                <Input
                  id="name"
                  name="name"
                  defaultValue={translation?.name ?? ""}
                  required
                  dir={locale === "ar" ? "rtl" : "ltr"}
                />
              </Field>
              <Field label="Slug" htmlFor="slug" required>
                <Input
                  id="slug"
                  name="slug"
                  defaultValue={translation?.slug ?? ""}
                  required
                  spellCheck={false}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                />
              </Field>
              <Field label="Short description" htmlFor="shortDescription">
                <Input
                  id="shortDescription"
                  name="shortDescription"
                  defaultValue={translation?.shortDescription ?? ""}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                />
              </Field>
              <Field label="Description" htmlFor="description" wide>
                <textarea
                  id="description"
                  name="description"
                  rows={6}
                  defaultValue={translation?.description ?? ""}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                  className="w-full rounded-sm border border-stone-300 bg-white p-3 text-body-sm"
                />
              </Field>
              <Field label="Installation notes" htmlFor="installationNotes" wide>
                <textarea
                  id="installationNotes"
                  name="installationNotes"
                  rows={3}
                  defaultValue={translation?.installationNotes ?? ""}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                  className="w-full rounded-sm border border-stone-300 bg-white p-3 text-body-sm"
                />
              </Field>
              <Field label="Care instructions" htmlFor="careInstructions" wide>
                <textarea
                  id="careInstructions"
                  name="careInstructions"
                  rows={3}
                  defaultValue={translation?.careInstructions ?? ""}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                  className="w-full rounded-sm border border-stone-300 bg-white p-3 text-body-sm"
                />
              </Field>
            </Section>

            <Section title="SEO">
              <Field label="SEO title" htmlFor="seoTitle">
                <Input
                  id="seoTitle"
                  name="seoTitle"
                  defaultValue={translation?.seoTitle ?? ""}
                />
              </Field>
              <Field label="SEO description" htmlFor="seoDescription">
                <Input
                  id="seoDescription"
                  name="seoDescription"
                  defaultValue={translation?.seoDescription ?? ""}
                />
              </Field>
              <Field label="Tags (comma separated)" htmlFor="tags">
                <Input
                  id="tags"
                  name="tags"
                  defaultValue={translation?.tags.join(", ") ?? ""}
                />
              </Field>
            </Section>
          </div>
        </TabsContent>
      </Tabs>

      {publishBlockers && publishBlockers.length > 0 ? (
        <div className="rounded-lg border border-warning-600 bg-warning-50 p-4">
          <p className="text-body-sm font-medium text-warning-600">
            Not ready to publish
          </p>
          <ul className="mt-2 list-disc ps-5 text-body-sm text-stone-600">
            {publishBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {isNew ? "Create product" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

// ── Layout primitives ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="mt-6 rounded-lg border border-border bg-white p-6 first:mt-4">
      <legend className="px-2 font-display text-body-lg">{title}</legend>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  htmlFor,
  required,
  wide,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={wide ? "flex flex-col gap-2 sm:col-span-2" : "flex flex-col gap-2"}
    >
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span aria-hidden className="text-danger-600">
            {" *"}
          </span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
  required,
  allowEmpty,
}: {
  label: string;
  name: string;
  options: readonly AdminLookup[];
  defaultValue?: string | null;
  required?: boolean;
  allowEmpty?: boolean;
}) {
  return (
    <Field label={label} htmlFor={name} {...(required ? { required: true } : {})}>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required ?? false}
        className="h-11 rounded-sm border border-stone-300 bg-white px-3 text-body-sm"
      >
        {allowEmpty || !required ? <option value="">—</option> : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function CheckboxField({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={name} name={name} defaultChecked={defaultChecked} />
      <Label htmlFor={name}>{label}</Label>
    </div>
  );
}
