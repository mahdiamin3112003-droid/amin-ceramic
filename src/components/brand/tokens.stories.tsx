import type { Meta, StoryObj } from "@storybook/nextjs";

import { useTranslations } from "next-intl";

import { Diamond } from "@/components/brand/diamond";
import { ShadeVariationIcon, SlipRatingIcon } from "@/components/brand/spec-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { contrastRatioRounded, wcagGrade } from "@/lib/utils";

/**
 * The design system's own review surface — docs/02-ux-blueprint.md §9.
 *
 * Colour values are read from the DOM rather than restated, so this page cannot
 * drift from src/app/globals.css. (The Node-side reader used by the tests and
 * the demo route cannot run in the browser, so these stories resolve the same
 * tokens through getComputedStyle instead — same source, different access path.)
 */

const meta = {
  title: "Design system/Tokens",
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
    options: { showPanel: false },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function readToken(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 py-8">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-3 text-heading-lg">
          <Diamond className="size-3 text-navy-700" />
          {title}
        </h2>
        {note ? (
          <p className="max-w-prose text-body-sm text-stone-600">{note}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

const RAMP = [
  "navy-950",
  "navy-900",
  "navy-800",
  "navy-700",
  "navy-600",
  "blue-500",
  "blue-400",
  "cyan-400",
  "cyan-300",
  "cyan-100",
  "cyan-50",
  "stone-50",
  "stone-100",
  "stone-300",
  "stone-500",
  "stone-600",
  "stone-800",
  "success-600",
  "warning-600",
  "danger-600",
];

/**
 * The brand ramp with LIVE contrast ratios.
 *
 * The blueprint's §4.1 table understates two figures (navy-700 is ~12.8:1 not
 * 10.6:1; blue-500 is ~6.0:1 not 4.9:1). Computing rather than transcribing them
 * means the number a reviewer reads here is the number the product ships.
 */
export const Colour: Story = {
  render: () => {
    const white = readToken("--color-white") || "#ffffff";
    return (
      <Section
        title="Colour"
        note="Every ratio is computed from the token value at render time. cyan-400 and lighter are surfaces, strokes, glows and motion — never text on a light ground."
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {RAMP.map((name) => {
            const hex = readToken(`--color-${name}`);
            const ratio = hex ? contrastRatioRounded(hex, white) : 0;
            const grade = hex ? wcagGrade(hex, white) : "Fail";
            return (
              <li
                key={name}
                className="overflow-hidden rounded-md border border-border"
              >
                <div
                  className="h-16 w-full"
                  style={{ backgroundColor: `var(--color-${name})` }}
                />
                <div className="flex flex-col gap-0.5 p-3">
                  <span className="text-spec-sm">{name}</span>
                  <span className="text-spec-sm text-stone-600">{hex}</span>
                  <span className="text-spec-sm text-stone-600">
                    {ratio}:1 on white
                  </span>
                  <span
                    className={
                      grade === "Fail"
                        ? "text-spec-sm text-danger-600"
                        : "text-spec-sm text-success-600"
                    }
                  >
                    {grade}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-3 rounded-lg bg-navy-900 p-6">
          <p className="text-body-sm text-white">
            On navy-700 or darker, cyan-400 reaches 6.2:1 and IS permitted as text —
            the one place it is.
          </p>
          {/* eslint-disable-next-line amin/no-cyan-text -- on navy-900, the documented exception */}
          <p className="text-body text-cyan-400">
            Large-format marble-look porcelain
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-caption text-stone-600">
            The one permitted gradient (§4.1 rule 2)
          </span>
          <div className="h-16 rounded-md bg-brand-gradient" />
          <p className="max-w-prose text-body-sm text-stone-600">
            Permitted on: intro light trails, the scroll progress indicator, focus
            rings, one hero accent. Banned on buttons, cards, text, backgrounds and
            icons.
          </p>
        </div>
      </Section>
    );
  },
};

const TYPE_STEPS = [
  ["display-xl", "font-display text-display-xl"],
  ["display-lg", "font-display text-display-lg"],
  ["display-md", "font-display text-display-md"],
  ["heading-lg", "text-heading-lg"],
  ["heading-md", "text-heading-md"],
  ["heading-sm", "text-heading-sm"],
  ["body-lg", "text-body-lg"],
  ["body", "text-body"],
  ["body-sm", "text-body-sm"],
  ["caption", "text-caption"],
] as const;

/**
 * Type scale. Flip the locale toolbar to Arabic: sizes step up 8%, line-height
 * 12%, tracking drops to zero, and both families switch.
 */
export const Typography: Story = {
  render: function TypographyStory() {
    const t = useTranslations("foundation.type");
    return (
      <Section
        title="Typography"
        note="Switch the locale in the toolbar to see the Arabic scale. Marcellus is never used below 28px, which is why display-md's clamp floor is exactly 1.75rem."
      >
        <ul className="flex flex-col gap-5">
          {TYPE_STEPS.map(([token, cls]) => (
            <li
              key={token}
              className="flex flex-col gap-1 border-b border-border pb-5 last:border-0"
            >
              <span className="text-spec-sm text-stone-600">
                {token} · {readToken(`--text-${token}`)} /{" "}
                {readToken(`--text-${token}--line-height`)} /{" "}
                {readToken(`--text-${token}--letter-spacing`)}
              </span>
              <span className={cls}>{t("sample")}</span>
            </li>
          ))}
          <li className="flex flex-col gap-1">
            <span className="text-spec-sm text-stone-600">
              spec · JetBrains Mono, tabular-nums always
            </span>
            <span className="text-spec">{t("specSample")}</span>
          </li>
        </ul>
      </Section>
    );
  },
};

export const SpacingAndRadius: Story = {
  render: () => (
    <div className="flex flex-col">
      <Section
        title="Spacing rhythm"
        note="Named tokens, not raw numbers. These are responsive — resize the viewport and the values change with the breakpoint, which is why components consume the intent rather than the number."
      >
        <ul className="flex flex-col gap-3">
          {(
            [
              { token: "--space-section", label: "Section vertical rhythm" },
              { token: "--space-gutter", label: "Page horizontal gutter" },
              { token: "--space-card-pad", label: "Card internal padding" },
              { token: "--space-grid-gap", label: "Product grid gap" },
              { token: "--space-field-stack", label: "Form field stack" },
            ] as const
          ).map(({ token, label }) => (
            <li key={token} className="flex items-center gap-4">
              <span className="w-48 shrink-0 text-spec-sm text-stone-600">
                {token}
              </span>
              <div
                className="h-6 rounded-sm bg-cyan-100"
                style={{ width: `var(${token})` }}
              />
              <span className="text-spec-sm">{readToken(token)}</span>
              <span className="text-body-sm text-stone-600">{label}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Radius"
        note="Product images are 12px (md) and never more — tiles are square-edged objects, and heavily rounded product imagery misrepresents them."
      >
        <ul className="flex flex-wrap gap-6">
          {["sm", "md", "lg", "xl"].map((size) => (
            <li key={size} className="flex flex-col items-center gap-2">
              <div
                className="size-24 border border-stone-300 bg-stone-100"
                style={{ borderRadius: `var(--radius-${size})` }}
              />
              <span className="text-spec-sm">
                {size} · {readToken(`--radius-${size}`)}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Elevation"
        note="Six shadows, no more. Always tinted navy, never neutral black — it is what makes every surface read as one material."
      >
        <ul className="flex flex-wrap gap-8 p-4">
          {["xs", "card", "hover", "float", "overlay"].map((name) => (
            <li key={name} className="flex flex-col items-center gap-3">
              <div
                className="size-28 rounded-md bg-background"
                style={{ boxShadow: `var(--shadow-${name})` }}
              />
              <span className="text-spec-sm">shadow-{name}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  ),
};

const CURVES = [
  ["ease-material", "House curve. Front-loaded, settles hard, reads as mass."],
  ["ease-out-quart", "Entrances."],
  ["ease-in-out-quart", "Two-way transitions and wipes."],
  ["ease-exit", "Exits — always faster than entrances."],
] as const;

/**
 * Motion. Each curve is playable: hover a swatch and the diamond travels under
 * that easing, at the duration named beside it.
 */
export const Motion: Story = {
  render: () => (
    <div className="flex flex-col">
      <Section
        title="Durations"
        note="Nothing exceeds 800ms except the intro. Exits run about 30% faster than entrances — waiting for something to leave is the most common source of 'this feels slow'."
      >
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "instant",
            "quick",
            "base",
            "slow",
            "cinema",
            "instant-exit",
            "quick-exit",
            "base-exit",
            "slow-exit",
          ].map((name) => (
            <li
              key={name}
              className="flex items-baseline justify-between gap-4 rounded-md border border-border p-3"
            >
              <span className="text-spec-sm">duration-{name}</span>
              <span className="text-spec-sm text-stone-600">
                {readToken(`--duration-${name}`)}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Easing"
        note="Hover a row to play the curve. Nothing bounces — tile is heavy, and bouncy easing makes it feel like plastic."
      >
        <ul className="flex flex-col gap-4">
          {CURVES.map(([name, description]) => (
            <li
              key={name}
              className="group flex flex-col gap-2 rounded-md border border-border p-4"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-spec-sm">{name}</span>
                <span className="text-spec-sm text-stone-600">
                  {readToken(`--${name}`)}
                </span>
              </div>
              <p className="text-body-sm text-stone-600">{description}</p>
              <div className="relative h-10 overflow-hidden rounded-sm bg-stone-50">
                <Diamond
                  className="absolute top-1/2 size-5 -translate-y-1/2 text-navy-700 transition-[inset-inline-start] group-hover:start-[calc(100%-1.75rem)]"
                  style={{
                    insetInlineStart: "0.5rem",
                    transitionDuration: "var(--duration-base)",
                    transitionTimingFunction: `var(--${name})`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Skeleton"
        note="stone-100 with a 1.4s shimmer sweeping at 45° along the brand axis. Under prefers-reduced-motion it goes static — turn the OS setting on and reload."
      >
        <div className="flex max-w-md gap-3">
          <Skeleton className="h-28 w-36" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        </div>
      </Section>
    </div>
  ),
};

/**
 * Brand geometry — docs/01-architecture.md §2.2, §3.1.
 *
 * These are DERIVED from the logo, not the logo. The mark itself ships as the
 * client's own vector, which is still outstanding (§11 q7).
 */
export const BrandGeometry: Story = {
  render: () => (
    <Section
      title="Brand geometry"
      note="Every structural device derives from a 45° square. Switch to Arabic in the toolbar: the layout mirrors, these do not — mirroring them would alter the brand mark."
    >
      <div className="flex flex-wrap items-end gap-10">
        <div className="flex flex-col items-center gap-2">
          <Diamond className="size-12 text-navy-700" />
          <span className="text-spec-sm">Diamond, filled</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Diamond variant="outline" className="size-12 text-navy-700" />
          <span className="text-spec-sm">Diamond, outline</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <SlipRatingIcon className="size-12 text-navy-700" />
          <span className="text-spec-sm">Slip rating</span>
        </div>
        {([1, 2, 3, 4] as const).map((level) => (
          <div key={level} className="flex flex-col items-center gap-2">
            <ShadeVariationIcon level={level} className="size-12 text-navy-700" />
            <span className="text-spec-sm">Shade V{level}</span>
          </div>
        ))}
      </div>
    </Section>
  ),
};
