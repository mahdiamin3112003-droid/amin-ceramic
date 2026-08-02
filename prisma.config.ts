import path from "node:path";

import { defineConfig } from "prisma/config";

/**
 * A prisma.config.ts disables Prisma's own .env loading, so the CLI would not
 * see DATABASE_URL. Next.js reads .env.local; this makes the CLI agree with it
 * rather than requiring two copies of the connection string.
 */
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    // Absent is fine — CI supplies the variables directly.
  }
}

/**
 * Prisma configuration.
 *
 * `schema` points at a DIRECTORY, not a file: the schema is split by bounded
 * domain per docs/03-database-design.md §15.1 so it stays navigable at ~80
 * models. Prisma concatenates every .prisma file in the folder.
 */
export default defineConfig({
  schema: path.join("prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
