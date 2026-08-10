# 0017 · The catalogue page-turn view, built ahead of its Tier 3 slot

**Status:** accepted · before Phase 5

## What was asked for

A book-style browsing view: one product per "page", with a page-turn
between them, as a coherent part of the design system rather than a
bolted-on effect.

## What the blueprint already said

This is not a new idea. `docs/02-ux-blueprint.md` §8.3 item 15 specifies
**Showroom mode** — "tablet presentation view for the sales floor: no
chrome, large type, swipeable collections, one-tap 'send this selection to
the customer's WhatsApp'" — and §6.3 reinforces it for tablet. It sits in
Tier 3 (v1.2+).

Building it as that item, rather than as a separate feature, is what keeps
it coherent. The word doing the most work in §8.3 is **collections**.

## Decision

Build the browsing mechanic now, at
`/collections/[slug]/catalogue`. Additive: it replaces nothing.

### Why collections and not the filtered grid

§5.7 states the rule that decides it: _"No slide — slide implies sequence,
and gallery images are alternatives, not a sequence."_

A page-turn is the strongest available "these are in sequence" signal.

- A **filtered result set is not a sequence.** 1,284 products in relevance
  order have no inherent first, next or last, and turning pages through
  them asserts an order that does not exist.
- A **collection is a sequence** — curated, ordered, finite, typically
  6–30 products. That is precisely what a printed brand catalogue is.

The same section _sanctions_ the motion where sequence is real: the
full-screen gallery uses "horizontal slide with a 12% velocity-following
drag on touch, snap on release, 320ms". This view reuses that, in the one
place its precondition holds.

Putting it on `/products` as a third view toggle was considered and
rejected. Beyond the sequence problem: filters and one-at-a-time are
incoherent together (the feedback loop of faceting is _seeing the result
set change_), it would regress §2.5's contractor journey — "speed and
certainty, zero interest in inspiration, the design should get out of the
way" — and it would put a non-indexable view on the primary SEO surface.

### Why a 45° wipe and not a page curl

§8.5 rejects "3D tile rotation viewers … effort spent proving we own a 3D
library". §5.6 rejects 3D tilt because it "makes a flat material read as
floating plastic". A skeuomorphic curling page is the same mistake in
different clothes, on a product that is flat by definition.

Motion principle #4 — "the diagonal is the brand's motion axis" — gives the
correct treatment, and it is the wipe §5.10 already uses for page
transitions. 320ms, matching §5.7's gallery rather than §5.10's 380ms,
because this is a repeated interaction (§5.1 rule 5).

### Why the page is condensed, not the full PDP

§3.3's product detail page is twelve stacked sections ending in three
recommendation rails. Turning a page into a twelve-section scrolling
document breaks the metaphor on the first turn.

A catalogue page is the PDP's decision block — §3.3 items 1–5, which the
blueprint itself calls "the five facts that decide it" — at presentation
scale, with one action through to the full page. Not a new visual language;
the existing one at a different density.

## What it depends on

**Photography.** This view is image-dominant and the media library is
empty; it renders the same token-derived placeholder the product card uses.
The layout will not change when real imagery lands, so this is not
build-it-twice — but it is **evaluate-it-twice**, and the feature cannot be
fairly judged until the client's photographs exist. Accepted deliberately.

## Deferred, and why

**The chrome-less shell.** §8.3 and §6.3 both describe Showroom mode as
having no navigation chrome. This view keeps the site header and footer.

A `fixed inset-0` overlay was tried and cannot work from inside
`[locale]/template.tsx`: that wrapper carries a `clip-path`, which creates
both a stacking context and a containing block for fixed descendants, so
the overlay was positioned against the wrapper and its `z-index` trapped
inside it. Hit-testing showed the site footer painting over the Next
control and the sticky header over the close control, with `z-50` powerless
against both. A portal to `document.body` escapes it at the cost of no
longer server-rendering the page content — a bad trade for a content view.

Sticky controls keep every control reachable at any scroll position with no
stacking games. The chrome-less presentation shell, and the WhatsApp
hand-off that completes Showroom mode, remain Tier 3.

## Consequences

- New route, `noindex` with its canonical pointing at the collection. It is
  a chrome-less duplicate of pages that already have canonical homes, and
  indexing it would put it in competition with them.
- Each turn pushes history, so Back steps back one page — the same
  behaviour §3.2 protects when it rejects infinite scroll.
- Covered by `e2e/public-catalogue.spec.ts`, including a real
  `elementFromPoint` hit test on the controls. `toBeVisible()` considers
  neither `opacity` nor `clip-path`, which is how a blank public site once
  passed twelve specs (ADR-0016's sibling lesson, recorded in CLAUDE.md).
- The e2e suite runs under `prefers-reduced-motion`, so it exercises the
  reduced path. A regression in the full-motion wipe would not fail there.
