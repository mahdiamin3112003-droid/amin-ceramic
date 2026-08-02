import localFont from "next/font/local";

/**
 * The five faces from docs/02-ux-blueprint.md §4.2, self-hosted.
 *
 * Files are committed under public/fonts/ rather than fetched by
 * next/font/google at build time: builds stay deterministic, CI and Vercel need
 * no egress to Google, and the subsetting is ours to control. All five are
 * SIL OFL. Provenance for every file is recorded in public/fonts/SOURCES.json.
 *
 * SUBSETTING. The three Latin faces ship the `latin` subset; the two Arabic
 * faces ship `arabic` only. Latin characters inside Arabic prose — an English
 * SKU, per §7.2 — fall through the font stack in globals.css to Inter, which is
 * the correct rendering as well as the smaller download. next/font/local cannot
 * express a per-file unicode-range, so `latin-ext` is not currently shipped;
 * adding it means a second face declaration and is a five-minute change if a
 * product name ever needs it.
 *
 * PRELOADING. Only Inter is preloaded. It is the one face on every page in
 * either locale, and preloading all seven files (322 KB) on every route would
 * cost more than it saves. Per-locale preload tuning belongs with the
 * Lighthouse work in Phase 9.
 */

/** Display — Roman inscriptional serif matching the wordmark. >=28px only. */
export const marcellus = localFont({
  src: [
    {
      path: "../../public/fonts/marcellus-latin-400.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-marcellus",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
  fallback: ["Times New Roman", "serif"],
});

/** Body and UI. Variable 100–900; the system uses 400–700. */
export const inter = localFont({
  src: [
    {
      path: "../../public/fonts/inter-latin-variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
});

/** Data and spec — SKUs, dimensions, R-ratings, lot numbers. Always tabular. */
export const jetBrainsMono = localFont({
  src: [
    {
      path: "../../public/fonts/jetbrains-mono-latin-variable.woff2",
      weight: "400 500",
      style: "normal",
    },
  ],
  variable: "--font-jetbrains-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

/** Arabic body — pairs with Inter's proportions. */
export const ibmPlexSansArabic = localFont({
  src: [
    {
      path: "../../public/fonts/ibm-plex-sans-arabic-arabic-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/ibm-plex-sans-arabic-arabic-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/ibm-plex-sans-arabic-arabic-600.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-ibm-plex-sans-arabic",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

/** Arabic display — the serif-equivalent weight to Marcellus. Variable 400–700. */
export const notoNaskhArabic = localFont({
  src: [
    {
      path: "../../public/fonts/noto-naskh-arabic-arabic-variable.woff2",
      weight: "400 700",
      style: "normal",
    },
  ],
  variable: "--font-noto-naskh-arabic",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["serif"],
});

/**
 * Every font variable, for the <html> element.
 *
 * All five are declared in both locales rather than switched per locale: the
 * Arabic faces carry no Latin glyphs and the Latin faces carry no Arabic, so
 * the browser resolves per character through the stack in globals.css. That is
 * what makes an English SKU inside Arabic prose render correctly (§7.2). Which
 * family *leads* the stack is decided by the `html[lang="ar"]` token override,
 * not here.
 */
export const fontVariables = [
  marcellus.variable,
  inter.variable,
  jetBrainsMono.variable,
  ibmPlexSansArabic.variable,
  notoNaskhArabic.variable,
].join(" ");
