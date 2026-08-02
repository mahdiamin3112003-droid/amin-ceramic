import path from "node:path";

import { PrismaClient } from "@prisma/client";

// Run directly by tsx, so it does not go through prisma.config.ts and gets no
// environment loading for free. Same order Next.js uses.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    // Absent is fine — CI supplies the variables directly.
  }
}

/**
 * Seed — one tenant row.
 *
 * Phase 0 seeds identity only. The ~40 real products from the client's catalog
 * arrive in Phase 1 (docs/01-architecture.md §10).
 *
 * Idempotent by upsert on `slug`, so re-running against a populated database is
 * safe. That matters more than it sounds: a seed that can only run once is a
 * seed nobody dares run, and it rots.
 *
 * Values follow docs/03-database-design.md §2.1. `legalName` is left null until
 * the registered entity name is confirmed.
 */

const prisma = new PrismaClient();

const TENANT = {
  slug: "amin-ceramic",
  name: "Amin Ceramic",
  legalName: "Amin Ceramic",
  defaultLocale: "en",
  supportedLocales: ["en", "ar"],
  defaultCurrency: "USD",
  measurementSystem: "metric",
  // Overridable per product and per layout pattern.
  defaultWastagePct: 10.0,
  status: "active",
} as const;

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT.slug },
    // Deliberately narrow: re-seeding must not stomp settings an admin has
    // changed in production. Only the identifying fields are refreshed.
    update: {
      name: TENANT.name,
      legalName: TENANT.legalName,
      supportedLocales: [...TENANT.supportedLocales],
    },
    create: {
      slug: TENANT.slug,
      name: TENANT.name,
      legalName: TENANT.legalName,
      defaultLocale: TENANT.defaultLocale,
      supportedLocales: [...TENANT.supportedLocales],
      defaultCurrency: TENANT.defaultCurrency,
      measurementSystem: TENANT.measurementSystem,
      defaultWastagePct: TENANT.defaultWastagePct,
      status: TENANT.status,
    },
  });

  console.log(
    `seeded tenant ${tenant.slug} (${tenant.id}) — locales ${tenant.supportedLocales.join(", ")}, ${tenant.defaultCurrency}, ${tenant.defaultWastagePct.toString()}% wastage`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
