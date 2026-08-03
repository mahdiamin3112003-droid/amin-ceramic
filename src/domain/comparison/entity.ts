import type { ProductDetail } from "@/domain/product/entity";

/**
 * Product comparison — the domain entity.
 *
 * docs/01-architecture.md §5.3: the domain layer imports nothing outside
 * domain/.
 *
 * docs/04-api-architecture.md §6.6: comparison rows are "computed server-side
 * (not client string-diff)". This is that computation — a pure function over
 * already-fetched `ProductDetail`s, grouped the same way the PDP's spec
 * table is (docs/02-ux-blueprint.md §3.3), so identical rows can collapse
 * under "Show identical specs (N)" per §3.6.
 */

export interface CompareRow {
  readonly groupKey:
    "dimensions" | "material" | "surface" | "performance" | "packaging" | "price";
  readonly attributeKey: string;
  readonly label: string;
  readonly values: readonly string[];
  readonly differs: boolean;
  readonly unit: string | null;
}

function formatBoolean(value: boolean | null): string {
  if (value === null) return "—";
  return value ? "Yes" : "No";
}

function formatNullable(value: string | number | null): string {
  return value === null ? "—" : String(value);
}

interface FieldDef {
  readonly groupKey: CompareRow["groupKey"];
  readonly attributeKey: string;
  readonly label: string;
  readonly unit: string | null;
  readonly get: (product: ProductDetail) => string;
}

const FIELDS: readonly FieldDef[] = [
  {
    groupKey: "dimensions",
    attributeKey: "format",
    label: "Format",
    unit: "mm",
    get: (p) => p.nominalFormat ?? `${String(p.widthMm)}×${String(p.heightMm)}`,
  },
  {
    groupKey: "dimensions",
    attributeKey: "thickness",
    label: "Thickness",
    unit: "mm",
    get: (p) => formatNullable(p.thicknessMm),
  },
  {
    groupKey: "dimensions",
    attributeKey: "rectified",
    label: "Rectified",
    unit: null,
    get: (p) => formatBoolean(p.isRectified),
  },
  {
    groupKey: "material",
    attributeKey: "material",
    label: "Material",
    unit: null,
    get: (p) => p.material.label,
  },
  {
    groupKey: "material",
    attributeKey: "colorFamily",
    label: "Colour",
    unit: null,
    get: (p) => p.colorFamily.label,
  },
  {
    groupKey: "surface",
    attributeKey: "finish",
    label: "Finish",
    unit: null,
    get: (p) => p.finish.label,
  },
  {
    groupKey: "surface",
    attributeKey: "surfaceLook",
    label: "Look",
    unit: null,
    get: (p) => p.surfaceLook.label,
  },
  {
    groupKey: "performance",
    attributeKey: "slipRating",
    label: "Slip rating",
    unit: null,
    get: (p) => formatNullable(p.slipRating),
  },
  {
    groupKey: "performance",
    attributeKey: "peiClass",
    label: "PEI class",
    unit: null,
    get: (p) => formatNullable(p.peiClass),
  },
  {
    groupKey: "performance",
    attributeKey: "waterAbsorption",
    label: "Water absorption",
    unit: "%",
    get: (p) => formatNullable(p.waterAbsorptionPct),
  },
  {
    groupKey: "performance",
    attributeKey: "frostResistant",
    label: "Frost resistant",
    unit: null,
    get: (p) => formatBoolean(p.isFrostResistant),
  },
  {
    groupKey: "performance",
    attributeKey: "outdoorSuitable",
    label: "Suitable outdoors",
    unit: null,
    get: (p) => formatBoolean(p.isOutdoor),
  },
  {
    groupKey: "packaging",
    attributeKey: "piecesPerBox",
    label: "Pieces / box",
    unit: null,
    get: (p) => formatNullable(p.piecesPerBox),
  },
  {
    groupKey: "packaging",
    attributeKey: "m2PerBox",
    label: "m² / box",
    unit: "m²",
    get: (p) => formatNullable(p.m2PerBox),
  },
  {
    groupKey: "packaging",
    attributeKey: "kgPerBox",
    label: "kg / box",
    unit: "kg",
    get: (p) => formatNullable(p.kgPerBox),
  },
  {
    groupKey: "price",
    attributeKey: "basePrice",
    label: "Price",
    unit: null,
    get: (p) =>
      p.basePrice === null
        ? "On request"
        : `${p.currency} ${String(p.basePrice)}/m²`,
  },
];

const MIN_COMPARE_PRODUCTS = 2;
const MAX_COMPARE_PRODUCTS = 4;

export class InvalidComparisonError extends RangeError {}

export function buildComparisonRows(
  products: readonly ProductDetail[],
): readonly CompareRow[] {
  if (
    products.length < MIN_COMPARE_PRODUCTS ||
    products.length > MAX_COMPARE_PRODUCTS
  ) {
    throw new InvalidComparisonError(
      `compare requires ${String(MIN_COMPARE_PRODUCTS)}-${String(MAX_COMPARE_PRODUCTS)} products, got ${String(products.length)}`,
    );
  }

  return FIELDS.map((field) => {
    const values = products.map((product) => field.get(product));
    return {
      groupKey: field.groupKey,
      attributeKey: field.attributeKey,
      label: field.label,
      unit: field.unit,
      values,
      differs: new Set(values).size > 1,
    };
  });
}
