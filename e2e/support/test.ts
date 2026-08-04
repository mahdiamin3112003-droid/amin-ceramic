import { test as base } from "@playwright/test";

/**
 * The suite's `test`, with reduced motion applied to every page.
 *
 * ── Why every test runs as a reduced-motion user ──
 * The auth card carries a 3px ambient float on a 9s loop. Playwright
 * refuses to click an element that never stops moving ("element is not
 * stable"), so any test slow enough to reach that animation's 2.2s delay
 * hung on its first click. That is a property of the stability heuristic,
 * not of the product — people click moving buttons perfectly well.
 *
 * Emulating the preference rather than shortening the animation is the
 * better fix, because it makes every assertion in the suite double as a
 * check that `prefers-reduced-motion` is honoured. globals.css §6 collapses
 * every animation to 0.01ms with a single iteration; a component that ever
 * animates in defiance of that starts failing on stability again, which is
 * exactly the alarm you want. Reduced motion was previously the one
 * accessibility path here that could not be machine-verified.
 *
 * `emulateMedia` rather than a config `use` option: `@playwright/test`'s
 * UseOptions does not expose `reducedMotion` in this version.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await use(page);
  },
});

export { expect } from "@playwright/test";
