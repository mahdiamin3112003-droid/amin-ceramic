import path from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  BRAND_NAME,
  CATEGORY_SLUG,
  MATERIAL_KEY,
  NEW_COLOR_FAMILIES,
  ORIGIN_COUNTRY,
  PRODUCTS,
} from "./import-data";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    // Absent is fine.
  }
}

/**
 * One-off importer for the client's real catalogue, until Phase 8 exists.
 *
 * ── Why this does NOT go through the use-case layer ──
 * `createProduct` is wrapped in `adminMutation("product.create")`, which
 * resolves a staff session and stamps RLS claims. A CLI process has no
 * session, so it cannot call it — the same reason `seed.ts` and
 * `bootstrap-owner.ts` write through Prisma directly.
 *
 * The cost is real and worth naming: **these writes produce no audit rows.**
 * Products created here will not appear in `/admin/audit`, unlike ones typed
 * into the form. Acceptable for a one-off backfill run by the owner; not a
 * pattern to reuse for ordinary editing.
 *
 * ── Idempotent ──
 * Keyed on SKU. Re-running updates rather than duplicating, so a partial run
 * can be finished by running it again.
 */

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
  },
});

/**
 * Values that look like a stand-in for "I don't know yet".
 *
 * A missing value must be NULL, never text. "unknown" survives the import,
 * passes every validation, and then renders on the live site as
 * `Brand: unknown` — which reads as broken rather than as incomplete.
 */
const PLACEHOLDERS = new Set([
  "",
  "-",
  "--",
  "todo",
  "tbd",
  "tba",
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "?",
  "xxx",
]);

