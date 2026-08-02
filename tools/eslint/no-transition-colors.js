/**
 * ESLint rule: no-transition-colors
 *
 * Tailwind's `transition-colors` includes `outline-color` in its property list.
 * Any element carrying it fades its focus ring in FROM `currentColor` — on a
 * navy button that is a white ring on a white page for the duration of the
 * transition. docs/02-ux-blueprint.md §7.4 requires one focus treatment that is
 * legible the instant it appears.
 *
 * `@utility transition-colors` does not fix it: Tailwind merges an override of a
 * built-in into the same rule rather than replacing it, so the built-in's
 * `transition-property` still wins on source order. Hence a differently-named
 * utility, `transition-surface`, and this rule to stop the built-in coming back.
 *
 * `transition-all` is caught too, for the same reason and worse — it transitions
 * every animatable property, which is both a performance problem and a
 * correctness one.
 */

const BANNED = new Map([
  ["transition-colors", "transition-surface"],
  ["transition-all", "an explicit transition-[…] property list"],
]);

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow Tailwind transition utilities that animate outline-color.",
    },
    schema: [],
    messages: {
      banned:
        '"{{token}}" animates `outline-color`, which makes the focus ring fade in from the wrong colour (§7.4). Use `{{replacement}}` instead — see the note in src/app/globals.css.',
    },
  },

  create(context) {
    /**
     * @param {string} text
     * @param {import('estree').Node} node
     */
    function check(text, node) {
      if (typeof text !== "string") return;
      for (const token of text.split(/\s+/)) {
        const bare = token.slice(token.lastIndexOf(":") + 1);
        const replacement = BANNED.get(bare);
        if (replacement) {
          context.report({
            node,
            messageId: "banned",
            data: { token: bare, replacement },
          });
          return;
        }
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
