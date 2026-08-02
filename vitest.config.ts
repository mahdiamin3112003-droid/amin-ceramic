import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Phase 0 tests are pure: no database, no network. Repository and RLS tests
    // arrive in Phase 1 with Testcontainers (docs/01-architecture.md §8.5).
    exclude: ["node_modules/**", ".next/**", "e2e/**", "storybook-static/**"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/lib/**"],
      reporter: ["text", "lcov"],
    },
  },
});
