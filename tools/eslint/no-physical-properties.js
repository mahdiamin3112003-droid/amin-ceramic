/**
 * ESLint rule: no-physical-properties
 *
 * "CSS logical properties everywhere (`margin-inline-start`, not `margin-left`).
 *  The site is bilingual EN/AR with RTL from day one. Retrofitting costs 3-4x."
 *  — CLAUDE.md, and docs/01-architecture.md §3.6.
 *
 * Catches physical-direction Tailwind utilities in class strings and physical CSS
 * properties in inline style objects. See docs/adr/0002-logical-properties-only.md.
 *
 * Deliberately NOT flagged:
 *   - `translate-x-*`, `rotate-*`, `skew-*` and other transforms. Brand geometry
 *     does not mirror (docs/01-architecture.md §3.6): the diamond keeps its
 *     bottom-left -> top-right axis in RTL. Transforms are the correct tool for
 *     exactly that, so flagging them would fight the brand decision.
 *   - `overflow-x-*`, `scroll-x`, `w-*`/`h-*`: axis, not direction.
 */

/** Physical Tailwind utility prefix -> logical replacement. */
const CLASS_REPLACEMENTS = new Map([
  ["ml", "ms"],
  ["mr", "me"],
  ["pl", "ps"],
  ["pr", "pe"],
  ["left", "start"],
  ["right", "end"],
  ["border-l", "border-s"],
  ["border-r", "border-e"],
  ["rounded-l", "rounded-s"],
  ["rounded-r", "rounded-e"],
  ["rounded-tl", "rounded-ss"],
  ["rounded-tr", "rounded-se"],
  ["rounded-br", "rounded-ee"],
  ["rounded-bl", "rounded-es"],
  ["text-left", "text-start"],
  ["text-right", "text-end"],
  ["float-left", "float-start"],
  ["float-right", "float-end"],
  ["clear-left", "clear-start"],
  ["clear-right", "clear-end"],
  ["space-x", "gap (on a flex/grid parent)"],
  ["divide-x", "a border-inline utility"],
  ["inset-x", "inset-inline"],
  ["scroll-ml", "scroll-ms"],
  ["scroll-mr", "scroll-me"],
  ["scroll-pl", "scroll-ps"],
  ["scroll-pr", "scroll-pe"],
]);

/** Physical CSS property (camelCase, for style={{}}) -> logical replacement. */
const STYLE_REPLACEMENTS = new Map([
  ["marginLeft", "marginInlineStart"],
  ["marginRight", "marginInlineEnd"],
  ["paddingLeft", "paddingInlineStart"],
  ["paddingRight", "paddingInlineEnd"],
  ["borderLeft", "borderInlineStart"],
  ["borderRight", "borderInlineEnd"],
  ["borderLeftWidth", "borderInlineStartWidth"],
  ["borderRightWidth", "borderInlineEndWidth"],
  ["borderLeftColor", "borderInlineStartColor"],
  ["borderRightColor", "borderInlineEndColor"],
  ["left", "insetInlineStart"],
  ["right", "insetInlineEnd"],
  ["textAlign", 'textAlign with "start"/"end", not "left"/"right"'],
  ["borderTopLeftRadius", "borderStartStartRadius"],
  ["borderTopRightRadius", "borderStartEndRadius"],
  ["borderBottomRightRadius", "borderEndEndRadius"],
  ["borderBottomLeftRadius", "borderEndStartRadius"],
]);

// Longest-first, so `border-l` is tested before `left` can produce a bad match.
const CLASS_KEYS = [...CLASS_REPLACEMENTS.keys()].sort(
  (a, b) => b.length - a.length,
);

/**
 * A Tailwind class token is physical when it equals a keyword (`text-left`) or
 * is that keyword followed by `-` (`ml-4`, `left-1/2`). Variants (`md:`, `hover:`)
 * and the `-` negative prefix are stripped first.
 *
 * @param {string} token
 * @returns {{ physical: string, logical: string } | null}
 */
function classifyToken(token) {
  const bare = token.slice(token.lastIndexOf(":") + 1).replace(/^-/, "");
  for (const key of CLASS_KEYS) {
    if (bare === key || bare.startsWith(`${key}-`)) {
      return { physical: key, logical: CLASS_REPLACEMENTS.get(key) ?? "" };
    }
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require CSS logical properties so RTL needs no separate stylesheet.",
    },
    schema: [],
    messages: {
      physicalClass:
        'Physical-direction class "{{token}}" breaks RTL. Use `{{logical}}` instead. See docs/adr/0002-logical-properties-only.md.',
      physicalStyle:
        'Physical CSS property "{{property}}" breaks RTL. Use `{{logical}}` instead. See docs/adr/0002-logical-properties-only.md.',
    },
  },

  create(context) {
    /**
     * @param {string} text
     * @param {import('estree').Node} node
     */
    function checkClassString(text, node) {
      if (typeof text !== "string" || text.length === 0) return;
      for (const token of text.split(/\s+/)) {
        if (!token) continue;
        const hit = classifyToken(token);
        if (hit) {
          context.report({
            node,
            messageId: "physicalClass",
            data: { token, logical: hit.logical },
          });
          return; // one report per string is enough to make the point
        }
      }
    }

    /** Is this node inside a `className`/`class` JSX attribute or a cn()/clsx() call? */
    function isClassContext(node) {
      // `side === "right"` inside a cn() call is a comparison operand, not a
      // class name. Without this the rule fires on every conditional-class
      // component and gets switched off, which is worse than not having it.
      if (
        node.parent?.type === "BinaryExpression" ||
        node.parent?.type === "SwitchCase" ||
        (node.parent?.type === "Property" && node.parent.key === node)
      ) {
        return false;
      }

      let current = node.parent;
      let depth = 0;
      while (current && depth < 6) {
        if (
          current.type === "JSXAttribute" &&
          current.name?.type === "JSXIdentifier" &&
          (current.name.name === "className" || current.name.name === "class")
        ) {
          return true;
        }
        if (
          current.type === "CallExpression" &&
          current.callee?.type === "Identifier" &&
          ["cn", "clsx", "cva", "classNames", "twMerge"].includes(
            current.callee.name,
          )
        ) {
          return true;
        }
        current = current.parent;
        depth += 1;
      }
      return false;
    }

    return {
      Literal(node) {
        if (typeof node.value === "string" && isClassContext(node)) {
          checkClassString(node.value, node);
        }
      },
      TemplateElement(node) {
        if (isClassContext(node)) checkClassString(node.value.raw, node);
      },
      Property(node) {
        const key =
          node.key.type === "Identifier"
            ? node.key.name
            : node.key.type === "Literal"
              ? String(node.key.value)
              : null;
        if (!key) return;
        const logical = STYLE_REPLACEMENTS.get(key);
        if (!logical) return;

        // Only flag inside a `style={{ … }}` JSX attribute.
        let current = node.parent;
        let depth = 0;
        while (current && depth < 4) {
          if (
            current.type === "JSXAttribute" &&
            current.name?.type === "JSXIdentifier" &&
            current.name.name === "style"
          ) {
            context.report({
              node,
              messageId: "physicalStyle",
              data: { property: key, logical },
            });
            return;
          }
          current = current.parent;
          depth += 1;
        }
      },
    };
  },
};

export default rule;
