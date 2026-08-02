/**
 * Reads the design tokens straight out of src/app/globals.css.
 *
 * The tests assert against the real file rather than a duplicated fixture,
 * because a fixture is just a second source of truth waiting to disagree with
 * the first. If a token is deleted, renamed or mistyped, the tests fail.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Resolved from the Vitest root (the project root) rather than import.meta.url,
// which Vitest does not hand back as a file: URL.
const GLOBALS_CSS = resolve(process.cwd(), "src/app/globals.css");

/** Raw text of the token file. */
export function readGlobalsCss(): string {
  return readFileSync(GLOBALS_CSS, "utf8");
}

/**
 * Extract the body of the first block whose selector/at-rule starts with
 * `opener`, balancing braces so nested at-rules (media queries, keyframes)
 * don't terminate it early.
 */
function extractBlock(css: string, opener: string): string {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`Block not found in globals.css: ${opener}`);

  const braceStart = css.indexOf("{", start);
  if (braceStart === -1) throw new Error(`No opening brace after: ${opener}`);

  let depth = 0;
  for (let i = braceStart; i < css.length; i += 1) {
    const char = css[i];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(braceStart + 1, i);
    }
  }
  throw new Error(`Unbalanced braces in block: ${opener}`);
}

/** Parse `--name: value;` declarations out of a block body. */
function parseDeclarations(block: string): Map<string, string> {
  const declarations = new Map<string, string>();
  // Strip comments first so a commented-out token never counts as present.
  const withoutComments = block.replace(/\/\*[\s\S]*?\*\//g, "");
  // The trailing `\*?` catches Tailwind 4's namespace-clearing declarations
  // (`--color-*: initial`), which are load-bearing here: they are what removes
  // the stock palette and type scale.
  const pattern = /(--[\w-]+\*?)\s*:\s*([^;}]+);/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(withoutComments)) !== null) {
    const [, name, value] = match;
    if (name && value) {
      declarations.set(name, value.replace(/\s+/g, " ").trim());
    }
  }
  return declarations;
}

export interface TokenSets {
  /** Everything declared inside `@theme { … }`. */
  readonly theme: Map<string, string>;
  /** Everything declared inside the first `:root { … }`. */
  readonly root: Map<string, string>;
  /** The Arabic overrides in `html[lang="ar"] { … }`. */
  readonly arabic: Map<string, string>;
  /** theme + root merged — the effective default token set. */
  readonly all: Map<string, string>;
}

export function readTokens(css: string = readGlobalsCss()): TokenSets {
  const theme = parseDeclarations(extractBlock(css, "@theme"));
  const root = parseDeclarations(extractBlock(css, ":root"));
  const arabic = parseDeclarations(extractBlock(css, 'html[lang="ar"]'));

  return {
    theme,
    root,
    arabic,
    all: new Map([...theme, ...root]),
  };
}

/**
 * Resolve a token to a literal hex value, following `var(--other)` chains.
 * Role tokens (`--color-primary`) are aliases, so a contrast assertion has to
 * chase them down to the ramp colour they point at.
 */
export function resolveColour(
  name: string,
  tokens: Map<string, string>,
  seen = new Set<string>(),
): string {
  if (seen.has(name)) throw new Error(`Circular token reference at ${name}`);
  seen.add(name);

  const value = tokens.get(name);
  if (value === undefined) throw new Error(`Token not defined: ${name}`);

  const varMatch = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
  if (varMatch?.[1]) return resolveColour(varMatch[1], tokens, seen);

  if (!value.startsWith("#")) {
    throw new Error(`Token ${name} is not a hex colour: "${value}"`);
  }
  return value;
}

/**
 * The brand ramp in the order docs/02-ux-blueprint.md §4.1 lists it, resolved to
 * literal hex from the token file.
 *
 * Reading it rather than restating it is the point: the Storybook Tokens page
 * and the foundation demo route both render this, so neither can drift from what
 * the product actually ships. Node runtime only (it reads from disk).
 */
export interface RampEntry {
  readonly token: string;
  readonly hex: string;
  readonly note?: string;
}

const RAMP_ORDER: readonly { name: string; note?: string }[] = [
  { name: "navy-950" },
  { name: "navy-900" },
  { name: "navy-800" },
  { name: "navy-700", note: "primary" },
  { name: "navy-600" },
  { name: "blue-500" },
  { name: "blue-400", note: "large text and icons only" },
  { name: "cyan-400", note: "surface, stroke, glow — never text on light" },
  { name: "cyan-300", note: "decorative only" },
  { name: "cyan-100" },
  { name: "cyan-50" },
  { name: "stone-50" },
  { name: "stone-100" },
  { name: "stone-300" },
  { name: "stone-500" },
  { name: "stone-600" },
  { name: "stone-800" },
  { name: "success-600" },
  { name: "warning-600" },
  { name: "danger-600" },
];

export function readBrandRamp(tokens: TokenSets = readTokens()): RampEntry[] {
  return RAMP_ORDER.map(({ name, note }) => ({
    token: name,
    hex: resolveColour(`--color-${name}`, tokens.all),
    ...(note === undefined ? {} : { note }),
  }));
}
