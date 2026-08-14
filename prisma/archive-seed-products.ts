import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { BRAND_NAME as REAL_BRAND_NAME } from "./import-data";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    // Absent is fine.
  }
}

/**
 * One-off: archive the 40 placeholder seed products now that the 12 real
 * ones exist and have been reviewed in the admin UI.
 *
 * ── Archive, never delete ──
 * `archived` is a reachable, reversible status (`STATUS_TRANSITIONS` in
 * `src/domain/admin/product.ts` allows `archived -> draft` and
 * `archived -> published`). This script performs no deletion.
 *
 * ── Discontinued is left alone, on purpose ──
 * `discontinued` has no outgoing transitions in `STATUS_TRANSITIONS` —
 * "a product that came back is a new SKU commercially, and reviving the old
 * row loses that." One seeded Porcelanosa row is already `discontinued`.
 * This script honours that terminal state rather than overriding it with
 * raw SQL; it is skipped and reported, not archived.
 *
 * ── Why this does NOT go through the use-case layer ──
 * `setProductStatus` is wrapped in `adminMutation("product.publish")`, which
 * resolves a staff session. A CLI process has no session — same reason
 * `import-products.ts` writes through Prisma directly. Same cost, stated
 * the same way: **these status changes produce no audit rows.**
 *
 * ── Scoped by brand, verified before running ──
 * Every seed product belongs to one of the four demo brands (Marazzi,
 * Porcelanosa, Atlas Concorde, Iris Ceramica). The 12 real products all
 * belong to "Amin Ceramic Tiles". Confirmed via direct SQL before writing
 * this script: 12 + 12 + 8 + 8 = 40, matching the expected seed count
 * exactly, with zero already archived.
 */

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
  },
});

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findFirst({
    where: { status: "active" },
    select: { id: true },
  });
  if (!tenant) throw new Error("no active tenant — run `pnpm db:seed`");
  const tenantId = tenant.id;

  const seedProducts = await prisma.product.findMany({
    where: {
      tenantId,
      deletedAt: null,
      brand: { name: { not: REAL_BRAND_NAME } },
    },
    select: {
      id: true,
      sku: true,
      status: true,
      brand: { select: { name: true } },
    },
    orderBy: { sku: "asc" },
  });

  const archivable = seedProducts.filter(
    (p) => p.status !== "archived" && p.status !== "discontinued",
  );
  const alreadyArchived = seedProducts.filter((p) => p.status === "archived");
  const terminal = seedProducts.filter((p) => p.status === "discontinued");

  console.log(`  found ${String(seedProducts.length)} seed products`);
  console.log(`  archivable now: ${String(archivable.length)}`);
  if (alreadyArchived.length > 0) {
    console.log(`  already archived: ${String(alreadyArchived.length)}`);
  }
  if (terminal.length > 0) {
    console.log(
      `  skipped (discontinued is terminal by design):\n` +
        terminal.map((p) => `    ${p.sku} (${p.brand.name})`).join("\n"),
    );
  }

  if (archivable.length === 0) {
    console.log("\n  nothing to archive.\n");
    return;
  }

  const { count } = await prisma.product.updateMany({
    where: { id: { in: archivable.map((p) => p.id) }, tenantId },
    data: { status: "archived", updatedAt: new Date() },
  });

  console.log(
    `\n  ${String(count)} archived. Reversible: an owner can move any of` +
      ` them back to draft or published from /admin/products.\n`,
  );
}

main()
  .catch((cause: unknown) => {
    console.error(cause);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
