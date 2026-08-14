/**
 * Real Amin Ceramic inventory — the client's first 12 products.
 *
 * ── Provenance of each field ──
 * Names, formats, box data and stock: given by the client.
 * Thickness (10mm; 20mm for Bali Plus) and weight (28 kg/box): confirmed by
 * the client by format.
 * Material `porcelain`: CONFIRMED by the client — no longer inferred.
 * `surfaceLook`: read from the product photography, not a spec sheet.
 * `slipRating`: confirmed by the client — R10 across the board, except
 * Bali Plus Ash 2cm at R12 (its outdoor-grade rating).
 *
 * ── Missing values are null, never text ──
 * Any field still genuinely unknown stays NULL. It must never become the
 * string "unknown" — that survives import, passes validation, and then renders
 * on the live site as `Slip rating: unknown`, which reads as broken rather
 * than incomplete. Draft status plus the blocker list is the mechanism for
 * "not ready"; placeholder text is not.
 */

export interface ImportProduct {
  readonly name: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly thicknessMm: number;
  readonly piecesPerBox: number;
  readonly m2PerBox: number;
  readonly kgPerBox: number;
  /**
   * The tenant-wide total, and — per the client — the permanent form of
   * this figure. Not a placeholder waiting on a Rmeileh/Choukine split: the
   * business deliberately does not manage stock as two separate location
   * totals, so a single unallocated (`locationId: null`) row is correct on
   * an ongoing basis, not just for now.
   */
  readonly stockM2: number;

  readonly finish: "matte";
  readonly surfaceLook: "concrete" | "marble" | "solid_color" | "stone" | "wood";
  /** Includes families created by this import — see NEW_COLOR_FAMILIES. */
  readonly colorFamily: string;
  /** Application keys. `wall` matters: these are floor AND wall products. */
  readonly applications: readonly string[];

  readonly isIndoor: boolean;
  readonly isOutdoor: boolean;
  /** Confirmed by the client. R9–R13 per `SlipRating` in the domain layer. */
  readonly slipRating: "R9" | "R10" | "R11" | "R12" | "R13" | null;
  /** Folder under `product-photos/`. Photos pending; nothing attached yet. */
  readonly photoFolder: string;
}

/** The client's own name — house-brand product, a real value, not a stand-in. */
export const BRAND_NAME = "Amin Ceramic Tiles";

/** Confirmed by the client — no longer inferred. */
export const MATERIAL_KEY = "porcelain";

/** ISO-3166 alpha-2. "Made in Spain" — the origin, not the brand. */
export const ORIGIN_COUNTRY = "ES";

/** Navigation root. `application_ids` carries the floor/wall truth. */
export const CATEGORY_SLUG = "floor";

/**
 * Real colours the client uses, added as taxonomy rather than mapped onto the
 * existing five. Collapsing "Cletus White" and "Crotone Pearl" both to `white`
 * would make the colour filter lie about two genuinely different tiles.
 */
export const NEW_COLOR_FAMILIES: readonly { key: string; name: string }[] = [
  { key: "bone", name: "Bone" },
  { key: "cream", name: "Cream" },
  { key: "sand", name: "Sand" },
  { key: "mink", name: "Mink" },
  { key: "pearl", name: "Pearl" },
  { key: "ash", name: "Ash" },
];

const FLOOR_AND_WALL = ["floor", "wall"] as const;

