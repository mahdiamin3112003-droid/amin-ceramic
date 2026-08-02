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
 * Seed.
 *
 * Phase 0 seeded identity's core three tables. Phase 1 adds the role/permission
 * matrix and the ~40-product catalog (docs/01-architecture.md §10).
 *
 * Idempotent throughout — every block is an upsert on a natural key, so
 * re-running against a populated database is safe. That matters more than it
 * sounds: a seed that can only run once is a seed nobody dares run, and it rots.
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

  await seedRolesAndPermissions(tenant.id);
  await seedLocations(tenant.id);
  const taxonomy = await seedTaxonomy(tenant.id);
  await seedProducts(tenant.id, taxonomy);
}

/**
 * Locations — the two real, currently-active showrooms confirmed for this
 * seed (not placeholder, unlike the product catalog below). Both sell stock.
 */
const LOCATIONS = [
  {
    slug: "rmeileh",
    name: "Amin Ceramic — Rmeileh",
    city: "Rmeileh",
    region: "Mount Lebanon",
    countryCode: "LB",
  },
  {
    slug: "choukine",
    name: "Amin Ceramic — Choukine",
    city: "Choukine",
    region: "South Lebanon",
    countryCode: "LB",
  },
] as const;

/**
 * `slug` uniqueness on brand/collection/category/location/product is a
 * hand-authored partial SQL index (`WHERE deleted_at IS NULL`), not a Prisma
 * `@@unique` — Prisma can't express partial indexes, so there is no
 * generated compound-unique key for `upsert()` to target. find-then-create/
 * update stands in for upsert wherever this applies below.
 */
async function seedLocations(tenantId: string) {
  for (const loc of LOCATIONS) {
    const existing = await prisma.location.findFirst({
      where: { tenantId, slug: loc.slug },
    });
    if (existing) {
      await prisma.location.update({
        where: { id: existing.id },
        data: { name: loc.name, city: loc.city, region: loc.region },
      });
    } else {
      await prisma.location.create({
        data: {
          tenantId,
          slug: loc.slug,
          name: loc.name,
          locationType: "showroom",
          holdsSellableStock: true,
          isPublic: true,
          city: loc.city,
          region: loc.region,
          countryCode: loc.countryCode,
          isActive: true,
        },
      });
    }
  }
  console.log(`seeded ${String(LOCATIONS.length)} locations (Rmeileh, Choukine)`);
}

/**
 * Taxonomy: brands, one collection, a small category tree, and the six
 * lookup-table vocabularies (§3.4). Placeholder content drawn from the UX
 * blueprint's own named examples (Calacatta Oro, Statuario, brands Marazzi/
 * Porcelanosa/Atlas Concorde/Iris Ceramica), per the confirmed seed-data
 * decision — clearly not real Amin Ceramic inventory.
 *
 * Category names: docs/03-database-design.md §3.1 gives `category` no name
 * column and no category_translation table (checked — genuinely absent, not
 * an oversight in this seed). Flagging per CLAUDE.md rule 5 rather than
 * inventing a schema change this late in Phase 1: categories are seeded with
 * descriptive slugs only; display names likely belong in i18n message files
 * for a taxonomy this small and fixed, revisit if that's wrong.
 */

const BRANDS = [
  { slug: "marazzi", name: "Marazzi", originCountry: "IT" },
  { slug: "porcelanosa", name: "Porcelanosa", originCountry: "ES" },
  { slug: "atlas-concorde", name: "Atlas Concorde", originCountry: "IT" },
  { slug: "iris-ceramica", name: "Iris Ceramica", originCountry: "IT" },
] as const;

const MATERIALS = [
  { key: "porcelain", en: "Porcelain", ar: "بورسلين" },
  { key: "ceramic", en: "Ceramic", ar: "سيراميك" },
] as const;

const FINISHES = [
  { key: "matte", en: "Matte", ar: "مطفي" },
  { key: "polished", en: "Polished", ar: "لامع" },
  { key: "textured", en: "Textured", ar: "محبب" },
  { key: "satin", en: "Satin", ar: "ساتان" },
] as const;

const SURFACE_LOOKS = [
  { key: "marble", en: "Marble", ar: "رخام" },
  { key: "stone", en: "Stone", ar: "حجر" },
  { key: "wood", en: "Wood", ar: "خشب" },
  { key: "concrete", en: "Concrete", ar: "إسمنت" },
  { key: "solid_color", en: "Solid Colour", ar: "لون موحد" },
] as const;

