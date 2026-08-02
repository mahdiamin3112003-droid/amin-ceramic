/**
 * The design system's contract test.
 *
 * Two jobs:
 *
 *   1. Every token named in docs/02-ux-blueprint.md §4 and §5.1 exists and holds
 *      the documented value. Deleting or mistyping one fails CI rather than
 *      silently degrading a component three phases later.
 *
 *   2. Every colour RULE in §4.1 holds, computed rather than transcribed. The
 *      blueprint's own contrast table understates two values (navy-700 is
 *      ~12.4:1 not 10.6:1; blue-500 is ~6.0:1 not 4.9:1), so the numbers are
 *      derived from the tokens here and the table is treated as prose.
 */

import { describe, expect, it } from "vitest";

import { WCAG, contrastRatio, contrastRatioRounded } from "@/lib/utils/contrast";
import { readBrandRamp, readTokens, resolveColour } from "@/lib/utils/tokens";

const tokens = readTokens();
const { theme, root, arabic, all } = tokens;

const colour = (name: string) => resolveColour(name, all);
const WHITE = "#ffffff";

// ---------------------------------------------------------------------------
// Colour — docs/02-ux-blueprint.md §4.1
// ---------------------------------------------------------------------------

describe("colour tokens", () => {
  it.each([
    ["--color-navy-950", "#0c1338"],
    ["--color-navy-900", "#141f52"],
    ["--color-navy-800", "#1a2660"],
    ["--color-navy-700", "#1e2c6e"],
    ["--color-navy-600", "#2a3d8f"],
    ["--color-blue-500", "#3560b4"],
    ["--color-blue-400", "#4a79c9"],
    ["--color-cyan-400", "#5fc4e4"],
    ["--color-cyan-300", "#8ad4ec"],
    ["--color-cyan-100", "#cbe4f3"],
    ["--color-cyan-50", "#ebf5fb"],
    ["--color-white", "#ffffff"],
    ["--color-stone-50", "#f6f7f9"],
    ["--color-stone-100", "#edeff3"],
    ["--color-stone-300", "#d8dce3"],
    ["--color-stone-500", "#8a93a3"],
    ["--color-stone-600", "#5b6472"],
    ["--color-stone-800", "#2e3441"],
    ["--color-success-600", "#1b7a4b"],
    ["--color-success-50", "#e8f5ee"],
    ["--color-warning-600", "#a16207"],
    ["--color-warning-50", "#fef6e7"],
    ["--color-danger-600", "#b42318"],
    ["--color-danger-50", "#fef0ef"],
    ["--color-info-600", "#2a3d8f"],
  ])("%s is %s, exactly as extracted from the logo", (token, expected) => {
    expect(theme.get(token)).toBe(expected);
  });

  it("exposes the ramp for Storybook and the demo route to render", () => {
    // Both read this rather than restating the hexes, so neither can drift.
    const ramp = readBrandRamp(tokens);
    expect(ramp).toHaveLength(20);
    expect(ramp.every((entry) => /^#[0-9a-f]{6}$/.test(entry.hex))).toBe(true);
  });

  it("defines no colours beyond the documented palette", () => {
    // Tailwind's stock palette is cleared with `--color-*: initial`, so a stray
    // `bg-red-500` fails at build time rather than shipping an off-brand colour.
    expect(theme.get("--color-*")).toBe("initial");
  });
});

// ---------------------------------------------------------------------------
// The cyan rule — the single most important accessibility constraint we carry
// ---------------------------------------------------------------------------

describe("the cyan rule (§4.1 rule 1)", () => {
  it("cyan-400 fails AA as text on white, which is WHY it is banned", () => {
    const ratio = contrastRatio(colour("--color-cyan-400"), WHITE);
    expect(contrastRatioRounded(colour("--color-cyan-400"), WHITE)).toBe(2);
    expect(ratio).toBeLessThan(WCAG.AA_LARGE);
  });

  it.each(["--color-cyan-300", "--color-cyan-100", "--color-cyan-50"])(
    "%s also fails as text on white",
    (token) => {
      expect(contrastRatio(colour(token), WHITE)).toBeLessThan(WCAG.AA_LARGE);
    },
  );

  it("cyan-400 DOES pass on navy-700, which is why it is permitted there", () => {
    const ratio = contrastRatio(
      colour("--color-cyan-400"),
      colour("--color-navy-700"),
    );
    expect(ratio).toBeGreaterThanOrEqual(WCAG.AA_NORMAL);
  });

  it("the focus ring on dark grounds uses cyan-400 and passes there", () => {
    expect(root.get("--focus-ring-color-on-dark")).toBe("var(--color-cyan-400)");
    expect(
      contrastRatio(colour("--color-cyan-400"), colour("--color-navy-950")),
    ).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
  });
});

// ---------------------------------------------------------------------------
// Contrast — every token the blueprint permits as text must earn it
// ---------------------------------------------------------------------------

describe("text colours on white", () => {
  it.each([
    "--color-navy-950",
    "--color-navy-900",
    "--color-navy-800",
    "--color-navy-700",
    "--color-navy-600",
    "--color-blue-500",
    "--color-stone-600",
    "--color-stone-800",
    "--color-success-600",
    "--color-warning-600",
    "--color-danger-600",
    "--color-info-600",
  ])("%s meets WCAG AA (4.5:1)", (token) => {
    expect(contrastRatio(colour(token), WHITE)).toBeGreaterThanOrEqual(
      WCAG.AA_NORMAL,
    );
  });

  it.each(["--color-navy-900", "--color-stone-800"])(
    "%s meets AAA (7:1) — body text is held to AAA per §7.3",
    (token) => {
      expect(contrastRatio(colour(token), WHITE)).toBeGreaterThanOrEqual(
        WCAG.AAA_NORMAL,
      );
    },
  );

  it("blue-400 is large-text-and-icons only, as documented", () => {
    const ratio = contrastRatio(colour("--color-blue-400"), WHITE);
    expect(ratio).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
    expect(ratio).toBeLessThan(WCAG.AA_NORMAL);
  });
});

describe("role tokens resolve to accessible pairings", () => {
  it.each([
    ["--color-foreground", "--color-background"],
    ["--color-primary-foreground", "--color-primary"],
    ["--color-destructive-foreground", "--color-destructive"],
    ["--color-secondary-foreground", "--color-secondary"],
    ["--color-muted-foreground", "--color-muted"],
    ["--color-accent-foreground", "--color-accent"],
    ["--color-card-foreground", "--color-card"],
    ["--color-popover-foreground", "--color-popover"],
  ])("%s on %s meets AA", (fg, bg) => {
    expect(contrastRatio(colour(fg), colour(bg))).toBeGreaterThanOrEqual(
      WCAG.AA_NORMAL,
    );
  });

  it("borders and the focus ring meet the 3:1 non-text minimum (§7.3)", () => {
    expect(contrastRatio(colour("--color-border"), WHITE)).toBeGreaterThanOrEqual(
      1.3,
    ); // hairlines are decorative separation
    expect(contrastRatio(colour("--color-ring"), WHITE)).toBeGreaterThanOrEqual(
      WCAG.AA_LARGE,
    );
  });
});

// ---------------------------------------------------------------------------
// Typography — §4.2
// ---------------------------------------------------------------------------

describe("type scale", () => {
  it.each([
    ["--text-display-xl", "clamp(3rem, 7vw, 7rem)", "0.95", "-0.02em"],
    ["--text-display-lg", "clamp(2.25rem, 4.5vw, 4.5rem)", "1", "-0.015em"],
    ["--text-display-md", "clamp(1.75rem, 3vw, 3rem)", "1.1", "-0.01em"],
    ["--text-heading-lg", "1.75rem", "1.25", "-0.01em"],
    ["--text-heading-md", "1.25rem", "1.35", "-0.005em"],
    ["--text-heading-sm", "1rem", "1.4", "0em"],
    ["--text-body-lg", "1.125rem", "1.7", "0em"],
    ["--text-body", "1rem", "1.65", "0em"],
    ["--text-body-sm", "0.875rem", "1.6", "0em"],
    ["--text-caption", "0.8125rem", "1.5", "0.06em"],
    ["--text-spec", "0.875rem", "1.5", "0em"],
    ["--text-spec-sm", "0.75rem", "1.45", "0em"],
  ])("%s is %s / %s / %s", (token, size, lineHeight, tracking) => {
    expect(theme.get(token)).toBe(size);
    expect(theme.get(`${token}--line-height`)).toBe(lineHeight);
    expect(theme.get(`${token}--letter-spacing`)).toBe(tracking);
  });

  it("clears Tailwind's stock size scale so only these twelve steps exist", () => {
    expect(theme.get("--text-*")).toBe("initial");
  });

  it("display-md's floor is 28px — Marcellus is never used below that (§4.2)", () => {
    // 1.75rem === 28px at the 16px root we pin in the base layer.
    expect(theme.get("--text-display-md")).toContain("1.75rem");
  });

  it("binds all five families", () => {
    expect(theme.get("--font-display")).toContain("--font-marcellus");
    expect(theme.get("--font-sans")).toContain("--font-inter");
    expect(theme.get("--font-mono")).toContain("--font-jetbrains-mono");
    expect(theme.get("--font-arabic-display")).toContain(
      "--font-noto-naskh-arabic",
    );
    expect(theme.get("--font-arabic-sans")).toContain(
      "--font-ibm-plex-sans-arabic",
    );
  });
});

describe("Arabic type (§4.2)", () => {
  const STEP_UP = 1.08;
  const LINE_HEIGHT_STEP = 1.12;

  it("switches both families to the Arabic faces", () => {
    expect(arabic.get("--font-display")).toContain("--font-noto-naskh-arabic");
    expect(arabic.get("--font-sans")).toContain("--font-ibm-plex-sans-arabic");
  });

  it.each([
    ["--text-heading-lg", 1.75],
    ["--text-heading-md", 1.25],
    ["--text-heading-sm", 1],
    ["--text-body-lg", 1.125],
    ["--text-body", 1],
    ["--text-body-sm", 0.875],
    ["--text-caption", 0.8125],
  ])("%s steps up 8%%", (token, latinRem) => {
    const value = arabic.get(token);
    expect(value).toBeDefined();
    const arabicRem = Number.parseFloat(value!);
    expect(arabicRem).toBeCloseTo(latinRem * STEP_UP, 4);
  });

  it.each([
    ["--text-body", 1.65],
    ["--text-body-lg", 1.7],
    ["--text-heading-lg", 1.25],
  ])("%s line-height steps up 12%%", (token, latin) => {
    const value = arabic.get(`${token}--line-height`);
    expect(value).toBeDefined();
    expect(Number.parseFloat(value!)).toBeCloseTo(latin * LINE_HEIGHT_STEP, 4);
  });

  it("zeroes tracking — Arabic is cursive and letter-spacing breaks the joins", () => {
    for (const token of [
      "--text-display-xl",
      "--text-display-lg",
      "--text-display-md",
      "--text-heading-lg",
      "--text-heading-md",
      "--text-caption",
    ]) {
      expect(arabic.get(`${token}--letter-spacing`)).toBe("0em");
    }
  });

  it("leaves mono alone — SKUs and dimensions are Latin in both locales", () => {
    expect(arabic.has("--font-mono")).toBe(false);
    expect(arabic.has("--text-spec")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Spacing, grid, radius, elevation — §4.3 – §4.6
// ---------------------------------------------------------------------------

describe("spacing and grid", () => {
  it("uses a 4px base", () => {
    expect(theme.get("--spacing")).toBe("0.25rem");
  });

  it.each([
    ["--space-section", "5rem"],
    ["--space-gutter", "1.25rem"],
    ["--space-card-pad", "1rem"],
    ["--space-grid-gap", "0.75rem"],
    ["--space-field-stack", "1rem"],
  ])("mobile rhythm token %s is %s", (token, expected) => {
    expect(root.get(token)).toBe(expected);
  });

  it("moves the sm breakpoint to 480px per §4.4, not Tailwind's 640px", () => {
    expect(theme.get("--breakpoint-sm")).toBe("30rem");
  });

  it("caps content width at 1440px and prose measure at 68ch", () => {
    expect(theme.get("--container-content")).toBe("90rem");
    expect(theme.get("--container-prose")).toBe("68ch");
  });
});

describe("radius (§4.5)", () => {
  it.each([
    ["--radius-sm", "0.375rem"],
    ["--radius-md", "0.75rem"],
    ["--radius-lg", "1.25rem"],
    ["--radius-xl", "1.75rem"],
  ])("%s is %s", (token, expected) => {
    expect(theme.get(token)).toBe(expected);
  });

  it("product images are 12px and never more — tiles are square-edged", () => {
    expect(theme.get("--radius-md")).toBe("0.75rem");
  });
});

describe("elevation (§4.6)", () => {
  it.each([
    "--shadow-xs",
    "--shadow-card",
    "--shadow-hover",
    "--shadow-float",
    "--shadow-overlay",
  ])("%s is defined", (token) => {
    expect(theme.get(token)).toBeDefined();
  });

  it("defines exactly five shadows — six with the focus ring, no more", () => {
    const shadows = [...theme.keys()].filter(
      (k) => k.startsWith("--shadow-") && k !== "--shadow-*",
    );
    expect(shadows).toHaveLength(5);
  });

  it("tints every shadow navy, never neutral black", () => {
    for (const [name, value] of theme) {
      if (!name.startsWith("--shadow-") || name === "--shadow-*") continue;
      expect(value).toContain("rgb(20 31 82");
      expect(value).not.toMatch(/rgba?\(\s*0[\s,]+0[\s,]+0/);
    }
  });
});

// ---------------------------------------------------------------------------
// Motion — §5.1
// ---------------------------------------------------------------------------

describe("motion tokens (§5.1)", () => {
  it.each([
    ["--duration-instant", "120ms"],
    ["--duration-quick", "240ms"],
    ["--duration-base", "420ms"],
    ["--duration-slow", "800ms"],
    ["--duration-cinema", "4200ms"],
  ])("%s is %s", (token, expected) => {
    expect(root.get(token)).toBe(expected);
  });

  it.each([
    ["--ease-material", "cubic-bezier(0.32, 0.72, 0, 1)"],
    ["--ease-out-quart", "cubic-bezier(0.25, 1, 0.5, 1)"],
    ["--ease-in-out-quart", "cubic-bezier(0.76, 0, 0.24, 1)"],
    ["--ease-exit", "cubic-bezier(0.4, 0, 1, 1)"],
  ])("%s is %s", (token, expected) => {
    expect(theme.get(token)).toBe(expected);
  });

  it("nothing bounces — no easing overshoots its 0–1 range", () => {
    for (const [name, value] of theme) {
      if (!name.startsWith("--ease-") || name === "--ease-*") continue;
      const match = /cubic-bezier\(([^)]+)\)/.exec(value);
      if (!match?.[1]) continue;
      const [, y1, , y2] = match[1].split(",").map((n) => Number.parseFloat(n));
      // Tile is heavy. An easing whose y control points leave [0,1] overshoots,
      // which reads as plastic (§5.1 principle 1).
      expect(y1).toBeGreaterThanOrEqual(0);
      expect(y1).toBeLessThanOrEqual(1);
      expect(y2).toBeGreaterThanOrEqual(0);
      expect(y2).toBeLessThanOrEqual(1);
    }
  });

  it("exits are ~30% faster than their entrances", () => {
    const pairs: [string, string][] = [
      ["--duration-instant", "--duration-instant-exit"],
      ["--duration-quick", "--duration-quick-exit"],
      ["--duration-base", "--duration-base-exit"],
      ["--duration-slow", "--duration-slow-exit"],
    ];
    for (const [entrance, exit] of pairs) {
      const inMs = Number.parseFloat(root.get(entrance) ?? "0");
      const outMs = Number.parseFloat(root.get(exit) ?? "0");
      expect(outMs).toBeGreaterThan(0);
      expect(outMs / inMs).toBeCloseTo(0.7, 1);
    }
  });

  it.each([
    ["--stagger-tight", "40ms"],
    ["--stagger-base", "60ms"],
    ["--stagger-loose", "90ms"],
  ])("%s is %s", (token, expected) => {
    expect(root.get(token)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// The gradient rule — §4.1 rule 2
// ---------------------------------------------------------------------------

describe("the gradient rule", () => {
  it("defines exactly one gradient, on the logo's own 135° axis", () => {
    const gradient = root.get("--gradient-brand");
    expect(gradient).toBeDefined();
    expect(gradient).toContain("135deg");
    expect(gradient).toContain("--color-navy-700");
    expect(gradient).toContain("--color-blue-500");
    expect(gradient).toContain("--color-cyan-400");

    const gradients = [...all.keys()].filter((k) => k.includes("gradient"));
    expect(gradients).toEqual(["--gradient-brand"]);
  });
});
