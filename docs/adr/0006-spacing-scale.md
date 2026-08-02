# 0006 · The declared spacing scale contradicts the table beneath it

**Status:** accepted · Phase 0

## The contradiction

`docs/02-ux-blueprint.md` §4.3 declares the scale as:

> 4px base. `0 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 192`

The table immediately below it then uses **20px** (card internal padding at
tablet, form field stack at every breakpoint) and **40px** (page horizontal
gutter at tablet). Neither value is on the declared scale.

## Decision

Keep Tailwind 4's dynamic `--spacing: 0.25rem`, which makes every multiple of 4
available and so covers both the declared scale and the values the table
actually uses.

Additionally define **named rhythm tokens** carrying the per-breakpoint values
from that table:

| Token                 | Mobile | Tablet | Desktop |
| --------------------- | ------ | ------ | ------- |
| `--space-section`     | 80     | 96     | 128     |
| `--space-gutter`      | 20     | 40     | 64      |
| `--space-card-pad`    | 16     | 20     | 24      |
| `--space-grid-gap`    | 12     | 20     | 24      |
| `--space-field-stack` | 16     | 20     | 20      |

Components consume `p-card-pad` and `py-section` — an intent — rather than a
number. That is what actually enforces the rhythm: a raw `p-6` is invisible in
review, whereas `p-card-pad` is self-describing and responds to the breakpoint
without a single responsive variant at the call site.

These cannot live in `@theme`, whose values must be static, so they are declared
in `:root` with media-query overrides and referenced from `@theme`.

## Note on breakpoint mapping

§4.3's three columns (desktop / tablet / mobile) do not line up with §6's four
tiers (desktop ≥1280 · laptop 1024–1279 · tablet 768–1023 · mobile <768).
Mapped as: **mobile <768, tablet 768–1279, desktop ≥1280** — the laptop tier
takes the tablet rhythm, which is the reading that keeps §6.2's "the most common
desktop reality" from getting desktop's 64px gutter on a 1024px screen.

## Related

`--breakpoint-sm` is moved from Tailwind's 640px to §4.4's **480px**. The other
five match Tailwind's defaults.