const COLOR_FAMILIES = [
  { key: "white", en: "White", ar: "أبيض", colorHex: "#F5F3EF" },
  { key: "beige", en: "Beige", ar: "بيج", colorHex: "#D9C7A8" },
  { key: "grey", en: "Grey", ar: "رمادي", colorHex: "#9A9A93" },
  { key: "black", en: "Black", ar: "أسود", colorHex: "#2A2A28" },
  { key: "brown", en: "Brown", ar: "بني", colorHex: "#6B4C33" },
] as const;

const APPLICATIONS = [
  { key: "floor", en: "Floor", ar: "أرضية" },
  { key: "wall", en: "Wall", ar: "حائط" },
  { key: "outdoor", en: "Outdoor", ar: "خارجي" },
  { key: "bathroom", en: "Bathroom", ar: "حمام" },
  { key: "kitchen", en: "Kitchen", ar: "مطبخ" },
] as const;

/** Wastage defaults per docs/02-ux-blueprint.md §8.2 item 11. */
const LAYOUT_PATTERNS = [
  { key: "grid", en: "Grid", ar: "شبكة", wastagePct: 7 },
  { key: "brick", en: "Brick", ar: "طوب", wastagePct: 10 },
  { key: "diagonal", en: "Diagonal", ar: "قطري", wastagePct: 12 },
  { key: "herringbone", en: "Herringbone", ar: "سنبلة", wastagePct: 15 },
  { key: "large_format", en: "Large format", ar: "قياس كبير", wastagePct: 5 },
] as const;

const PRICE_TIERS = [
  { key: "public", name: "Public", discountPct: 0, isDefault: true },
  { key: "trade_1", name: "Trade 1", discountPct: 10, isDefault: false },
  { key: "trade_2", name: "Trade 2", discountPct: 15, isDefault: false },
  { key: "trade_3", name: "Trade 3", discountPct: 20, isDefault: false },
] as const;

interface Taxonomy {
  brandIds: Record<(typeof BRANDS)[number]["slug"], string>;
  collectionId: string;
  categoryIds: { floorIndoor: string; floorOutdoor: string };
  materialIds: Record<(typeof MATERIALS)[number]["key"], string>;
  finishIds: Record<(typeof FINISHES)[number]["key"], string>;
  surfaceLookIds: Record<(typeof SURFACE_LOOKS)[number]["key"], string>;
  colorFamilyIds: Record<(typeof COLOR_FAMILIES)[number]["key"], string>;
  priceTierIds: Record<(typeof PRICE_TIERS)[number]["key"], string>;
}

