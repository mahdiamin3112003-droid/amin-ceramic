import type { Decorator, Preview } from "@storybook/nextjs";

import { useEffect } from "react";
import { NextIntlClientProvider } from "next-intl";

import ar from "../src/i18n/messages/ar.json";
import en from "../src/i18n/messages/en.json";
import { fontVariables } from "../src/lib/fonts";

import "../src/app/globals.css";

const MESSAGES = { en, ar } as const;
type Locale = keyof typeof MESSAGES;

const DIRECTION: Record<Locale, "ltr" | "rtl"> = { en: "ltr", ar: "rtl" };

/**
 * Locale and direction toolbar.
 *
 * The whole point of a bilingual design system is that you can see both halves.
 * §9 asks for "both locales, both directions" on every component, so this is a
 * global toggle rather than a per-story variant — a reviewer flips one control
 * and every story follows.
 *
 * `dir` is set on documentElement, not on a wrapper: logical properties resolve
 * against the nearest element with a direction, and several of our primitives
 * portal to document.body (dialog, sheet, popover, tooltip). A wrapper would
 * leave every portalled surface rendering LTR inside an RTL story, which is
 * exactly the bug this toggle exists to catch.
 */
const withLocale: Decorator = (Story, context) => {
  // Named component, not an inline body: a decorator is not a component by
  // React's naming convention, so hooks must live one level down.
  return <LocaleFrame Story={Story} globals={context.globals} />;
};

function LocaleFrame({
  Story,
  globals,
}: {
  Story: Parameters<Decorator>[0];
  globals: Record<string, unknown>;
}) {
  const locale = (globals["locale"] ?? "en") as Locale;
  const direction = DIRECTION[locale];

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = direction;
    root.className = fontVariables;
    return () => {
      root.removeAttribute("dir");
    };
  }, [locale, direction]);

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={MESSAGES[locale]}
      timeZone="Asia/Beirut"
    >
      <div className="bg-background p-6 text-foreground">
        <Story />
      </div>
    </NextIntlClientProvider>
  );
}

const preview: Preview = {
  decorators: [withLocale],

  globalTypes: {
    locale: {
      description: "Locale and text direction",
      toolbar: {
        title: "Locale",
        icon: "globe",
        items: [
          { value: "en", title: "English (LTR)", right: "EN" },
          { value: "ar", title: "العربية (RTL)", right: "ع" },
        ],
        dynamicTitle: true,
      },
    },
  },

  initialGlobals: { locale: "en" },

  parameters: {
    layout: "padded",

    // The public site is white. "A tile showroom is lit, not dim, and product
    // colour accuracy demands a neutral white ground" (§4.1). Admin dark mode
    // is v1.1, and gets its own backgrounds entry when it lands.
    backgrounds: {
      options: {
        page: { name: "Page (white)", value: "#FFFFFF" },
        alternate: { name: "Alternate section (stone-50)", value: "#F6F7F9" },
        dark: { name: "Dark ground (navy-950)", value: "#0C1338" },
      },
    },
    initialGlobals: { backgrounds: { value: "page" } },

    a11y: {
      // Report violations rather than failing the run: Phase 0 has no CI
      // browser runner yet. The axe-in-Playwright gate arrives in Phase 9
      // (docs/01-architecture.md §8.5) — this is the fast feedback loop, not
      // the enforcement point.
      test: "todo",
    },

    docs: { toc: true },
  },
};

export default preview;
