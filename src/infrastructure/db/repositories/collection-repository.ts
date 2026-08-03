import type { Prisma } from "@prisma/client";

import type { Collection } from "@/domain/catalog/entity";

/**
 * Collection repository — `collection`/`collection_translation`
 * (docs/03-database-design.md §3.2). Same translation-join and
 * tenant-scoped-transaction pattern as `product-repository.ts`.
 */

function include(locale: string) {
  return {
    translations: { where: { locale } },
  } satisfies Prisma.CollectionInclude;
}

type Row = Prisma.CollectionGetPayload<{ include: ReturnType<typeof include> }>;

function toDomain(row: Row): Collection | null {
  const translation = row.translations[0];
  if (!translation) return null;

  return {
    id: row.id,
    slug: row.slug,
    name: translation.name,
    description: translation.description,
    heroMediaId: row.heroMediaId,
    isFeatured: row.isFeatured,
  };
}

export async function listCollections(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locale: string,
): Promise<readonly Collection[]> {
  const rows = await tx.collection.findMany({
    where: { tenantId, status: "published", deletedAt: null },
    include: include(locale),
    orderBy: [{ sortOrder: "asc" }],
  });
  return rows.map(toDomain).filter((c): c is Collection => c !== null);
}

export async function getCollectionBySlug(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locale: string,
  slug: string,
): Promise<Collection | null> {
  const row = await tx.collection.findFirst({
    where: { tenantId, slug, status: "published", deletedAt: null },
    include: include(locale),
  });
  return row ? toDomain(row) : null;
}