async function seedTaxonomy(tenantId: string): Promise<Taxonomy> {
  const brandIds = {} as Taxonomy["brandIds"];
  for (const b of BRANDS) {
    const existingBrand = await prisma.brand.findFirst({
      where: { tenantId, slug: b.slug },
    });
    const row = existingBrand
      ? await prisma.brand.update({
          where: { id: existingBrand.id },
          data: { name: b.name, originCountry: b.originCountry },
        })
      : await prisma.brand.create({
          data: {
            tenantId,
            slug: b.slug,
            name: b.name,
            originCountry: b.originCountry,
          },
        });
    brandIds[b.slug] = row.id;
  }

  const existingCollection = await prisma.collection.findFirst({
    where: { tenantId, slug: "calacatta-series" },
  });
  const collection =
    existingCollection ??
    (await prisma.collection.create({
      data: {
        tenantId,
        brandId: brandIds.marazzi,
        slug: "calacatta-series",
        status: "published",
        publishedAt: new Date(),
      },
    }));
  await prisma.collectionTranslation.upsert({
    where: { collectionId_locale: { collectionId: collection.id, locale: "en" } },
    update: {},
    create: {
      collectionId: collection.id,
      locale: "en",
      name: "Calacatta Series",
      description:
        "Marble-look porcelain in the Calacatta family of veining patterns.",
    },
  });
  await prisma.collectionTranslation.upsert({
    where: { collectionId_locale: { collectionId: collection.id, locale: "ar" } },
    update: {},
    create: {
      collectionId: collection.id,
      locale: "ar",
      name: "مجموعة كالاكاتا",
      description: "بورسلين بمظهر الرخام من عائلة كالاكاتا.",
    },
  });

  async function findOrCreateCategory(
    slug: string,
    parentId: string | null,
    depth: number,
  ) {
    const existing = await prisma.category.findFirst({ where: { tenantId, slug } });
    return (
      existing ??
      prisma.category.create({ data: { tenantId, slug, parentId, depth } })
    );
  }

  const floor = await findOrCreateCategory("floor", null, 0);
  const floorIndoor = await findOrCreateCategory("floor-indoor", floor.id, 1);
  const floorOutdoor = await findOrCreateCategory("floor-outdoor", floor.id, 1);

  const materialIds = {} as Taxonomy["materialIds"];
  for (const m of MATERIALS) {
    const row = await prisma.material.upsert({
      where: { tenantId_key: { tenantId, key: m.key } },
      update: {},
      create: { tenantId, key: m.key },
    });
    materialIds[m.key] = row.id;
    for (const [locale, name] of [
      ["en", m.en],
      ["ar", m.ar],
    ] as const) {
      await prisma.materialTranslation.upsert({
        where: { materialId_locale: { materialId: row.id, locale } },
        update: { name },
        create: { materialId: row.id, locale, name },
      });
    }
  }

  const finishIds = {} as Taxonomy["finishIds"];
  for (const f of FINISHES) {
    const row = await prisma.finish.upsert({
      where: { tenantId_key: { tenantId, key: f.key } },
      update: {},
      create: { tenantId, key: f.key },
    });
    finishIds[f.key] = row.id;
    for (const [locale, name] of [
      ["en", f.en],
      ["ar", f.ar],
    ] as const) {
      await prisma.finishTranslation.upsert({
        where: { finishId_locale: { finishId: row.id, locale } },
        update: { name },
        create: { finishId: row.id, locale, name },
      });
    }
  }

  const surfaceLookIds = {} as Taxonomy["surfaceLookIds"];
  for (const s of SURFACE_LOOKS) {
    const row = await prisma.surfaceLook.upsert({
      where: { tenantId_key: { tenantId, key: s.key } },
      update: {},
      create: { tenantId, key: s.key },
    });
    surfaceLookIds[s.key] = row.id;
    for (const [locale, name] of [
      ["en", s.en],
      ["ar", s.ar],
    ] as const) {
      await prisma.surfaceLookTranslation.upsert({
        where: { surfaceLookId_locale: { surfaceLookId: row.id, locale } },
        update: { name },
        create: { surfaceLookId: row.id, locale, name },
      });
    }
  }

  const colorFamilyIds = {} as Taxonomy["colorFamilyIds"];
  for (const c of COLOR_FAMILIES) {
    const row = await prisma.colorFamily.upsert({
      where: { tenantId_key: { tenantId, key: c.key } },
      update: { colorHex: c.colorHex },
      create: { tenantId, key: c.key, colorHex: c.colorHex },
    });
    colorFamilyIds[c.key] = row.id;
    for (const [locale, name] of [
      ["en", c.en],
      ["ar", c.ar],
    ] as const) {
      await prisma.colorFamilyTranslation.upsert({
        where: { colorFamilyId_locale: { colorFamilyId: row.id, locale } },
        update: { name },
        create: { colorFamilyId: row.id, locale, name },
      });
    }
  }

  for (const a of APPLICATIONS) {
    const row = await prisma.application.upsert({
      where: { tenantId_key: { tenantId, key: a.key } },
      update: {},
      create: { tenantId, key: a.key },
    });
    for (const [locale, name] of [
      ["en", a.en],
      ["ar", a.ar],
    ] as const) {
      await prisma.applicationTranslation.upsert({
        where: { applicationId_locale: { applicationId: row.id, locale } },
        update: { name },
        create: { applicationId: row.id, locale, name },
      });
    }
  }

  for (const l of LAYOUT_PATTERNS) {
    const row = await prisma.layoutPattern.upsert({
      where: { tenantId_key: { tenantId, key: l.key } },
      update: { defaultWastagePct: l.wastagePct },
      create: { tenantId, key: l.key, defaultWastagePct: l.wastagePct },
    });
    for (const [locale, name] of [
      ["en", l.en],
      ["ar", l.ar],
    ] as const) {
      await prisma.layoutPatternTranslation.upsert({
        where: { layoutPatternId_locale: { layoutPatternId: row.id, locale } },
        update: { name },
        create: { layoutPatternId: row.id, locale, name },
      });
    }
  }

  const priceTierIds = {} as Taxonomy["priceTierIds"];
  for (const t of PRICE_TIERS) {
    const row = await prisma.priceTier.upsert({
      where: { tenantId_key: { tenantId, key: t.key } },
      update: { discountPct: t.discountPct, isDefault: t.isDefault },
      create: {
        tenantId,
        key: t.key,
        name: t.name,
        discountPct: t.discountPct,
        isDefault: t.isDefault,
      },
    });
    priceTierIds[t.key] = row.id;
  }

  console.log(
    `seeded taxonomy: ${String(BRANDS.length)} brands, 1 collection, 3 categories, ${String(MATERIALS.length + FINISHES.length + SURFACE_LOOKS.length + COLOR_FAMILIES.length + APPLICATIONS.length + LAYOUT_PATTERNS.length)} lookup rows, ${String(PRICE_TIERS.length)} price tiers`,
  );

  return {
    brandIds,
    collectionId: collection.id,
    categoryIds: { floorIndoor: floorIndoor.id, floorOutdoor: floorOutdoor.id },
    materialIds,
    finishIds,
    surfaceLookIds,
    colorFamilyIds,
    priceTierIds,
  };
}

