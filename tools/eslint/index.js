/**
 * `amin` ESLint plugin — the house rules that CLAUDE.md calls non-negotiable and
 * that no off-the-shelf plugin enforces.
 *
 * The layered-architecture boundary (domain/ imports nothing) is enforced
 * separately by eslint-plugin-boundaries in eslint.config.mjs, since that is a
 * dependency-graph problem rather than a syntax one.
 */

import noRawColor from "./no-raw-color.js";
import noPhysicalProperties from "./no-physical-properties.js";
import noCyanText from "./no-cyan-text.js";

/** @type {import('eslint').ESLint.Plugin} */
const plugin = {
  meta: {
    name: "eslint-plugin-amin",
    version: "0.1.0",
  },
  rules: {
    "no-raw-color": noRawColor,
    "no-physical-properties": noPhysicalProperties,
    "no-cyan-text": noCyanText,
  },
};

export default plugin;
