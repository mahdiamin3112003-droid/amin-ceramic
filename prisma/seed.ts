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
    permissions: ["product.read", "inventory.read", "request.read", "ai.costs.read", "analytics.read"],
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
