import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import storybook from "eslint-plugin-storybook";

import amin from "./tools/eslint/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-config-next 15.x still ships eslintrc-style config, so it comes in
// through FlatCompat. (Next 16 exports flat configs natively — revisit if we
// upgrade; see docs/adr/0005-framework-version-pins.md.)
const compat = new FlatCompat({ baseDirectory: __dirname });

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "storybook-static/**",
      "next-env.d.ts",
      "prisma/generated/**",
      "**/*.gitkeep",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...compat.extends("next/core-web-vitals"),
  ...storybook.configs["flat/recommended"],

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // House rules — CLAUDE.md non-negotiables
  // ───────────────────────────────────────────────────────────────────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { amin },
    rules: {
      "amin/no-raw-color": "error",
      "amin/no-physical-properties": "error",
      "amin/no-cyan-text": "error",
      "amin/no-transition-colors": "error",

      // "TypeScript strict. No `any`."
      "@typescript-eslint/no-explicit-any": "error",

      // Prisma types never leave infrastructure/ (docs/01-architecture.md §5.3,
      // docs/03-database-design.md §15.4). Repositories return domain types.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              message:
                "Prisma types never leave src/infrastructure/db/. Repositories map to domain types before returning. See docs/01-architecture.md §5.3.",
            },
          ],
        },
      ],
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Layered architecture — docs/01-architecture.md §5.3 and §9
  //
  // "The domain layer imports nothing. No Prisma, no React, no fetch."
  // Enforced, not merely intended.
  // ───────────────────────────────────────────────────────────────────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/include": ["src/**/*"],
      "boundaries/elements": [
        { type: "domain", pattern: "src/domain/**/*", mode: "full" },
        { type: "application", pattern: "src/application/**/*", mode: "full" },
        {
          type: "infrastructure",
          pattern: "src/infrastructure/**/*",
          mode: "full",
        },
        { type: "presentation", pattern: "src/app/**/*", mode: "full" },
        { type: "presentation", pattern: "src/components/**/*", mode: "full" },
        { type: "shared", pattern: "src/lib/**/*", mode: "full" },
        { type: "shared", pattern: "src/types/**/*", mode: "full" },
        { type: "shared", pattern: "src/i18n/**/*", mode: "full" },
        { type: "test", pattern: "src/test/**/*", mode: "full" },
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          message:
            "${file.type} may not import ${dependency.type}. See the layer diagram in docs/01-architecture.md §5.3.",
          rules: [
            {
              from: ["domain"],
              allow: ["domain"],
              message:
                "domain/ imports NOTHING outside domain/ — no Prisma, no React, no fetch, no lib. It is pure business rules and it will outlive every other layer. See docs/01-architecture.md §5.3.",
            },
            {
              // Use-cases orchestrate: they call repositories, AI providers and
              // the cache. That is the flow docs/01-architecture.md §5.4 draws.
              // What they may NOT do is import presentation.
              from: ["application"],
              allow: ["domain", "application", "infrastructure", "shared"],
            },
            {
              from: ["infrastructure"],
              allow: ["domain", "application", "infrastructure", "shared"],
            },
            {
              from: ["presentation"],
              allow: ["domain", "application", "presentation", "shared"],
              message:
                "Presentation reaches infrastructure through an application use-case, never directly. See docs/04-api-architecture.md §1.3.",
            },
            { from: ["shared"], allow: ["domain", "shared"] },
            {
              from: ["test"],
              allow: [
                "domain",
                "application",
                "infrastructure",
                "presentation",
                "shared",
                "test",
              ],
            },
          ],
        },
      ],

      // The rule that makes domain purity real: no npm packages either.
      "boundaries/external": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: ["domain"],
              disallow: ["*"],
              message:
                "domain/ has zero runtime dependencies — not even zod. Validation happens at the application boundary (docs/04-api-architecture.md §19.1); branded types here are plain TypeScript. See docs/adr/0003-domain-purity.md.",
            },
          ],
        },
      ],
    },
  },

  // Repositories are the one place Prisma types are allowed to exist.
  {
    files: ["src/infrastructure/db/**/*.ts", "prisma/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  // Config, tooling and Storybook files are not part of the layered app.
  {
    files: [
      "*.{js,mjs,cjs,ts,mts}",
      "tools/**/*.js",
      ".storybook/**/*.{ts,tsx}",
      "prisma/**/*.ts",
    ],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      "boundaries/element-types": "off",
      "boundaries/external": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },

  // Stories legitimately show tokens raw — that IS their subject matter.
  {
    files: ["**/*.stories.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    rules: {
      "amin/no-raw-color": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  // Domain purity (§5.3) governs the domain code itself, not the test
  // harness that exercises it — a *.test.ts file co-located with domain
  // code legitimately imports vitest, the same way a .stories.tsx file
  // legitimately imports Storybook regardless of which layer it documents.
  {
    files: ["**/*.{test,spec}.{ts,tsx}"],
    rules: {
      "boundaries/external": "off",
    },
  },
);