function isPlaceholder(value: string): boolean {
  return PLACEHOLDERS.has(value.trim().toLowerCase());
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * `Alissa Beige Matte`, 600×1200 → `AC-ALISBEIMAT-0612`
 *
 * Takes letters from EVERY word, not the first six of the whole string.
 * The first version did the latter and produced `AC-CROTON-0612` for both
 * "Crotone Sand" and "Crotone Pearl Matte" — the second silently overwrote
 * the first, and the run reported "11 created, 1 updated" for 12 inputs.
 * Any two products sharing a first word and a format would have collided.
 */
function makeSku(name: string, widthMm: number, heightMm: number): string {
  const stem = name
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .map((word) => word.toUpperCase().slice(0, 3))
    .join("")
    .slice(0, 12)
    .padEnd(6, "X");
  const w = Math.round(widthMm / 100).toString().padStart(2, "0");
  const h = Math.round(heightMm / 100).toString().padStart(2, "0");
  return `AC-${stem}-${w}${h}`;
}

/**
 * Refuse to run if two products would share a SKU.
 *
 * The generator is a heuristic and heuristics collide. Catching it here is
 * the difference between a failed run and a silently lost product — the
 * per-product upsert cannot tell "same product, re-run" from "different
 * product, same generated key".
 */
function assertNoSkuCollisions(): void {
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const p of PRODUCTS) {
    const sku = makeSku(p.name, p.widthMm, p.heightMm);
    const first = seen.get(sku);
    if (first) clashes.push(`${sku}: "${first}" and "${p.name}"`);
    else seen.set(sku, p.name);
  }
  if (clashes.length > 0) {
    console.error(
      `\n  NOT IMPORTING — ${String(clashes.length)} SKU collision(s):\n` +
        clashes.map((c) => `    ${c}`).join("\n") +
        `\n\n  Two products cannot share a SKU; one would overwrite the other.\n`,
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  for (const [label, value] of [
    ["BRAND_NAME", BRAND_NAME],
    ["MATERIAL_KEY", MATERIAL_KEY],
    ["CATEGORY_SLUG", CATEGORY_SLUG],
    ["ORIGIN_COUNTRY", ORIGIN_COUNTRY],
  ] as const) {
    if (isPlaceholder(value)) {
      console.error(`\n  NOT IMPORTING — ${label} is a placeholder.\n`);
      process.exit(1);
    }
  }

  assertNoSkuCollisions();

  const tenant = await prisma.tenant.findFirst({
    where: { status: "active" },
    select: { id: true },
  });
  if (!tenant) throw new Error("no active tenant — run `pnpm db:seed`");
  const tenantId = tenant.id;

  // ── Colour families the client actually uses ──────────────────────────
  for (const family of NEW_COLOR_FAMILIES) {
    const existing = await prisma.colorFamily.findFirst({
      where: { tenantId, key: family.key },
      select: { id: true },
    });
    if (existing) continue;
    const created = await prisma.colorFamily.create({
      data: { tenantId, key: family.key },
      select: { id: true },
    });
    await prisma.colorFamilyTranslation.create({
      data: { colorFamilyId: created.id, locale: "en", name: family.name },
    });
    await prisma.colorFamilyTranslation.create({
      data: { colorFamilyId: created.id, locale: "ar", name: family.name },
    });
    console.log(`  colour family created: ${family.key}`);
  }

  // ── Shared references ─────────────────────────────────────────────────
  const [material, category] = await Promise.all([
    prisma.material.findFirst({ where: { tenantId, key: MATERIAL_KEY } }),
    prisma.category.findFirst({ where: { tenantId, slug: CATEGORY_SLUG } }),
  ]);
  if (!material) throw new Error(`material "${MATERIAL_KEY}" is not seeded`);
  if (!category) throw new Error(`category "${CATEGORY_SLUG}" is not seeded`);

  let brand = await prisma.brand.findFirst({
    where: { tenantId, name: BRAND_NAME, deletedAt: null },
    select: { id: true },
  });
  brand ??= await prisma.brand.create({
    data: {
      tenantId,
      name: BRAND_NAME,
      slug: slugify(BRAND_NAME),
      originCountry: ORIGIN_COUNTRY,
    },
    select: { id: true },
  });

  const applications = await prisma.application.findMany({
    where: { tenantId },
    select: { id: true, key: true },
  });
  const applicationId = new Map(applications.map((a) => [a.key, a.id]));

  let created = 0;
  let updated = 0;

  for (const p of PRODUCTS) {
    const [finish, look, colour] = await Promise.all([
      prisma.finish.findFirst({ where: { tenantId, key: p.finish } }),
      prisma.surfaceLook.findFirst({ where: { tenantId, key: p.surfaceLook } }),
      prisma.colorFamily.findFirst({ where: { tenantId, key: p.colorFamily } }),
    ]);
    if (!finish || !look || !colour) {
      throw new Error(`taxonomy missing for ${p.name}`);
    }

    const appIds = p.applications.map((key) => {
      const id = applicationId.get(key);
      if (!id) throw new Error(`application "${key}" is not seeded`);
      return id;
    });

    const sku = makeSku(p.name, p.widthMm, p.heightMm);
    const existing = await prisma.product.findFirst({
      where: { tenantId, sku },
      select: { id: true },
    });

    const values = {
      tenantId,
      sku,
      brandId: brand.id,
      categoryId: category.id,
      materialId: material.id,
      finishId: finish.id,
      surfaceLookId: look.id,
      colorFamilyId: colour.id,
      applicationIds: appIds,
      widthMm: p.widthMm,
      heightMm: p.heightMm,
      thicknessMm: p.thicknessMm,
      nominalFormat: `${String(p.widthMm)}×${String(p.heightMm)}`,
      piecesPerBox: p.piecesPerBox,
      m2PerBox: p.m2PerBox,
      kgPerBox: p.kgPerBox,
      originCountry: ORIGIN_COUNTRY,
      isIndoor: p.isIndoor,
      isOutdoor: p.isOutdoor,
      slipRating: p.slipRating, // genuinely null — never a placeholder string
      basePrice: null,
      currency: "USD",
      // No numeric price is shown anywhere; the site renders "Price on request".
      priceVisibility: "on_request" as const,
      status: "draft" as const,
    };

    const product = existing
      ? await prisma.product.update({
          where: { id: existing.id },
          data: values,
          select: { id: true },
        })
      : await prisma.product.create({ data: values, select: { id: true } });

    if (existing) updated += 1;
    else created += 1;

    for (const locale of ["en", "ar"]) {
      await prisma.productTranslation.upsert({
        where: { productId_locale: { productId: product.id, locale } },
        create: {
          tenantId,
          productId: product.id,
          locale,
          name: p.name,
          slug: slugify(p.name),
        },
        update: { name: p.name, slug: slugify(p.name) },
      });
    }

    /**
     * ONE roll-up row, `locationId: null`.
     *
     * The figure is the tenant-wide total; the Rmeileh/Choukine split is
     * unconfirmed. Writing it to one warehouse would claim stock sits
     * somewhere it may not, and duplicating it to both would double the
     * company's apparent inventory. A null location is exactly the
     * "not yet allocated" state the schema provides for this.
     */
    const rollUp = await prisma.productStock.findFirst({
      where: { tenantId, productId: product.id, locationId: null },
      select: { id: true },
    });
    const stock = {
      tenantId,
      productId: product.id,
      locationId: null,
      availableM2: p.stockM2,
      stockStatus: p.stockM2 > 0 ? ("in_stock" as const) : ("out_of_stock" as const),
    };
    if (rollUp) {
      await prisma.productStock.update({ where: { id: rollUp.id }, data: stock });
    } else {
      await prisma.productStock.create({ data: stock });
    }

    console.log(`  ${existing ? "updated" : "created"}  ${sku.padEnd(16)} ${p.name}`);
  }

  console.log(
    `\n  ${String(created)} created, ${String(updated)} updated — all DRAFTS.` +
      `\n  Review at /admin/products.\n`,
  );
}

main()
  .catch((cause: unknown) => {
    console.error(cause);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
