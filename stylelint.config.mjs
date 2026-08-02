/**
 * Stylelint is the CSS half of two CLAUDE.md non-negotiables:
 *
 *   1. "Design tokens are the single source of truth. No hardcoded colours …
 *      anywhere in components. Ever."  -> `color-no-hex` + `color-named`
 *   2. "CSS logical properties everywhere (margin-inline-start, not margin-left)."
 *      -> `property-disallowed-list`
 *
 * The TS/TSX half lives in tools/eslint/. See docs/adr/0001 and 0002.
 *
 * src/app/globals.css is the single exception: it is where literal colour is
 * *supposed* to live, because it is the token file.
 */

/** @type {import('stylelint').Config} */
const config = {
  extends: ["stylelint-config-standard"],

  rules: {
    // Tailwind 4 is CSS-first; these are its vocabulary, not unknown at-rules.
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: [
          "theme",
          "source",
          "utility",
          "variant",
          "custom-variant",
          "apply",
          "reference",
          "plugin",
          "config",
          "tailwind",
          "screen",
        ],
      },
    ],

    // Colour must come from a token.
    "color-no-hex": true,
    "color-named": "never",

    // RTL from day one: physical direction properties are banned outright.
    "property-disallowed-list": [
      [
        "margin-left",
        "margin-right",
        "padding-left",
        "padding-right",
        "border-left",
        "border-right",
        "border-left-width",
        "border-right-width",
        "border-left-color",
        "border-right-color",
        "border-left-style",
        "border-right-style",
        "border-top-left-radius",
        "border-top-right-radius",
        "border-bottom-left-radius",
        "border-bottom-right-radius",
        "left",
        "right",
        "float",
        "clear",
      ],
      {
        message: (property) =>
          `"${property}" is a physical-direction property and breaks RTL. Use the logical equivalent (margin-inline-start, inset-inline-start, border-start-start-radius, …). See docs/adr/0002-logical-properties-only.md.`,
      },
    ],

    // Tailwind 4's entry point MUST be a bare string import — `@import
    // url("tailwindcss")` is treated as a real CSS import and the framework
    // never loads. stylelint-config-standard's default would rewrite it.
    "import-notation": "string",

    // Token values are written exactly as docs/02-ux-blueprint.md §4.1 lists
    // them, so the file can be diffed against the design document. Shortening
    // #ffffff to #fff would break that correspondence for no benefit.
    "color-hex-length": null,

    // The token file groups related properties with blank lines and comments;
    // that grouping is the documentation.
    "custom-property-empty-line-before": null,
    "declaration-empty-line-before": null,

    // Shadow alphas are written as decimals to match docs/02-ux-blueprint.md
    // §4.6 character for character, so the token file can be diffed against the
    // design document without mental conversion.
    "alpha-value-notation": "number",

    // -webkit-text-size-adjust is not a legacy prefix: it is the only way to
    // stop iOS Safari inflating text after an orientation change.
    "property-no-vendor-prefix": [true, { ignoreProperties: ["text-size-adjust"] }],

    // The focus ring is written as longhands on purpose. A shorthand containing
    // a var() that is invalid at computed-value time discards the WHOLE
    // declaration and falls back to currentColor — a white ring on a white page.
    // Longhands fail independently. See docs/adr/0007-focus-ring.md.
    "declaration-block-no-redundant-longhand-properties": [
      true,
      { ignoreShorthands: ["outline"] },
    ],

    // Custom properties are the token vocabulary; the standard pattern rejects
    // the numeric suffixes we rely on (--color-navy-950, --text-display-xl).
    "custom-property-pattern": null,
    "keyframes-name-pattern": null,
    "selector-class-pattern": null,

    // Tailwind emits these; they are not authoring mistakes.
    "no-descending-specificity": null,
  },

  overrides: [
    {
      // The token file. Literal colour belongs here and nowhere else — that is
      // the entire point of "single source of truth".
      files: ["src/app/globals.css"],
      rules: {
        "color-no-hex": null,
        "color-named": null,
      },
    },
  ],
};

export default config;
