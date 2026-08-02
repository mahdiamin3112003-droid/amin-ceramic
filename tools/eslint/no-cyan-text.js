/**
 * ESLint rule: no-cyan-text
 *
 * "`cyan-400` (#5FC4E4) is never a text colour on a light background — it fails
 *  WCAG AA at 2.0:1. It is a surface, stroke, glow and motion colour only."
 *  — CLAUDE.md, docs/01-architecture.md §2.3, docs/02-ux-blueprint.md §4.1 rule 1.
 *
 * On `navy-700` or darker, cyan-400 reaches 6.2:1 and IS permitted. That case is
 * rare and always deliberate, so it is opted into explicitly rather than guessed
 * at by the linter:
 *
 *   {/* eslint-disable-next-line amin/no-cyan-text -- on navy-900 ground, 6.2:1 *\/}
 *   <span className="text-cyan-400">…</span>
 *
 * Requiring the justification comment is the point: it turns an accessibility
 * regression into something a reviewer sees.
 */

const CYAN_TEXT_CLASS =
  /(?:^|[\s:])-?text-(?:cyan-(?:50|100|300|400)|stroke-accent|surface-accent)\b/;
const CYAN_TEXT_CSS = /\bcolor\s*:\s*var\(\s*--color-cyan-(?:50|100|300|400)/;

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow cyan as a text colour; it fails WCAG AA on light grounds.",
    },
    schema: [],
    messages: {
      cyanText:
        '"{{value}}" uses cyan as a text colour. cyan-400 is 2.0:1 on white — it fails WCAG AA at any size. Cyan is a surface, stroke, glow and motion colour; navy carries all text weight. If this genuinely sits on navy-700 or darker (6.2:1, permitted), disable this rule on the line with a justification.',
    },
  },

  create(context) {
    /**
     * @param {string} text
     * @param {import('estree').Node} node
     */
    function check(text, node) {
      if (typeof text !== "string") return;
      const match = CYAN_TEXT_CLASS.exec(text) ?? CYAN_TEXT_CSS.exec(text);
      if (match) {
        context.report({
          node,
          messageId: "cyanText",
          data: { value: match[0].trim() },
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
