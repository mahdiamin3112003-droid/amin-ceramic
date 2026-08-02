import { defineRouting } from "next-intl/routing";

/**
 * Locale routing — docs/01-architecture.md §3.6.
 *
 * Bilingual EN/AR from day one, routed as /en/… and /ar/…. Retrofitting RTL
 * later costs 3–4x, which is why this lands in Phase 0 rather than alongside
 * the catalog.
 */

export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/**
 * Text direction per locale. Note that only *layout* mirrors — the diamond and
 * all logo-derived geometry keep their bottom-left -> top-right axis in RTL,
 * because mirroring them would alter the brand mark (§3.6).
 */
export const localeDirection: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  ar: "rtl",
};

/** Endonyms — a language switcher shows each language in its own script. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
};

/** `lang` values for hreflang alternates and the html element. */
export const localeHtmlLang: Record<Locale, string> = {
  en: "en",
  ar: "ar",
};

export const routing = defineRouting({
  locales,
  defaultLocale,

  // Always prefixed. A bare `/` redirects to the negotiated locale, so every
  // URL is unambiguous about which language it serves — which matters for
  // hreflang, for caching, and for anyone pasting a link into WhatsApp.
  localePrefix: "always",

  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  },
});

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function directionFor(locale: Locale): "ltr" | "rtl" {
  return localeDirection[locale];
}
