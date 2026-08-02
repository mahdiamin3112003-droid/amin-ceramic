# 0001 · Literal colour is banned by four mechanisms, not one

**Status:** accepted · Phase 0

## What the documents say

CLAUDE.md: _"Design tokens are the single source of truth. No hardcoded colours,
spacing, radii or durations anywhere in components. Ever."_

`docs/02-ux-blueprint.md` §4.1 goes further, describing the colour rules as
_"enforced at the token layer so they cannot be violated by accident."_

## The problem

They cannot be enforced at the token layer. In Tailwind 4, one `--color-*`
declaration generates `bg-`, `text-`, `border-` and `ring-` utilities together;
there is no way to permit `bg-cyan-400` while forbidding `text-cyan-400`. And
nothing in the token layer stops a component writing `#5FC4E4` directly.

## Decision

Four mechanisms, each covering what the others cannot:

1. **Tailwind's stock palette is cleared** — `--color-*: initial` in `@theme`.
   `bg-red-500` does not exist, so an off-brand colour fails at build time. This
   is the strongest of the four, because it is not a lint rule that can be
   disabled.
2. **`amin/no-raw-color`** (`tools/eslint/no-raw-color.js`) rejects hex, `rgb()`,
   `hsl()`, `oklch()` and Tailwind arbitrary values such as `text-[#5FC4E4]` in
   `.ts`/`.tsx`.
3. **Stylelint `color-no-hex` and `color-named`** cover `.css`, with
   `src/app/globals.css` excepted — that file is the token definition, and is the
   only place in the repository where a literal colour is legitimate.
4. **`src/test/tokens.test.ts`** asserts every token value against §4.1, so a
   token that is silently changed fails CI.

The cyan rule gets its own rule, `amin/no-cyan-text`, because it is a permission
question rather than a literal one: cyan is legitimate as a surface and illegal
as text on a light ground. It carries a documented escape hatch — a
`eslint-disable-next-line` with a justification — for the one case §4.1 permits,
cyan-400 on navy-700 or darker.

## Consequences

A component that genuinely needs a literal — the Storybook Tokens page and the
foundation demo route, which render the ramp itself — reads the value from
`globals.css` at runtime via `src/lib/utils/tokens.ts` rather than restating it.
The documentation of the design system therefore cannot drift from the design
system.
