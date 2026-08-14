import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { BRAND_NAME } from "./import-data";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    // Absent is fine.
  }
}

/**
 * Real collections for the client's 12 products, and their assignments.
 *
 * ── Why grouped by surface look, not by manufacturer family ──
 * docs/03 §3.2 calls a collection "a manufacturer's product family (e.g.
 * 'Calacatta Series')". Taken strictly, these 12 products — sourced from
 * mixed Spanish suppliers — form about ten families, most of them a single
 * product. Only "Crotone" is genuinely a two-product family (Sand and Pearl
 * Matte); "Antid." is a prefix (antideslizante, anti-slip), not a family.
 *
 * Ten collections of one is not something a customer can browse. Grouping by
 * surface look matches how docs/02 §3.1's filter rail expects people to shop
 * (LOOK is a primary facet) and, in this catalogue, aligns almost exactly
 * with format. Recorded so the next person does not "fix" this back into
 * supplier families.
 *
 * ── Why Bali Plus is alone ──
 * It is the only 20mm, the only outdoor-rated, the only R12, the only
 * one-piece-per-box product. Filing a structural outdoor paver under indoor
 * floor tiles is the kind of thing a contractor reads as a spec claim. A
 * collection of one is thin; a misleading collection of five is worse.
 *
 * ── Why this does NOT go through the use-case layer ──
 * Same as `import-products.ts`: a CLI process has no staff session, so
 * `adminMutation` cannot run. **No audit rows are produced.** Acceptable for
 * a one-off backfill by the owner; not a pattern for ordinary editing.
 *
 * Idempotent. Keyed on slug; re-running updates rather than duplicating.
 */

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
  },
});

interface CollectionSpec {
  readonly slug: string;
  readonly en: { name: string; description: string };
  readonly ar: { name: string; description: string };
  readonly sortOrder: number;
  /** SKUs assigned to this collection. Every one of the 12 appears exactly once. */
  readonly skus: readonly string[];
  /** SKU whose primary photo becomes the hero — chosen as the highest-resolution image in the group. */
  readonly heroFromSku: string;
}

const COLLECTIONS: readonly CollectionSpec[] = [
  {
    slug: "concrete",
    en: {
      name: "Concrete",
      description:
        "Large-format porcelain with a soft concrete texture, in warm neutrals. Matte throughout, for floors and walls alike.",
    },
    ar: {
      name: "خرسانة",
      description:
        "بلاط بورسلين بمقاس كبير بملمس خرساني ناعم، بألوان محايدة دافئة. لمسة نهائية مطفية، للأرضيات والجدران معاً.",
    },
    sortOrder: 0,
    skus: [
      "AC-ALIBEIMAT-0612",
      "AC-ALYCREMAT-0612",
      "AC-CEFPERMAT-0612",
      "AC-CROPEAMAT-0612",
      "AC-CROSAN-0612",
    ],
    heroFromSku: "AC-ALIBEIMAT-0612", // 1280×960, the largest in this group
  },
  {
    slug: "marble",
    en: {
      name: "Marble",
      description:
        "The veining and depth of natural marble in large-format porcelain, without the maintenance a natural slab demands.",
    },
    ar: {
      name: "رخام",
      description:
        "عروق وعمق الرخام الطبيعي على بلاط بورسلين بمقاس كبير، دون الصيانة التي يتطلبها الرخام الأصلي.",
    },
    sortOrder: 1,
    skus: ["AC-BELNAT-0612", "AC-CLEWHI-0612"],
    heroFromSku: "AC-CLEWHI-0612", // 735×725
  },
  {
    slug: "stone",
    en: {
      name: "Stone",
      description:
        "Natural stone looks in matte porcelain, mostly in the square 100×100 format. Understated surfaces that sit quietly under other materials.",
    },
    ar: {
      name: "حجر",
      description:
        "مظهر الحجر الطبيعي على بورسلين مطفي، غالباً بمقاس مربع 100×100. أسطح هادئة تنسجم مع باقي المواد.",
    },
    sortOrder: 2,
    skus: [
      "AC-ANHBON-0612",
      "AC-ANTAREBEIMAT-1010",
      "AC-ANTDELBONMAT-1010",
      "AC-CHRMIN-1010",
    ],
    heroFromSku: "AC-ANTDELBONMAT-1010", // 1200×1200, the largest overall
  },
  {
    slug: "outdoor-2cm",
    en: {
      name: "Outdoor 2cm",
      description:
        "20mm-thick porcelain rated for exterior use — terraces, patios and paths. Heavier gauge and an outdoor-grade slip rating.",
    },
    ar: {
      name: "خارجي 2 سم",
      description:
        "بلاط بورسلين بسماكة 20 ملم مخصص للاستخدام الخارجي — التراسات والباحات والممرات. سماكة أكبر وتصنيف مقاومة انزلاق خارجي.",
    },
    sortOrder: 3,
    skus: ["AC-BALPLUASHCM-1010"],
    heroFromSku: "AC-BALPLUASHCM-1010",
  },
];

