import { adminMutation, adminQuery } from "@/application/auth/admin-mutation";
import {
  TAXONOMY_DESCRIPTORS,
  activationBlockers,
  canDeactivate,
  deactivationBlockedReason,
  reorder,
  type KeyedTaxonomy,
  type ReorderInstruction,
  type TaxonomyRow,
} from "@/domain/admin/taxonomy";
import {
  createTaxonomy,
  findTaxonomyByKey,
  listTaxonomy,
  reorderTaxonomy,
  setTaxonomyActive,
  updateTaxonomy,
  type TaxonomyWriteInput,
} from "@/infrastructure/db/repositories/taxonomy-repository";

/**
 * Taxonomy use-cases — docs/04 §14.1.
 *
 * The four business rules the spec names all live here rather than in the
 * screen, because §14.1's contract is what the API promises regardless of
 * which client calls it:
 *
 *   key immutable            enforced by the schema not accepting it
 *   key unique per tenant    checked before insert, 409-shaped error
 *   translations before live activation refuses and names the locales
 *   referenced rows stay live deactivation refuses and gives the count
 */
const REQUIRED_LOCALES = ["en", "ar"] as const;

export async function listTaxonomyForAdmin(
  resource: KeyedTaxonomy,
): Promise<TaxonomyRow[]> {
  return adminQuery(TAXONOMY_DESCRIPTORS[resource].permission, (tx, ctx) =>
    listTaxonomy(tx, ctx.tenantId, resource),
  );
}

export async function createTaxonomyEntry(
  resource: KeyedTaxonomy,
  input: TaxonomyWriteInput,
): Promise<{ id: string }> {
  const descriptor = TAXONOMY_DESCRIPTORS[resource];

  return adminMutation(descriptor.permission, async (tx, ctx) => {
    // Checked before insert so the message names the conflict. The unique
    // index is still the guarantee; this is what makes it readable.
    const existing = await findTaxonomyByKey(tx, ctx.tenantId, resource, input.key);
    if (existing) {
      throw new Error(
        `the key "${input.key}" is already used by another ${descriptor.singular}`,
      );
    }

    const created = await createTaxonomy(tx, ctx.tenantId, resource, input);

    return {
      result: created,
      audit: {
        action: `${resource}.create`,
        entityType: resource,
        entityId: created.id,
        entityLabel: `${input.key} — ${input.translations[0]?.name ?? ""}`,
        after: { key: input.key, translations: input.translations },
      },
    };
  });
}

export async function updateTaxonomyEntry(
  resource: KeyedTaxonomy,
  id: string,
  input: Omit<TaxonomyWriteInput, "key">,
): Promise<void> {
  const descriptor = TAXONOMY_DESCRIPTORS[resource];

  return adminMutation(descriptor.permission, async (tx, ctx) => {
    const before = (await listTaxonomy(tx, ctx.tenantId, resource)).find(
      (r) => r.id === id,
    );
    if (!before) throw new Error("not found");

    await updateTaxonomy(tx, ctx.tenantId, resource, id, input);

    return {
      result: undefined,
      audit: {
        action: `${resource}.update`,
        entityType: resource,
        entityId: id,
        entityLabel: before.key,
        before: { translations: before.translations },
        after: { translations: input.translations },
      },
    };
  });
}

/**
 * Activate or deactivate.
 *
 * Both directions have a gate, and they are different gates:
 *   activating   needs a name in every locale (§14.1)
 *   deactivating needs no product to be relying on it (§14.1)
 *
 * Both are checked HERE, inside the transaction, against the row as it
 * actually is — not against whatever the browser last rendered.
 */
export async function setTaxonomyEntryActive(
  resource: KeyedTaxonomy,
  id: string,
  isActive: boolean,
): Promise<void> {
  const descriptor = TAXONOMY_DESCRIPTORS[resource];

  return adminMutation(descriptor.permission, async (tx, ctx) => {
    const row = (await listTaxonomy(tx, ctx.tenantId, resource)).find(
      (r) => r.id === id,
    );
    if (!row) throw new Error("not found");

    if (isActive) {
      const blockers = activationBlockers(row, REQUIRED_LOCALES);
      if (blockers.length > 0) {
        throw new Error(`cannot activate: ${blockers.join(", ").toLowerCase()}`);
      }
    } else if (!canDeactivate(row)) {
      throw new Error(
        deactivationBlockedReason(row, descriptor.singular) ?? "cannot deactivate",
      );
    }

    await setTaxonomyActive(tx, ctx.tenantId, resource, id, isActive);

    return {
      result: undefined,
      audit: {
        action: `${resource}.${isActive ? "activate" : "deactivate"}`,
        entityType: resource,
        entityId: id,
        entityLabel: row.key,
        before: { isActive: row.isActive },
        after: { isActive },
        changedFields: ["isActive"],
      },
    };
  });
}

/**
 * Reorder the whole list.
 *
 * Sort order is merchandising — it decides the order of filter chips a
 * customer sees — so it is audited like any other content change, but as
 * ONE entry rather than one per row. Twelve audit rows for a drag nobody
 * will ever look up individually is noise.
 */
export async function reorderTaxonomyEntries(
  resource: KeyedTaxonomy,
  orderedIds: readonly string[],
): Promise<void> {
  const descriptor = TAXONOMY_DESCRIPTORS[resource];

  return adminMutation(descriptor.permission, async (tx, ctx) => {
    const instructions: ReorderInstruction[] = orderedIds.map((id, sortOrder) => ({
      id,
      sortOrder,
    }));
    await reorderTaxonomy(tx, ctx.tenantId, resource, instructions);

    return {
      result: undefined,
      audit: {
        action: `${resource}.reorder`,
        entityType: resource,
        entityLabel: descriptor.label,
        after: { order: orderedIds },
      },
    };
  });
}

/** Re-exported so the client can compute a preview without a round trip. */
export { reorder };
