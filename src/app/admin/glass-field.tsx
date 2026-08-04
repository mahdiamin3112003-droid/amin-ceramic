"use client";

import { useId, useState, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Form primitives for the auth screens' frosted card.
 *
 * SEPARATE FROM `components/ui/input.tsx` ON PURPOSE. That primitive is
 * tuned for light surfaces across the whole storefront and its states are
 * fixed by docs/02 §4.8; these sit on dark glass, where a stone-300 border
 * is invisible and a white fill would punch a hole in the blur. Forking the
 * shared component to serve both would leave every catalogue form carrying
 * conditional styling for one screen.
 *
 * The focus treatment is deliberately TWO things at once: the house outline
 * ring (§7.4 — instant, legible, never animated in) plus an underline that
 * draws from the centre. The ring is the accessibility guarantee; the
 * underline is the luxury. Removing the ring to keep only the underline
 * would be exactly the trade this project refuses to make.
 */

export function GlassField({
  label,
  hint,
  trailing,
  className,
  id,
  ...props
}: ComponentProps<"input"> & {
  label: string;
  hint?: string;
  trailing?: ReactNode;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = `${fieldId}-hint`;

  return (
    <div className="group flex flex-col gap-2">
      <label
        htmlFor={fieldId}
        // eslint-disable-next-line amin/no-cyan-text -- on the dark glass card over navy-950, where cyan-100 is 11.4:1
        className="text-caption font-medium tracking-[0.16em] text-cyan-100/90 uppercase transition-[color,letter-spacing] duration-quick ease-material group-focus-within:tracking-[0.2em] group-focus-within:text-cyan-100"
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={fieldId}
          {...(hint ? { "aria-describedby": hintId } : {})}
          className={cn(
            // 44px min target (§4.8), and inline-end padding reserved when a
            // trailing control is present so text never runs under it.
            "h-12 w-full rounded-md border border-white/12 bg-white/6 px-4 text-body text-white",
            "placeholder:text-white/45",
            // `box-shadow` joins the transition so the inner depth eases in
            // with the border rather than snapping a frame ahead of it.
            "backdrop-blur-sm transition-[background-color,border-color,box-shadow] duration-quick ease-material",
            "shadow-[inset_0_1px_2px_rgb(6_10_32/0.35)]",
            "hover:border-white/22 hover:bg-white/8",
            "focus:border-cyan-400/60 focus:bg-white/10 focus:shadow-[inset_0_1px_2px_rgb(6_10_32/0.2),0_0_0_4px_rgb(95_196_228/0.10)]",
            // The house ring, unmodified.
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400",
            "disabled:cursor-not-allowed disabled:opacity-50",
            trailing && "pe-12",
            className,
          )}
          {...props}
        />

        {trailing ? (
          <span
            // `inset-block-0` generates NO CSS in this Tailwind 4 setup
            // (verified in the browser; same trap as Phase 3's
            // `inset-inline-0`). Setting the logical property directly keeps
            // it RTL-correct, unlike the physical `inset-y-0` the house rule
            // rightly bans.
            style={{ insetBlock: 0 }}
            className="absolute end-1.5 flex items-center"
          >
            {trailing}
          </span>
        ) : null}

        {/* Drawn from the centre on focus. `origin-center` + scaleX is a
            compositor-only transform — no layout, no paint. */}
        <span
          aria-hidden
          style={{ insetInline: "0.5rem" }}
          className="pointer-events-none absolute bottom-0 h-0.5 origin-center scale-x-0 rounded-full bg-linear-to-r from-transparent via-cyan-400 to-transparent transition-transform duration-base ease-material group-focus-within:scale-x-100"
        />
      </div>

      {hint ? (
        <p id={hintId} className="text-caption text-white/65">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Password field with a reveal toggle.
 *
 * The toggle is a real `<button>` inside the field, not an icon with a
 * click handler: it must be tabbable and announce its state, because a
 * keyboard-only user needs the reveal as much as anyone. `aria-pressed`
 * carries the state; the two glyphs cross-fade rather than swap, so the
 * change reads as one control changing rather than two controls trading
 * places.
 */
export function GlassPasswordField({
  label,
  ...props
}: ComponentProps<"input"> & { label: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <GlassField
      {...props}
      label={label}
      type={revealed ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => {
            setRevealed((v) => !v);
          }}
          aria-pressed={revealed}
          aria-label={revealed ? "Hide password" : "Show password"}
          className="grid size-11 place-items-center rounded-md text-white/70 transition-[color,background-color,transform] duration-quick ease-material hover:scale-105 hover:bg-white/12 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 active:scale-95"
        >
          <span className="relative block size-5">
            <EyeIcon
              className={cn(
                "absolute inset-0 transition-[opacity,transform] duration-quick ease-material",
                revealed ? "scale-90 opacity-0" : "scale-100 opacity-100",
              )}
            />
            <EyeOffIcon
              className={cn(
                "absolute inset-0 transition-[opacity,transform] duration-quick ease-material",
                revealed ? "scale-100 opacity-100" : "scale-110 opacity-0",
              )}
            />
          </span>
        </button>
      }
    />
  );
}

/**
 * Checkbox drawn as the brand's diamond rather than a tick in a square.
 *
 * The native input stays in the DOM and keeps every behaviour that matters
 * — focus, space to toggle, form participation, screen-reader state. It is
 * made transparent and the visual is a sibling driven by `peer-checked`,
 * which is why this is a restyle rather than a reimplementation.
 */
export function GlassCheckbox({
  label,
  id,
  ...props
}: ComponentProps<"input"> & { label: string }) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    // The whole row is the label, so the tap target is 44px tall across its
    // full width rather than a 20px box (docs/02 §4.8 — "minimum touch target
    // 44x44 everywhere"). `htmlFor` is dropped in favour of wrapping, because
    // a wrapping label makes the association structural rather than by id.
    <label className="group flex min-h-11 cursor-pointer items-center gap-3 select-none">
      <span className="relative grid size-5 shrink-0 place-items-center">
        <input
          type="checkbox"
          id={fieldId}
          className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-[5px] border border-white/25 bg-white/6 transition-[background-color,border-color,box-shadow] duration-quick ease-material checked:border-cyan-400 checked:bg-cyan-400/20 checked:shadow-[0_0_12px_-2px_rgb(95_196_228/0.6)] hover:border-white/45 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          {...props}
        />
        {/* The mark, scaled in from nothing. `pointer-events-none` so the
            input underneath keeps the whole hit area. */}
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          // eslint-disable-next-line amin/no-cyan-text -- the checkbox MARK: a glyph on the dark card, not text
          className="pointer-events-none size-3 scale-0 text-cyan-400 opacity-0 transition-[opacity,transform] duration-quick ease-material peer-checked:scale-100 peer-checked:opacity-100"
        >
          <path d="M8 1.2 14.8 8 8 14.8 1.2 8Z" fill="currentColor" />
        </svg>
      </span>

      <span className="text-body-sm text-white/85 transition-[color] duration-instant ease-material group-hover:text-white">
        {label}
      </span>
    </label>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("size-5", className)}
    >
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("size-5", className)}
    >
      <path
        d="M4 4l16 16M9.9 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4M6.3 8A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1 0 2-.2 2.9-.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
