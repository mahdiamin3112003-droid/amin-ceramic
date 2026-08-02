import { locales, type Locale } from "@/i18n/routing";

/**
 * Canonical origin. Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every
 * deployment, so preview builds get correct absolute URLs without per-branch
 * configuration; NEXT_PUBLIC_SITE_URL overrides it once a real domain exists.
 */
export const siteUrl = (() => {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
})();

/**
 * hreflang alternates for a locale-agnostic path — docs/01-architecture.md §8.2.
 *
 * `x-default` points at English, which is what a search engine should serve to
 * a visitor whose language we cannot infer.
 */
export function alternatesFor(path = "/"): {
  canonical: string;
  languages: Record<string, string>;
} {
  const clean = path === "/" ? "" : `/${path.replace(/^\/+|\/+$/g, "")}`;

  const languages: Record<string, string> = {};
  for (const locale of locales) {
    languages[locale] = `${siteUrl}/${locale}${clean}`;
  }
  languages["x-default"] = `${siteUrl}/en${clean}`;

  return { canonical: `${siteUrl}/en${clean}`, languages };
}

export function canonicalFor(locale: Locale, path = "/"): string {
  const clean = path === "/" ? "" : `/${path.replace(/^\/+|\/+$/g, "")}`;
  return `${siteUrl}/${locale}${clean}`;
}