/**
 * ~40 products: 10 designs × 4 format/finish variants, the realistic shape
 * of a tile catalog (the same design sold in several sizes and finishes)
 * rather than 40 unrelated SKUs. Placeholder content per the confirmed seed
 * decision, drawn from the UX blueprint's own named examples where given
 * (Calacatta Oro AC-6012-MT, Onice Bianco, Travertino, Statuario) and
 * extended with clearly-placeholder siblings to reach the ~40 target.
 */

const DESIGNS = [
  {
    key: "calacatta-oro",
    nameEn: "Calacatta Oro",
    nameAr: "كالاكاتا أورو",
    brand: "marazzi",
    collection: true,
    surfaceLook: "marble",
    colorFamily: "white",
    colorHex: "#F2EDE3",
  },
  {
    key: "statuario",
    nameEn: "Statuario",
    nameAr: "ستاتواريو",
    brand: "marazzi",
    collection: true,
    surfaceLook: "marble",
    colorFamily: "white",
    colorHex: "#F5F2EC",
  },
  {
    key: "onice-bianco",
    nameEn: "Onice Bianco",
    nameAr: "أونيكس أبيض",
    brand: "porcelanosa",
    collection: false,
    surfaceLook: "stone",
    colorFamily: "white",
    colorHex: "#EFEDE6",
  },
  {
    key: "travertino-beige",
    nameEn: "Travertino Beige",
    nameAr: "ترافرتينو بيج",
    brand: "atlas-concorde",
    collection: false,
    surfaceLook: "stone",
    colorFamily: "beige",
    colorHex: "#D6C4A1",
  },
  {
    key: "grigio-concrete",
    nameEn: "Grigio Concrete",
    nameAr: "غريجيو إسمنت",
    brand: "iris-ceramica",
    collection: false,
    surfaceLook: "concrete",
    colorFamily: "grey",
    colorHex: "#A6A69E",
  },
  {
    key: "noir-marquina",
    nameEn: "Noir Marquina",
    nameAr: "نوار ماركينا",
    brand: "marazzi",
    collection: false,
    surfaceLook: "marble",
    colorFamily: "black",
    colorHex: "#232320",
  },
  {
    key: "rovere-naturale",
    nameEn: "Rovere Naturale",
    nameAr: "روفيري طبيعي",
    brand: "porcelanosa",
    collection: false,
    surfaceLook: "wood",
    colorFamily: "brown",
    colorHex: "#8A6544",
  },
  {
    key: "sabbia-uni",
    nameEn: "Sabbia Uni",
    nameAr: "صابيا يوني",
    brand: "atlas-concorde",
    collection: false,
    surfaceLook: "solid_color",
    colorFamily: "beige",
    colorHex: "#DDCBAE",
  },
  {
    key: "basalto-grigio",
    nameEn: "Basalto Grigio",
    nameAr: "بازلتو غريجيو",
    brand: "iris-ceramica",
    collection: false,
    surfaceLook: "stone",
    colorFamily: "grey",
    colorHex: "#87877E",
  },
  {
    key: "crema-marfil",
    nameEn: "Crema Marfil",
    nameAr: "كريما مارفيل",
    brand: "porcelanosa",
    collection: false,
    surfaceLook: "marble",
    colorFamily: "beige",
    colorHex: "#E4D6BC",
  },
] as const;