export const PRODUCTS: readonly ImportProduct[] = [
  {
    name: "Alissa Beige Matte",
    widthMm: 600,
    heightMm: 1200,
    thicknessMm: 10,
    piecesPerBox: 2,
    m2PerBox: 1.44,
    kgPerBox: 28,
    stockM2: 171.36,
    finish: "matte",
    surfaceLook: "concrete", // photo reads concrete, not the marble its name suggests
    colorFamily: "beige",
    applications: FLOOR_AND_WALL,
    isIndoor: true,
    isOutdoor: false,
    slipRating: "R10",
    photoFolder: "alissa-beige",
  },
  {
    name: "Anhor Bone",
    widthMm: 600,
    heightMm: 1200,
    thicknessMm: 10,
    piecesPerBox: 2,
    m2PerBox: 1.44,
    kgPerBox: 28,
    stockM2: 112.81,
    finish: "matte",
    surfaceLook: "stone",
    colorFamily: "bone",
    applications: FLOOR_AND_WALL,
    isIndoor: true,
    isOutdoor: false,
    slipRating: "R10",
    photoFolder: "anhor-bone",
  },
  {
    name: "Belerofonte Natural",
    widthMm: 600,
    heightMm: 1200,
    thicknessMm: 10,
    piecesPerBox: 2,
    m2PerBox: 1.44,
    kgPerBox: 28,
    stockM2: 202.2,
    finish: "matte",
    surfaceLook: "marble",
    colorFamily: "grey",
    applications: FLOOR_AND_WALL,
    isIndoor: true,
    isOutdoor: false,
    slipRating: "R10",
    photoFolder: "belerofonte-natural",
  },
  {
    // "ANTID." reads as antideslizante (anti-slip). The client's confirmed
    // rating (R10) happens to land below what that name implies — an actual
    // answer, not the guess this comment used to warn against.
    name: "Antid. Delft Bone Matte",
    widthMm: 1000,
    heightMm: 1000,
    thicknessMm: 10,
    piecesPerBox: 2,
    m2PerBox: 2,
    kgPerBox: 28,
    stockM2: 186.12,
    finish: "matte",
    surfaceLook: "stone",
    colorFamily: "bone",
    applications: FLOOR_AND_WALL,
    isIndoor: true,
    isOutdoor: false,
    slipRating: "R10",
    photoFolder: "antid-delft-bone",
  },
  {
    name: "Alypia Crema Matte",
    widthMm: 600,
    heightMm: 1200,
    thicknessMm: 10,
    piecesPerBox: 2,
    m2PerBox: 1.44,
    kgPerBox: 28,
    stockM2: 205.63,
    finish: "matte",
    surfaceLook: "concrete",
    colorFamily: "cream",
    applications: FLOOR_AND_WALL,
    isIndoor: true,
    isOutdoor: false,
    slipRating: "R10",
    photoFolder: "alypia-crema",
  },
  {
    name: "Antid. Aren Beige Matte",
    widthMm: 1000,
    heightMm: 1000,
    thicknessMm: 10,
    piecesPerBox: 2,
    m2PerBox: 2,
    kgPerBox: 28,
    stockM2: 112.86,
    finish: "matte",
    surfaceLook: "stone",
    colorFamily: "beige",
    applications: FLOOR_AND_WALL,
    isIndoor: true,
    isOutdoor: false,
    slipRating: "R10",
    photoFolder: "antid-aren-beige",
  },
  {
    // 20mm, 1 piece per box — confirmed by the client as outdoor-only,
    // consistent with the R12 slip rating (outdoor-grade) they also gave.
    // `application_ids` is `["outdoor"]` alone: the five application keys
    // (floor, wall, bathroom, kitchen, outdoor) are sibling tags with no
    // built-in hierarchy — "outdoor" is not a variant of "floor" in this
    // taxonomy, so tagging both would claim an indoor floor/wall use this
    // product does not have. `isIndoor`/`isOutdoor` carry the same signal
    // as a pair of booleans, for the technical filter/index.
    name: "Bali Plus Ash 2cm",
    widthMm: 1000,
    heightMm: 1000,
    thicknessMm: 20,
    piecesPerBox: 1,
    m2PerBox: 1,
    kgPerBox: 28,
    stockM2: 329,
    finish: "matte",
    surfaceLook: "stone",
    colorFamily: "ash",
    applications: ["outdoor"],
    isIndoor: false,
    isOutdoor: true,
    slipRating: "R12",
    photoFolder: "bali-plus-ash",
  },
  {
    name: "Cefeo Perla Matte",
    widthMm: 600,
    heightMm: 1200,
    thicknessMm: 10,
    piecesPerBox: 2,
    m2PerBox: 1.44,
    kgPerBox: 28,
    stockM2: 228.48,
    finish: "matte",
    surfaceLook: "concrete",
    colorFamily: "pearl",
    applications: FLOOR_AND_WALL,
    isIndoor: true,
    isOutdoor: false,
    slipRating: "R10",
    photoFolder: "cefeo-perla",
  },
  {
    name: "Chrono Mink",
    widthMm: 1000,
    heightMm: 1000,
    thicknessMm: 10,
    piecesPerBox: 2, // corrected by the client from 1
    m2PerBox: 2,
    kgPerBox: 28,
    stockM2: 166.08,
    finish: "matte",
    surfaceLook: "stone",
    colorFamily: "mink",
    applications: FLOOR_AND_WALL,
    isIndoor: true,
    isOutdoor: false,
    slipRating: "R10",
    photoFolder: "chrono-mink",
  },
  {
    name: "Cletus White",
    widthMm: 600,
    heightMm: 1200,
    thicknessMm: 10,
    piecesPerBox: 2,
    m2PerBox: 1.44,
    kgPerBox: 28,
    stockM2: 104.88,
    finish: "matte",
    surfaceLook: "marble",
    colorFamily: "white",
    applications: FLOOR_AND_WALL,
    isIndoor: true,
    isOutdoor: false,
    slipRating: "R10",
    photoFolder: "cletus-white",
  },
  {
    name: "Crotone Sand",
    widthMm: 600,
    heightMm: 1200,
    thicknessMm: 10,
    piecesPerBox: 2,
    m2PerBox: 1.44,
    kgPerBox: 28,
    stockM2: 215.63,
    finish: "matte",
    surfaceLook: "concrete",
    colorFamily: "sand",
    applications: FLOOR_AND_WALL,
    isIndoor: true,
    isOutdoor: false,
    slipRating: "R10",
    photoFolder: "crotone-sand",
  },
  {
    name: "Crotone Pearl Matte",
    widthMm: 600,
    heightMm: 1200,
    thicknessMm: 10,
    piecesPerBox: 2,
    m2PerBox: 1.44,
    kgPerBox: 28,
    stockM2: 456.96,
    finish: "matte",
    surfaceLook: "concrete",
    colorFamily: "pearl",
    applications: FLOOR_AND_WALL,
    isIndoor: true,
    isOutdoor: false,
    slipRating: "R10",
    photoFolder: "crotone-pearl",
  },
];
