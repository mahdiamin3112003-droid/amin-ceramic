import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";

import ar from "./messages/ar.json";
import en from "./messages/en.json";
import { routing, type Locale } from "./routing";

/**
 * Message catalogues are imported statically rather than with a dynamic
 * `import(\`./messages/${locale}.json\`)`. Two reasons: a template import
 * resolves to `any`, which the no-explicit-any rule rightly rejects, and static
 * imports let TypeScript check every translation key against the English
 * catalogue (see src/types/next-intl.d.ts). With two locales the bundle cost is
 * nil; revisit if the locale count grows.
 */
const catalogues = { en, ar } satisfies Record<Locale, unknown>;

/**
 * Per-request i18n configuration.
 *
 * `requestLocale` is awaited rather than read from a `locale` param: since
 * next-intl v3.22 the locale arrives asynchronously so it can be resolved in
 * middleware, and Next 15 made route params a Promise besides.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: catalogues[locale],

    // Timestamps travel as RFC 3339 UTC (docs/04-api-architecture.md §3.3);
    // this is the display timezone. Lebanon, per the market assumption in §1.3.
    timeZone: "Asia/Beirut",
  };
});
