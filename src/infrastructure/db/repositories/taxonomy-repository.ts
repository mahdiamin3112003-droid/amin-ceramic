import type { Prisma } from "@prisma/client";

import type {
  KeyedTaxonomy,
  ReorderInstruction,
  TaxonomyRow,
} from "@/domain/admin/taxonomy";

/**
 * The keyed-lookup taxonomy family — six tables with an identical shape.
 *
 * ── Why a delegate map rather than six repositories ──
 * `material`, `finish`, `surface_look`, `color_family`, `application` and
 * `layout_pattern` differ only in name and in two optional columns. Six
 * copies of this file would drift: someone fixes the deactivation guard in
 * one and not the others, and the bug hides in whichever table is least
 * used.
 *
 * Prisma's delegates are structurally compatible here, so one function
 * parameterised by resource is genuinely one implementation — not a
 * dispatch table pretending to be one. The structural casts below are the
 * price: Prisma's generated types are nominally distinct per model even
 * where the shapes coincide, and it cannot express "any delegate with this
 * column set". The alternative — six copies — is worse, and the lookup is
 * checked at runtime rather than asserted away.
 */

/** Prisma delegate names, keyed by the URL segment used in the admin. */
const DELEGATE: Readonly<Record<KeyedTaxonomy, string>> = {
  material: "material",
  finish: "finish",
  "surface-look": "surfaceLook",
  "color-family": "colorFamily",
  application: "application",
  "layout-pattern": "layoutPattern",
};

/** The FK column on `product` that points back at each table. */
const PRODUCT_FK: Readonly<Record<KeyedTaxonomy, string | null>> = {
  material: "materialId",
  finish: "finishId",
  "surface-look": "surfaceLookId",
  "color-family": "colorFamilyId",
  // Applications live in `product.application_ids` (a uuid[], not an FK —
  // docs/03 §3.5), and layout patterns are referenced by quote zones rather
  // than by products at all. Both are counted separately below.
  application: null,
  "layout-pattern": null,
};

interface Delegate {
  findMany: (args: unknown) => Promise<unknown[]>;
  create: (args: unknown) => Promise<{ id: string }>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
  findFirst: (args: unknown) => Promise<unknown>;
}

function delegate(tx: Prisma.TransactionClient, resource: KeyedTaxonomy): Delegate {
  const name = DELEGATE[resource];
  const client = (tx as unknown as Record<string, Delegate | undefined>)[name];
  // Unreachable via the typed callers, but the cast above erases Prisma's
  // guarantee — so it is checked rather than asserted.
  if (!client) throw new Error(`no Prisma delegate named "${name}"`);
  return client;
}

interface RawRow {
  id: string;
  key: string;
  sortOrder: number;
  isActive: boolean;
  colorHex?: string | null;
  defaultWastagePct?: Prisma.Decimal | null;
  translations: { locale: string; name: string; description: string | null }[];
}

/**
 * How many products reference each row.
 *
 * Two shapes, because the schema has two. The four spec dimensions are
 * ordinary FKs and group cheaply; applications are a uuid[] column, which
 * needs `= ANY`. Layout patterns are referenced by quote zones, not
 * products, so their count is always zero here — deactivating one is
 * always allowed, which is correct: it stops appearing as an option
 * without invalidating a quote already placed.
 */
async function countProductUsage(
  tx: Prisma.TransactionClient,
  tenantId: string,
  resource: KeyedTaxonomy,
  ids: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;

  const fk = PRODUCT_FK[resource];

  if (fk) {
    const grouped = await tx.product.groupBy({
      by: [fk as "materialId"],
      where: { tenantId, deletedAt: null, [fk]: { in: [...ids] } },
      _count: { _all: true },
    });
    for (const row of grouped) {
      const id = (row as unknown as Record<string, string>)[fk];
      if (id) counts.set(id, row._count._all);
    }
    return counts;
  }

  if (resource === "application") {
    const rows = await tx.$queryRaw<{ application_id: string; count: bigint }[]>`
      SELECT app_id AS application_id, COUNT(*) AS count
      FROM product p, UNNEST(p.application_ids) AS app_id
      WHERE p.tenant_id = ${tenantId}::uuid
        AND p.deleted_at IS NULL
        AND app_id = ANY(${[...ids]}::uuid[])
      GROUP BY app_id
    `;
    for (const row of rows) counts.set(row.application_id, Number(row.count));
  }

  return counts;
}

export async function listTaxonomy(
  tx: Prisma.TransactionClient,
  tenantId: string,
  resource: KeyedTaxonomy,
): Promise<TaxonomyRow[]> {
  const rows = (await delegate(tx, resource).findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    select: {
      id: true,
      key: true,
      sortOrder: true,
      isActive: true,
      ...(resource === "color-family" ? { colorHex: true } : {}),
      ...(resource === "layout-pattern" ? { defaultWastagePct: true } : {}),
      translations: { select: { locale: true, name: true, description: true } },
    },
  })) as RawRow[];

  const usage = await countProductUsage(
    tx,
    tenantId,
    resource,
    rows.map((r) => r.id),
  );

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    colorHex: row.colorHex ?? null,
    defaultWastagePct:
      row.defaultWastagePct === undefined || row.defaultWastagePct === null
        ? null
        : row.defaultWastagePct.toNumber(),
    translations: row.translations,
    productCount: usage.get(row.id) ?? 0,
  }));
}

