/**
 * ESLint rule: no-raw-color
 *
 * "Design tokens are the single source of truth. No hardcoded colours, spacing,
 *  radii or durations anywhere in components. Ever." — CLAUDE.md
 *
 * docs/02-ux-blueprint.md §4.1 asserts the colour rules are "enforced at the token
 * layer so they cannot be violated by accident". They cannot be: Tailwind 4 emits
 * every colour utility from one `--color-*` declaration, so the token layer has no
 * way to permit `bg-cyan-400` while forbidding `text-cyan-400`. Enforcement is here
 * instead. See docs/adr/0001-no-hardcoded-colour.md.
 *
 * Catches, in TS/TSX only (CSS is Stylelint's job):
 *   - hex literals            "#5FC4E4", '#fff'
 *   - rgb()/rgba()/hsl()/hsla()/oklch()/lab() literals
 *   - Tailwind arbitrary colour values   "bg-[#5FC4E4]", "text-[rgb(0,0,0)]"
 *
 * The single permitted home for literal colour is src/app/globals.css.
 */

const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const FUNCTIONAL = /\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\(\s*[\d.]/;
const ARBITRARY = /-\[(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch)\()/;

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow literal colour values outside the token file; use a design token.",
    },
    schema: [],
    messages: {
      rawColor:
        'Literal colour "{{value}}" is not allowed. Every colour comes from a design token — use a Tailwind token utility (e.g. `text-navy-700`) or `var(--color-…)`. Token definitions live in src/app/globals.css. See docs/adr/0001-no-hardcoded-colour.md.',
    },
  },

  create(context) {
    /**
     * @param {string} text
     * @param {import('estree').Node} node
     */
    function check(text, node) {
      if (typeof text !== "string") return;
      const match = HEX.exec(text) ?? FUNCTIONAL.exec(text) ?? ARBITRARY.exec(text);
      if (match) {
        context.report({
          node,
          messageId: "rawColor",
          data: { value: match[0] },
        });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") check(node.value, node);
      },
      TemplateElement(node) {
        check(node.value.raw, node);
      },
    };
  },
};

export default rule;
