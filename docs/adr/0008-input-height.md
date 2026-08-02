# 0008 · Inputs are 44px, not the specified 40px

**Status:** accepted, flagged for your review · Phase 0

## The contradiction

Three sections of `docs/02-ux-blueprint.md` disagree.

**§4.8, Inputs:**

> 40px height (`md`), `sm 6px` radius, 1px `stone-300` border…

**§6.5, cross-cutting responsive rules:**

> Every interactive element clears **44×44** with 8px minimum separation.

**§7.5, accessibility:**

> Target sizes meet WCAG 2.2's 24×24 minimum, and we hold to **44×44** as house
> standard.

An input at 40px tall does not clear 44×44.

## Decision

`md` — the default — is **44px**. The documented 40px is available as `sm`, for
the dense admin tables §4.10 describes (where a 40px row height is already the
"compact" mode and the surrounding density makes mis-taps less likely, because
those screens are mouse-and-keyboard by construction).

Sizes are therefore `sm` 40 · `md` 44 · `lg` 52, which also lines the inputs up
with the button sizes in §4.7 (32 / 44 / 52) at the size that matters — a form
row with an input beside a button should not have the two at different heights.

## Reasoning

Two sections against one, and the two are the ones stating a _rule_ rather than
a measurement. §4.8's 40px reads like a value carried over from a general-purpose
design system; §6.5 and §7.5 are deliberate accessibility commitments with a
stated rationale. Where a spec contradicts itself, the reading that does not ship
a known accessibility failure wins.

## Flagged

This is a visible change from what §4.8 specifies, so it is called out rather
than buried. If you want the literal 40px as the default, it is a one-line change
in `src/components/ui/input.tsx` — but §6.5 and §7.5 should then be amended to
match, so the documents stop contradicting each other.