export async function findTaxonomyByKey(
  tx: Prisma.TransactionClient,
  tenantId: string,
  resource: KeyedTaxonomy,
  key: string,
): Promise<{ id: string } | null> {
  return (await delegate(tx, resource).findFirst({
    where: { tenantId, key },
    select: { id: true },
  })) as { id: string } | null;
}

export interface TaxonomyWriteInput {
  readonly key: string;
  readonly colorHex: string | null;
  readonly defaultWastagePct: number | null;
  readonly translations: readonly {
    locale: string;
    name: string;
    description: string | null;
  }[];
}

export async function createTaxonomy(
  tx: Prisma.TransactionClient,
  tenantId: string,
  resource: KeyedTaxonomy,
  input: TaxonomyWriteInput,
): Promise<{ id: string }> {
  return delegate(tx, resource).create({
    data: {
      tenantId,
      key: input.key,
      // New vocabulary arrives INACTIVE. §14.1 forbids activating without
      // a full set of translations, and a row created active-by-default
      // would be live on the storefront before anyone had named it.
      isActive: false,
      ...(resource === "color-family" ? { colorHex: input.colorHex } : {}),
      ...(resource === "layout-pattern"
        ? { defaultWastagePct: input.defaultWastagePct ?? 0 }
        : {}),
      translations: { create: [...input.translations] },
    },
    select: { id: true },
  });
}

/**
 * Update everything except the key.
 *
 * §14.1: "`key` immutable after creation (it is referenced by data and by
 * code)". It is not accepted here at all, rather than accepted and
 * ignored — a silently discarded field is worse than a missing one.
 */
export async function updateTaxonomy(
  tx: Prisma.TransactionClient,
  tenantId: string,
  resource: KeyedTaxonomy,
  id: string,
  input: Omit<TaxonomyWriteInput, "key">,
): Promise<void> {
  // Four of the six vocabularies carry NO editable columns of their own —
  // everything about a material or a finish lives in its translations. An
  // unconditional `updateMany` there sends `data: {}`, which Prisma reports
  // as zero rows affected, which this function used to read as "not found".
  // The effect was that saving a material, finish, surface look or
  // application always failed. Only issue the row update when there is
  // something to put in it.
  const columns = {
    ...(resource === "color-family" ? { colorHex: input.colorHex } : {}),
    ...(resource === "layout-pattern"
      ? { defaultWastagePct: input.defaultWastagePct ?? 0 }
      : {}),
  };

  if (Object.keys(columns).length > 0) {
    const { count } = await delegate(tx, resource).updateMany({
      where: { id, tenantId },
      data: columns,
    });
    if (count === 0) throw new Error("not found");
  }

  // Translations are upserted individually: a partial save must not delete
  // the locale the editor wasn't looking at.
  for (const translation of input.translations) {
    await upsertTaxonomyTranslation(tx, resource, id, translation);
  }
}

const TRANSLATION_DELEGATE: Readonly<Record<KeyedTaxonomy, string>> = {
  material: "materialTranslation",
  finish: "finishTranslation",
  "surface-look": "surfaceLookTranslation",
  "color-family": "colorFamilyTranslation",
  application: "applicationTranslation",
  "layout-pattern": "layoutPatternTranslation",
};

const TRANSLATION_FK: Readonly<Record<KeyedTaxonomy, string>> = {
  material: "materialId",
  finish: "finishId",
  "surface-look": "surfaceLookId",
  "color-family": "colorFamilyId",
  application: "applicationId",
  "layout-pattern": "layoutPatternId",
};

async function upsertTaxonomyTranslation(
  tx: Prisma.TransactionClient,
  resource: KeyedTaxonomy,
  id: string,
  translation: { locale: string; name: string; description: string | null },
): Promise<void> {
  const model = TRANSLATION_DELEGATE[resource];
  const fk = TRANSLATION_FK[resource];
  const client = (
    tx as unknown as Record<string, { upsert: (a: unknown) => Promise<unknown> }>
  )[model];
  if (!client) throw new Error(`no translation delegate for ${resource}`);

  await client.upsert({
    where: { [`${fk}_locale`]: { [fk]: id, locale: translation.locale } },
    create: { [fk]: id, ...translation },
    update: { name: translation.name, description: translation.description },
  });
}

export async function setTaxonomyActive(
  tx: Prisma.TransactionClient,
  tenantId: string,
  resource: KeyedTaxonomy,
  id: string,
  isActive: boolean,
): Promise<void> {
  const { count } = await delegate(tx, resource).updateMany({
    where: { id, tenantId },
    data: { isActive },
  });
  if (count === 0) throw new Error("not found");
}

/**
 * Rewrite the whole list's sort order in one transaction.
 *
 * See `reorder()` in the domain for why the complete list is sent rather
 * than a single move.
 */
export async function reorderTaxonomy(
  tx: Prisma.TransactionClient,
  tenantId: string,
  resource: KeyedTaxonomy,
  instructions: readonly ReorderInstruction[],
): Promise<void> {
  for (const { id, sortOrder } of instructions) {
    await delegate(tx, resource).updateMany({
      where: { id, tenantId },
      data: { sortOrder },
    });
  }
}