const FORMATS = [
  { widthMm: 600, heightMm: 600, finish: "matte", isOutdoor: false },
  { widthMm: 600, heightMm: 1200, finish: "polished", isOutdoor: false },
  { widthMm: 300, heightMm: 600, finish: "satin", isOutdoor: false },
  { widthMm: 600, heightMm: 600, finish: "textured", isOutdoor: true },
] as const;

async function seedProducts(tenantId: string, tax: Taxonomy) {
  let count = 0;

  for (const design of DESIGNS) {
    for (const format of FORMATS) {
      const sku = `${design.key.toUpperCase()}-${String(format.widthMm)}X${String(format.heightMm)}-${format.finish.toUpperCase()}`;
      const slugEn = `${design.key}-${String(format.widthMm)}x${String(format.heightMm)}-${format.finish}`;
      const m2PerBox =
        format.widthMm === 300
          ? 1.08
          : format.widthMm === 600 && format.heightMm === 1200
            ? 1.44
            : 1.44;
      const piecesPerBox =
        format.widthMm === 300
          ? 6
          : format.widthMm === 600 && format.heightMm === 1200
            ? 2
            : 4;
      const kgPerBox = Math.round(m2PerBox * 21 * 10) / 10;
      const basePrice = 18 + Math.round(Math.random() * 22);

      const existingProduct = await prisma.product.findFirst({
        where: { tenantId, sku },
      });
      const product =
        existingProduct ??
        (await prisma.product.create({
          data: {
            tenantId,
            sku,
            brandId: tax.brandIds[design.brand],
            collectionId: design.collection ? tax.collectionId : null,
            categoryId: format.isOutdoor
              ? tax.categoryIds.floorOutdoor
              : tax.categoryIds.floorIndoor,
            widthMm: format.widthMm,
            heightMm: format.heightMm,
            thicknessMm: 10,
            nominalFormat: `${String(format.widthMm)}×${String(format.heightMm)}`,
            materialId: tax.materialIds.porcelain,
            finishId: tax.finishIds[format.finish],
            surfaceLookId: tax.surfaceLookIds[design.surfaceLook],
            colorFamilyId: tax.colorFamilyIds[design.colorFamily],
            colorHex: design.colorHex,
            isIndoor: true,
            isOutdoor: format.isOutdoor,
            piecesPerBox,
            m2PerBox,
            kgPerBox,
            currency: "USD",
            priceVisibility: "public",
            status: "published",
            publishedAt: new Date(),
            source: "manual",
          },
        }));

      await prisma.productTranslation.upsert({
        where: { productId_locale: { productId: product.id, locale: "en" } },
        update: {},
        create: {
          productId: product.id,
          tenantId,
          locale: "en",
          name: `${design.nameEn} ${format.finish[0]?.toUpperCase()}${format.finish.slice(1)}`,
          slug: slugEn,
          shortDescription: `${design.nameEn} porcelain tile, ${String(format.widthMm)}×${String(format.heightMm)}mm, ${format.finish} finish.`,
        },
      });
      await prisma.productTranslation.upsert({
        where: { productId_locale: { productId: product.id, locale: "ar" } },
        update: {},
        create: {
          productId: product.id,
          tenantId,
          locale: "ar",
          name: `${design.nameAr}`,
          slug: `${slugEn}-ar`,
          shortDescription: `بلاط بورسلين ${design.nameAr}، ${String(format.widthMm)}×${String(format.heightMm)} مم.`,
        },
      });

      for (const tierKey of Object.keys(
        tax.priceTierIds,
      ) as (keyof Taxonomy["priceTierIds"])[]) {
        const tier = PRICE_TIERS.find((t) => t.key === tierKey);
        if (!tier) continue;
        const tierPrice =
          Math.round(basePrice * (1 - tier.discountPct / 100) * 100) / 100;
        await prisma.productPrice.upsert({
          where: {
            productId_priceTierId_minQuantityM2_validFrom: {
              productId: product.id,
              priceTierId: tax.priceTierIds[tierKey],
              minQuantityM2: 0,
              validFrom: new Date("2026-01-01"),
            },
          },
          update: { price: tierPrice },
          create: {
            tenantId,
            productId: product.id,
            priceTierId: tax.priceTierIds[tierKey],
            price: tierPrice,
            currency: "USD",
            minQuantityM2: 0,
            validFrom: new Date("2026-01-01"),
          },
        });
      }

      const locations = await prisma.location.findMany({ where: { tenantId } });
      for (const location of locations) {
        const lotNumber = `LOT-${sku}-${location.slug.toUpperCase()}`;
        const existingLot = await prisma.stockLot.findFirst({
          where: {
            tenantId,
            productId: product.id,
            locationId: location.id,
            lotNumber,
          },
        });
        if (!existingLot) {
          await prisma.stockLot.create({
            data: {
              tenantId,
              productId: product.id,
              locationId: location.id,
              lotNumber,
              quantityM2: 40 + Math.round(Math.random() * 80),
              status: "available",
            },
          });
        }
      }

      count++;
    }
  }

  console.log(
    `seeded ${String(count)} products (${String(DESIGNS.length)} designs × ${String(FORMATS.length)} formats) with EN+AR translations, prices across ${String(PRICE_TIERS.length)} tiers, and stock lots at both locations`,
  );
}

