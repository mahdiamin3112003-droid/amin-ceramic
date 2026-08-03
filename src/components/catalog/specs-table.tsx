import { useTranslations } from "next-intl";

import type { ProductDetail } from "@/domain/product/entity";

/**
 * Full specification table — docs/02-ux-blueprint.md §3.3: "always expanded
 * (never an accordion — trade needs Ctrl+F)". Grouped exactly as the
 * comparison table groups (`src/domain/comparison/entity.ts`'s `FIELDS`),
 * so a visitor who compares two tiles sees the same taxonomy on the PDP.
 */
export function SpecsTable({ product }: { product: ProductDetail }) {
  const t = useTranslations("catalog.specs");

  const groups: readonly {
    title: string;
    rows: readonly [string, string | null][];
  }[] = [
    {
      title: t("dimensions"),
      rows: [
        [
          t("format"),
          product.nominalFormat ??
            `${String(product.widthMm)}×${String(product.heightMm)} mm`,
        ],
        [t("thickness"), `${String(product.thicknessMm)} mm`],
        [t("rectified"), product.isRectified ? t("yes") : t("no")],
      ],
    },
    {
      title: t("material"),
      rows: [
        [t("materialType"), product.material.label],
        [t("colour"), product.colorFamily.label],
      ],
    },
    {
      title: t("surface"),
      rows: [
        [t("finish"), product.finish.label],
        [t("look"), product.surfaceLook.label],
        [t("shadeVariation"), product.shadeVariation ?? "—"],
      ],
    },
    {
      title: t("performance"),
      rows: [
        [t("slipRating"), product.slipRating ?? "—"],
        [t("peiClass"), product.peiClass !== null ? String(product.peiClass) : "—"],
        [
          t("waterAbsorption"),
          product.waterAbsorptionPct !== null
            ? `${String(product.waterAbsorptionPct)}%`
            : "—",
        ],
        [
          t("frostResistant"),
          product.isFrostResistant === null
            ? "—"
            : product.isFrostResistant
              ? t("yes")
              : t("no"),
        ],
        [t("indoor"), product.isIndoor ? t("yes") : t("no")],
        [t("outdoor"), product.isOutdoor ? t("yes") : t("no")],
      ],
    },
    {
      title: t("packaging"),
      rows: [
        [t("piecesPerBox"), String(product.piecesPerBox)],
        [t("m2PerBox"), `${String(product.m2PerBox)} m²`],
        [t("kgPerBox"), `${String(product.kgPerBox)} kg`],
        [
          t("boxesPerPallet"),
          product.boxesPerPallet !== null ? String(product.boxesPerPallet) : "—",
        ],
        [t("originCountry"), product.originCountry ?? "—"],
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-heading-md">{t("heading")}</h2>
      <div className="grid gap-8 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-3">
            <h3 className="text-caption font-medium text-stone-600 uppercase">
              {group.title}
            </h3>
            <dl className="flex flex-col divide-y divide-border">
              {group.rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between gap-4 py-2 text-body-sm"
                >
                  <dt className="text-stone-600">{label}</dt>
                  <dd className="text-spec">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
