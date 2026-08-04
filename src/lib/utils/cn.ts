import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The project's font-size scale (docs/02 §4.3), declared in `@theme` in
 * globals.css as `--text-*`.
 *
 * tailwind-merge HAS TO BE TOLD about these. Its default config resolves a
 * `text-*` class by checking the built-in size scale (`text-sm`, `text-xl`,
 * …) and treats anything unrecognised as a text COLOUR. Every name here is
 * unrecognised, so `text-body` was being classified as a colour — which put
 * it in the same conflict group as `text-primary-foreground` and, since cva
 * emits the size class after the variant class, silently deleted the colour.
 *
 * The visible result was navy-900 text on a navy-700 button (~1.3:1,
 * illegible) on EVERY primary and destructive button in the app, public site
 * included: the button ended up with no colour class at all and inherited
 * the body's. Found on the admin login screen; it was never admin-specific.
 *
 * Keep in sync with the `--text-*` block in globals.css. A name missing from
 * this list does not fail loudly — it silently becomes a colour again.
 */
const FONT_SIZES = [
  "display-xl",
  "display-lg",
  "display-md",
  "heading-lg",
  "heading-md",
  "heading-sm",
  "body-lg",
  "body",
  "body-sm",
  "caption",
  "spec",
  "spec-sm",
] as const;

/**
 * The radius scale, for the same reason.
 *
 * globals.css also sets `--radius-*: initial`, so `rounded-2xl` and
 * `rounded-3xl` do not exist here — they compile to nothing and silently
 * produce square corners. tailwind-merge cannot warn about that, but it CAN
 * be stopped from treating an unknown `rounded-*` as a valid conflict
 * partner, which is what would let a real radius be dropped.
 *
 * Keep in sync with the `--radius-*` block in globals.css.
 */
const RADII = ["sm", "md", "lg", "xl", "full", "none"] as const;

const twMerge = extendTailwindMerge({
  override: {
    classGroups: {
      // `override`, not `extend`: globals.css sets `--text-*: initial`, which
      // WIPES Tailwind's built-in scale, so `text-sm`/`text-xl` do not exist
      // in this project. Keeping the defaults would leave tailwind-merge
      // resolving classes that can never be produced.
      "font-size": [{ text: [...FONT_SIZES] }],
      rounded: [{ rounded: [...RADII] }],
    },
  },
});

/**
 * Merge class names, with later Tailwind utilities winning over earlier ones of
 * the same kind. Every primitive takes a `className` prop and runs it through
 * this, so a consumer can override a variant without fighting specificity.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