/**
 * Roles and permissions — docs/03-database-design.md §2.4–2.5.
 *
 * The permission vocabulary is global (not tenant-scoped — §2.4), so it is
 * seeded once regardless of tenant. Roles are per-tenant system roles; every
 * tenant gets the same five with isSystem = true, matching §2.5's matrix
 * verbatim. `product.create`/`.update` and `user.invite`/`.manage` are written
 * as combined rows in the doc's table but are two permission keys each with
 * identical grants — expanded here rather than collapsed, since the database
 * has no notion of a combined key.
 */

const PERMISSIONS = [
  "product.read",
  "product.create",
  "product.update",
  "product.publish",
  "product.delete",
  "inventory.read",
  "inventory.adjust",
  "price.base.write",
  "price.trade.read",
  "price.trade.write",
  "request.read",
  "request.respond",
  "media.manage",
  "content.manage",
  "ingestion.run",
  "ingestion.approve",
  "ai.configure",
  "ai.costs.read",
  "analytics.read",
  "connector.manage",
  "user.invite",
  "user.manage",
  "role.manage",
  "audit.read",
  "settings.write",
  "tenant.manage",
] as const;

/** The §2.5 matrix, transcribed column by column. */
const ROLES = [
  {
    key: "owner",
    name: "Owner",
    description: "Full access, including role management and tenant settings.",
    // Every permission — the only role that can grant permissions to others,
    // per "only owner can manage roles" (§2.4).
    permissions: PERMISSIONS,
  },
  {
    key: "admin",
    name: "Admin",
    description: "Full operational access, excluding role and tenant management.",
    permissions: PERMISSIONS.filter(
      (p) => p !== "role.manage" && p !== "tenant.manage",
    ),
  },
  {
    key: "editor",
    name: "Editor",
    description: "Catalog content: products, media, ingestion review.",
    permissions: [
      "product.read",
      "product.create",
      "product.update",
      "product.publish",
      "inventory.read",
      "price.trade.read",
      "media.manage",
      "content.manage",
      "ingestion.run",
      "ingestion.approve",
      "analytics.read",
    ],
  },
  {
    key: "sales",
    name: "Sales",
    description:
      "Customer requests and stock adjustments — the showroom floor role.",
    permissions: [
      "product.read",
      "inventory.read",
      "inventory.adjust",
      "price.trade.read",
      "request.read",
      "request.respond",
      "analytics.read",
    ],
  },
  {
    key: "viewer",
    name: "Viewer",
    description: "Read-only access to the catalog, stock and cost dashboards.",
    permissions: [
      "product.read",
      "inventory.read",
      "request.read",
      "ai.costs.read",
      "analytics.read",
    ],
  },
] as const;

async function seedRolesAndPermissions(tenantId: string) {
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }

  for (const role of ROLES) {
    const row = await prisma.role.upsert({
      where: { tenantId_key: { tenantId, key: role.key } },
      update: { name: role.name, description: role.description },
      create: {
        tenantId,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: true,
      },
    });

    for (const permissionKey of role.permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionKey: { roleId: row.id, permissionKey },
        },
        update: {},
        create: { roleId: row.id, permissionKey },
      });
    }
  }

  console.log(
    `seeded ${String(PERMISSIONS.length)} permissions and ${String(ROLES.length)} system roles`,
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
