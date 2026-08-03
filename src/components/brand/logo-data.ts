/**
 * The real Amin Ceramic mark — traced source, `public/brand/amin-ceramic-mark.svg`.
 *
 * docs/01-architecture.md §4.2 / docs/02-ux-blueprint.md §5.2 describe the
 * "Assembly" intro as animating fragments derived from this exact trace:
 * two marble-veined diamond halves (navy left, cyan right) and a mosaic
 * band of individually addressable tiles. This file is that trace,
 * transcribed as data so `Logo` (static) and `AssemblyIntro` (animated)
 * render from one source instead of two hand-copies drifting apart.
 *
 * Every fill below is a brand token colour, not a re-guess — the source
 * SVG's six literal hexes (`#FFFFFF`, `#1E2C6E`, `#5FC4E4`, `#141F52`,
 * `#3560B4`, `#CBE4F3`) are an exact match to `white`, `navy-700`,
 * `cyan-400`, `navy-900`, `blue-500` and `cyan-100` in
 * `src/app/globals.css` — expected, since those tokens were themselves
 * extracted from this logo (CLAUDE.md). `no-raw-color` (`tools/eslint/`)
 * forbids literal hex in components, so `LogoTile.fill` names the token,
 * never the hex, and every consumer renders it as a `fill-{token}` class.
 */

export type LogoFillToken =
  "white" | "navy-900" | "navy-700" | "blue-500" | "cyan-400" | "cyan-100";

/**
 * A `var(--color-*)` reference, not a Tailwind class — the mosaic's fill is
 * data-driven (36 tiles, per-tile token), and Tailwind's build-time class
 * scanner cannot see a runtime-interpolated `fill-${token}` string, so it
 * would never generate that CSS. A CSS custom property reference has no
 * such scanning step and isn't a literal colour either, so it's exempt
 * from `no-raw-color` (which only matches hex/rgb/hsl literals).
 */
export function tileFillVar(token: LogoFillToken): string {
  return `var(--color-${token})`;
}

export interface LogoTile {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly fill: LogoFillToken;
}

/** The 400×400 source viewBox's mark-only region (diamond + mosaic, no badge circle, no baked wordmark). */
export const LOGO_VIEW_BOX = "80 85 240 150";

export const DIAMOND_LEFT_PATH = "M200,95 L114,161 L200,227 Z";
export const DIAMOND_RIGHT_PATH = "M200,95 L286,161 L200,227 Z";

export const DIAMOND_LEFT_VEINING: readonly string[] = [
  "M138,140 C144,148 141,156 148,161 C154,165 151,173 157,180",
  "M148,161 C143,166 136,167 132,175",
  "M130,180 C138,186 135,195 143,201 C149,205 146,213 153,219",
  "M143,201 C137,204 130,203 124,209",
  "M165,120 C170,126 168,133 174,138",
  "M155,205 C161,210 159,217 166,222 C171,226 168,233 174,238",
  "M120,155 C126,159 125,166 131,170",
];

export const DIAMOND_RIGHT_VEINING: readonly string[] = [
  "M245,133 C250,140 248,148 254,154 C259,159 256,167 262,173",
  "M254,154 C260,157 267,155 272,161",
  "M258,178 C264,184 262,192 269,197 C274,201 271,209 278,214",
  "M269,197 C275,199 282,197 287,202",
  "M228,118 C233,124 231,131 237,136",
  "M238,205 C244,210 242,217 249,222 C254,226 251,233 258,238",
  "M268,148 C273,152 274,159 280,163",
];

export const MOSAIC_CLIP_PATH = "M200,112 L136,161 L200,210 L264,161 Z";

const T = 13.9;

export const MOSAIC_TILES: readonly LogoTile[] = [
  { id: "tile-01", x: 155.05, y: 116.05, size: T, fill: "navy-900" },
  { id: "tile-02", x: 170.25, y: 116.05, size: T, fill: "white" },
  { id: "tile-03", x: 185.45, y: 116.05, size: T, fill: "navy-700" },
  { id: "tile-04", x: 200.65, y: 116.05, size: T, fill: "white" },
  { id: "tile-05", x: 215.85, y: 116.05, size: T, fill: "cyan-400" },
  { id: "tile-06", x: 231.05, y: 116.05, size: T, fill: "white" },
  { id: "tile-07", x: 155.05, y: 131.25, size: T, fill: "white" },
  { id: "tile-08", x: 170.25, y: 131.25, size: T, fill: "navy-900" },
  { id: "tile-09", x: 185.45, y: 131.25, size: T, fill: "white" },
  { id: "tile-10", x: 200.65, y: 131.25, size: T, fill: "blue-500" },
  { id: "tile-11", x: 215.85, y: 131.25, size: T, fill: "white" },
  { id: "tile-12", x: 231.05, y: 131.25, size: T, fill: "cyan-100" },
  { id: "tile-13", x: 155.05, y: 146.45, size: T, fill: "navy-900" },
  { id: "tile-14", x: 170.25, y: 146.45, size: T, fill: "white" },
  { id: "tile-15", x: 185.45, y: 146.45, size: T, fill: "navy-700" },
  { id: "tile-16", x: 200.65, y: 146.45, size: T, fill: "white" },
  { id: "tile-17", x: 215.85, y: 146.45, size: T, fill: "cyan-400" },
  { id: "tile-18", x: 231.05, y: 146.45, size: T, fill: "white" },
  { id: "tile-19", x: 155.05, y: 161.65, size: T, fill: "white" },
  { id: "tile-20", x: 170.25, y: 161.65, size: T, fill: "navy-900" },
  { id: "tile-21", x: 185.45, y: 161.65, size: T, fill: "white" },
  { id: "tile-22", x: 200.65, y: 161.65, size: T, fill: "blue-500" },
  { id: "tile-23", x: 215.85, y: 161.65, size: T, fill: "white" },
  { id: "tile-24", x: 231.05, y: 161.65, size: T, fill: "cyan-100" },
  { id: "tile-25", x: 155.05, y: 176.85, size: T, fill: "navy-900" },
  { id: "tile-26", x: 170.25, y: 176.85, size: T, fill: "white" },
  { id: "tile-27", x: 185.45, y: 176.85, size: T, fill: "navy-700" },
  { id: "tile-28", x: 200.65, y: 176.85, size: T, fill: "white" },
  { id: "tile-29", x: 215.85, y: 176.85, size: T, fill: "cyan-400" },
  { id: "tile-30", x: 231.05, y: 176.85, size: T, fill: "white" },
  { id: "tile-31", x: 155.05, y: 192.05, size: T, fill: "white" },
  { id: "tile-32", x: 170.25, y: 192.05, size: T, fill: "navy-900" },
  { id: "tile-33", x: 185.45, y: 192.05, size: T, fill: "white" },
  { id: "tile-34", x: 200.65, y: 192.05, size: T, fill: "blue-500" },
  { id: "tile-35", x: 215.85, y: 192.05, size: T, fill: "white" },
  { id: "tile-36", x: 231.05, y: 192.05, size: T, fill: "cyan-100" },
];