/** Refuse to run on a spec that would leave a product unassigned or double-assigned. */
function assertCoversEveryProductOnce(actualSkus: readonly string[]): void {
  const assigned = COLLECTIONS.flatMap((c) => c.skus);
  const duplicates = assigned.filter((s, i) => assigned.indexOf(s) !== i);
  const missing = actualSkus.filter((s) => !assigned.includes(s));
  const unknown = assigned.filter((s) => !actualSkus.includes(s));

  const problems = [
    ...duplicates.map((s) => `${s} is assigned to more than one collection`),
    ...missing.map((s) => `${s} exists but is assigned to no collection`),
    ...unknown.map((s) => `${s} is assigned but does not exist`),
  ];

  if (problems.length > 0) {
    console.error(
      `\n  NOT RUNNING — ${String(problems.length)} assignment problem(s):\n` +
        problems.map((p) => `    ${p}`).join("\n") +
        "\n",
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findFirst({
    where: { status: "active" },
    select: { id: true },
  });
  if (!tenant) throw new Error("no active tenant — run `pnpm db:seed`");
  const tenantId = tenant.id;

  const products = await prisma.product.findMany({
    where: { tenantId, deletedAt: null, brand: { name: BRAND_NAME } },
    select: { id: true, sku: true, primaryMediaId: true },
  });
  assertCoversEveryProductOnce(products.map((p) => p.sku));

  const bySku = new Map(products.map((p) => [p.sku, p]));

  for (const spec of COLLECTIONS) {
    const existing = await prisma.collection.findFirst({
      where: { tenantId, slug: spec.slug },
      select: { id: true },
    });

    const hero = bySku.get(spec.heroFromSku)?.primaryMediaId ?? null;

    const collection = existing
      ? await prisma.collection.update({
          where: { id: existing.id },
          data: {
            heroMediaId: hero,
            sortOrder: spec.sortOrder,
            status: "published",
            publishedAt: new Date(),
          },
          select: { id: true },
        })
      : await prisma.collection.create({
          data: {
            tenantId,
            slug: spec.slug,
            heroMediaId: hero,
            sortOrder: spec.sortOrder,
            status: "published",
            publishedAt: new Date(),
          },
          select: { id: true },
        });

    for (const [locale, copy] of [
      ["en", spec.en],
      ["ar", spec.ar],
    ] as const) {
      await prisma.collectionTranslation.upsert({
        where: {
          collectionId_locale: { collectionId: collection.id, locale },
        },
        create: {
          collectionId: collection.id,
          locale,
          name: copy.name,
          description: copy.description,
        },
        update: { name: copy.name, description: copy.description },
      });
    }

    const { count } = await prisma.product.updateMany({
      where: { tenantId, sku: { in: [...spec.skus] } },
      data: { collectionId: collection.id },
    });

    console.log(
      `  ${existing ? "updated" : "created"}  ${spec.slug.padEnd(12)} ` +
        `${String(count)} product(s), hero ${hero ? "set" : "MISSING"}`,
    );
  }

  console.log("");
}

main()
  .catch((cause: unknown) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
