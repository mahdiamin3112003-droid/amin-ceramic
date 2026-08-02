# 0002 · Physical direction properties are banned outright

**Status:** accepted · Phase 0

## What the documents say

CLAUDE.md: _"CSS logical properties everywhere (`margin-inline-start`, not
`margin-left`). The site is bilingual EN/AR with RTL from day one. Retrofitting
costs 3-4x."_ `docs/01-architecture.md` §3.6 says the same, and §6.5 adds that
_"Layout uses CSS logical properties throughout so RTL requires no separate
stylesheet."_

## Decision

Banned, not discouraged:

- **`amin/no-physical-properties`** rejects `ml-`, `mr-`, `pl-`, `pr-`, `left-`,
  `right-`, `text-left`, `text-right`, `border-l-`, `rounded-tl-`, `space-x-`
  and their kin in `className`, and the equivalent camelCase properties in
  `style={{}}`.
- **Stylelint `property-disallowed-list`** covers the same ground in `.css`.

**Transforms are deliberately not flagged.** `translate-x`, `rotate` and `skew`
do not mirror, and that is correct: §3.6 rules that _"the diamond and all
logo-derived geometry do not mirror. Layout mirrors; brand geometry does not."_
Flagging transforms would fight that decision. The one place a physical
direction is right is a chevron in `Pagination`, where `rtl:rotate-180` is
applied deliberately — "previous" points the other way in Arabic.

Component APIs follow the same rule. `Sheet`'s `side` prop takes
`inline-start` / `inline-end` / `block-start` / `block-end` rather than shadcn's
`left` / `right` / `top` / `bottom`: "the quote basket opens on the right" is only
true in English, and a physically-named API pushes that decision to every call
site, where it will eventually be got wrong.

## Consequences

The overlay animations had to be rebuilt: shadcn ships `slide-in-from-right`
from `tw-animate-css`, which cannot mirror. Ours use a single direction-aware
keyframe driven by a `--slide-inline-sign` custom property that flips under
`[dir="rtl"]`.

Beyond that the cost is near zero. The RTL demo route mirrors correctly with no
conditional styling anywhere in the codebase.
