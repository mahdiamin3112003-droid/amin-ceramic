import type { StorybookConfig } from "@storybook/nextjs";

/**
 * Storybook 10 — the review surface for the design system.
 *
 * docs/02-ux-blueprint.md §9 lists it as a Phase 0 deliverable: "Every
 * component, every state (rest/hover/focus/active/disabled/loading/error/empty),
 * both locales, both directions."
 *
 * Note this is Storybook 10, not the 9 the plan assumed — 10 is current and
 * declares a real React 19 peer rather than 9's `^19.0.0-beta`. `addon-essentials`
 * no longer exists in either; docs and a11y are separate packages now.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],

  addons: [
    "@storybook/addon-docs",
    // Runs axe against every story. Not a substitute for the NVDA/VoiceOver
    // testing §7.2 requires each phase, but it catches the mechanical failures
    // before they reach a human.
    "@storybook/addon-a11y",
  ],

  framework: {
    name: "@storybook/nextjs",
    options: {},
  },

  /**
   * Two mappings of the same directory, deliberately.
   *
   * `@storybook/nextjs` rewrites next/font/local `src` paths relative to the
   * project root, so the emitted @font-face points at `./public/fonts/…`. With
   * only the root mapping that 404s and every story silently falls back to
   * system fonts — which is the worst possible failure for a type review,
   * because it looks plausible. Serving the directory at both `/` and `/public`
   * makes either path resolve.
   */
  staticDirs: ["../public", { from: "../public", to: "/public" }],

  typescript: {
    // Props tables are generated from the real types, so a story cannot
    // document a prop the component does not have.
    reactDocgen: "react-docgen-typescript",
  },
};

export default config;
