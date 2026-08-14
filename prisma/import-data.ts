/**
 * Real Amin Ceramic inventory — the client's first 12 products.
 *
 * ── Provenance of each field ──
 * Names, formats, box data and stock: given by the client.
 * Thickness (10mm; 20mm for Bali Plus) and weight (28 kg/box): confirmed by
 * the client by format.
 * Material `porcelain`: INFERRED from large-format sizing, not confirmed off
 * a spec sheet. Flagged as such in the blocker report.
 * `surfaceLook`: read from the product photography, not a spec sheet.
 *
 * ── Missing values are null, never text ──
 * `slipRating` is genuinely unknown and stays NULL. It must never become the
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
  /** Tenant-wide total. NOT split per warehouse — the split is unconfirmed. */
  readonly stockM2: number;

  readonly finish: "matte";
  readonly surfaceLook: "concrete" | "marble" | "solid_color" | "stone" | "wood";
  /** Includes families created by this import — see NEW_COLOR_FAMILIES. */
  readonly colorFamily: string;
  /** Application keys. `wall` matters: these are floor AND wall products. */
  readonly applications: readonly string[];

  readonly isIndoor: boolean;
  readonly isOutdoor: boolean;
  /** Genuinely unknown for all 12. Stays NULL. */
  readonly slipRating: null;
  /** Folder under `product-photos/`. Photos pending; nothing attached yet. */
  readonly photoFolder: string;
}

/** The client's own name — house-brand product, a real value, not a stand-in. */
export const BRAND_NAME = "Amin Ceramic Tiles";

/** INFERRED from format, not confirmed. Reported as such. */
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
    slipRating: null,
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
    slipRating: null,
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
    slipRating: null,
    photoFolder: "belerofonte-natural",
  },
  {
    // "ANTID." reads as antideslizante (anti-slip), but the rating is not
    // confirmed, so `slipRating` stays null rather than being guessed at R11.
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
    slipRating: null,
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
    slipRating: null,
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
    slipRating: null,
    photoFolder: "antid-aren-beige",
  },
  {
    // 20mm, 1 piece per box — the profile of an outdoor paver. Deliberately
    // NOT marked outdoor: the client is checking, and asserting it here would
    // put a load-bearing claim on a spec sheet a contractor reads.
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
    applications: ["floor"], // no wall, no outdoor — both unconfirmed
    isIndoor: true,
    isOutdoor: false,
    slipRating: null,
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
    slipRating: null,
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
    slipRating: null,
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
    slipRating: null,
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
    slipRating: null,
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
    slipRating: null,
    photoFolder: "crotone-pearl",
  },
];
