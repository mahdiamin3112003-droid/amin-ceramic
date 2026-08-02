/**
 * WCAG 2.x relative luminance and contrast ratio.
 *
 * Exists because docs/02-ux-blueprint.md §4.1 states a contrast figure for every
 * brand token, and two of them are wrong (navy-700 is ~12.4:1, not 10.6:1;
 * blue-500 is ~6.0:1, not 4.9:1 — both understated, so no rule was broken).
 * Rather than hand-correcting a table that will drift again, the numbers are
 * computed: src/test/tokens.test.ts asserts every §4.1 rule from the real token
 * values, and the Storybook Tokens page renders the live ratios beside each swatch.
 *
 * Reference: https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** WCAG conformance thresholds. */
export const WCAG = {
  /** Normal-size text, Level AA. */
  AA_NORMAL: 4.5,
  /** Large text (>=18.66px bold or >=24px), Level AA. Also the floor for
   *  non-text UI: borders, icons, focus indicators, chart series (§7.3). */
  AA_LARGE: 3,
  /** Normal-size text, Level AAA. Body copy is held to this (§7.3). */
  AAA_NORMAL: 7,
} as const;

/**
 * Parse `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. Alpha is ignored: contrast
 * against a translucent colour is a composition question, not a colour one.
 */
export function parseHex(hex: string): Rgb {
  const raw = hex.trim().replace(/^#/, "");

  const expanded =
    raw.length === 3 || raw.length === 4
      ? raw
          .slice(0, 3)
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.slice(0, 6);

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Not a hex colour: "${hex}"`);
  }

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

/** sRGB 0–255 channel to its linear-light value. */
function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(colour: Rgb | string): number {
  const { r, g, b } = typeof colour === "string" ? parseHex(colour) : colour;
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/**
 * Contrast ratio between two colours, 1:1 to 21:1. Order-independent.
 * Returned unrounded; round at the point of display, not here.
 */
export function contrastRatio(
  foreground: Rgb | string,
  background: Rgb | string,
): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Contrast ratio rounded to one decimal, the form used in design documentation. */
export function contrastRatioRounded(
  foreground: Rgb | string,
  background: Rgb | string,
): number {
  return Math.round(contrastRatio(foreground, background) * 10) / 10;
}

export type WcagGrade = "AAA" | "AA" | "AA Large" | "Fail";

/** The highest grade a pair reaches for normal-size text. */
export function wcagGrade(
  foreground: Rgb | string,
  background: Rgb | string,
): WcagGrade {
  const ratio = contrastRatio(foreground, background);
  if (ratio >= WCAG.AAA_NORMAL) return "AAA";
  if (ratio >= WCAG.AA_NORMAL) return "AA";
  if (ratio >= WCAG.AA_LARGE) return "AA Large";
  return "Fail";
}
