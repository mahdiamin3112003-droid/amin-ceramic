# 0007 · Focus uses `outline`, not the specified `box-shadow`

**Status:** accepted · Phase 0

## What the document says

`docs/02-ux-blueprint.md` §4.6 and §7.4:

> `ring-focus` · `0 0 0 2px #FFF, 0 0 0 4px navy-700`
>
> One focus treatment across the entire system — a white spacer ring then a navy
> ring, so it reads on any background. On dark grounds the outer ring becomes
> `cyan-400`. **Focus outlines are never removed.**

## The problem

A `box-shadow` ring is clipped by any ancestor with `overflow: hidden`. That
includes the product card's own image mask — §5.6 specifies _"image scale 1.0 to
1.04 inside a fixed 12px-radius mask"_ — so the signature interaction of the
catalog would have swallowed the focus indicator on the card it belongs to.
`box-shadow` also does not follow `border-radius` on some composited elements.

## Decision

The same two-ring appearance, built from `outline` and `outline-offset`:

```css
:focus-visible {
  outline-width: var(--focus-ring-width, 2px);
  outline-style: solid;
  outline-color: var(--focus-ring-color, #1e2c6e);
  outline-offset: var(--focus-ring-offset, 2px);
  border-radius: inherit;
}
:is(.on-dark, [data-ground="dark"]) :focus-visible {
  outline-color: var(--focus-ring-color-on-dark, #5fc4e4);
}
```

`outline-offset` produces the spacer ring by showing the page ground through it,
which is better than a hard white ring on any surface that is not white.
Outlines are never clipped and always follow `border-radius`.

Three details that are load-bearing:

- **Longhands, not the `outline` shorthand.** A shorthand containing a `var()`
  that is invalid at computed-value time discards the _whole_ declaration and
  falls back to `currentColor` — which on a navy button is a white ring on a
  white page. Longhands fail independently, and each carries a literal fallback.
- **No component sets its own ring.** Every `focus-visible:ring-*` shadcn shipped
  was stripped. One treatment, one place.
- **`transition-colors` had to go.** See below.

## The `transition-colors` problem

Tailwind's `transition-colors` includes `outline-color` in its property list.
Any element carrying it fades its focus ring in _from_ `currentColor`, so for the
length of the transition the ring is the wrong colour — exactly when the user is
looking for it.

`@utility transition-colors` does **not** fix this: Tailwind merges an override
of a built-in utility into the same rule rather than replacing it, so the
built-in's `transition-property` still wins on source order. (Verified in the
production CSS: both declarations appear in one rule.)

The answer is a differently-named utility, `transition-surface`, with
`outline-color` omitted, plus `amin/no-transition-colors` to stop the built-in
coming back. `transition-all` is banned by the same rule.

## Verification

Checked in-browser across all 17 focusable controls on the demo route: navy-700
on light grounds, cyan-400 inside `[data-ground="dark"]`, 2px width and 2px
offset throughout.
