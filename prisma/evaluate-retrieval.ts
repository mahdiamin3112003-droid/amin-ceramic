import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { retrieveProducts } from "@/application/use-cases/ai/retrieve-core";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    // Absent is fine.
  }
}

/**
 * Evaluation harness — docs/01-architecture.md §10's "evaluation harness
 * with a labelled test set," the honest small version, per the Phase 5
 * plan.
 *
 * ── The labelled set ──
 * Every product with a current embedding, using ITS OWN primary photo as
 * the query. The "correct answer" for each query is the product the photo
 * came from — the smallest labelled set that requires no manual labelling
 * effort, and the same one `backfill-embeddings.ts` just populated.
 *
 * ── What this can and cannot prove at this scale ──
 * With ~12 products, a self-retrieval task is close to trivial: the
 * query's own embedding is (numerically) its own nearest neighbour barring
 * a processing bug, so precision@1 near 100% here is expected and is NOT
 * evidence of good discrimination — it mostly proves the pipeline runs
 * correctly end to end. The one genuine discrimination signal this corpus
 * offers is the Cefeo Perla Matte / Crotone Pearl Matte pair (same look,
 * same format, same colour family) — reported separately below, by name,
 * because it is the one case where "did the correct product win" is
 * actually informative rather than close to guaranteed.
 *
 * Re-run this whenever the catalogue grows; the precision numbers become
 * meaningful once queries have real near-neighbours to be confused with.
 */

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
  },
});

interface LabelledRow {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly visualEmbedding: readonly number[];
  readonly semanticEmbedding: readonly number[];
}

async function loadLabelledSet(tenantId: string): Promise<readonly LabelledRow[]> {
  const rows = await prisma.$queryRaw<
    {
      product_id: string;
      sku: string;
      name: string;
      visual_embedding: string;
      semantic_embedding: string;
    }[]
  >`
    SELECT p.id AS product_id, p.sku, pt.name,
      pe.visual_embedding::text AS visual_embedding,
      pe.semantic_embedding::text AS semantic_embedding
    FROM product_embedding pe
    JOIN product p ON p.id = pe.product_id
    JOIN product_translation pt ON pt.product_id = p.id AND pt.locale = 'en'
    WHERE pe.tenant_id = ${tenantId}::uuid
      AND pe.is_current = true
      AND p.status = 'published'
      AND p.deleted_at IS NULL
    ORDER BY p.sku
  `;

  // pgvector's text output is "[0.1,0.2,...]" — parse back to number[].
  const parseVector = (text: string): readonly number[] =>
    text.slice(1, -1).split(",").map(Number);

  return rows.map((r) => ({
    productId: r.product_id,
    sku: r.sku,
    name: r.name,
    visualEmbedding: parseVector(r.visual_embedding),
    semanticEmbedding: parseVector(r.semantic_embedding),
  }));
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findFirst({
    where: { status: "active" },
    select: { id: true },
  });
  if (!tenant) throw new Error("no active tenant — run `pnpm db:seed`");
  const tenantId = tenant.id;

  const labelled = await loadLabelledSet(tenantId);
  if (labelled.length === 0) {
    console.error(
      "\n  NOT RUNNING — no current embeddings found.\n" +
        "  Run `pnpm ai:backfill-embeddings` first.\n",
    );
    process.exit(1);
  }

  let top1 = 0;
  let top5 = 0;

  for (const query of labelled) {
    // Sequential by design (see the memory note on withRequestContext
    // concurrency this whole slice follows) — this is a CLI report, not a
    // request path, so there is no latency budget to protect here.
    const matches = await prisma.$transaction((tx) =>
      retrieveProducts(tx, tenantId, {
        visualEmbedding: query.visualEmbedding,
        semanticEmbedding: query.semanticEmbedding,
        limit: 5,
      }),
    );
    const rank = matches.findIndex((m) => m.productId === query.productId);
    if (rank === 0) top1 += 1;
    if (rank >= 0 && rank < 5) top5 += 1;
  }

  console.log(`\n  Labelled set: ${String(labelled.length)} products`);
  console.log(
    `  precision@1: ${String(top1)}/${String(labelled.length)} ` +
      `(${(100 * (top1 / labelled.length)).toFixed(0)}%)`,
  );
  console.log(
    `  precision@5: ${String(top5)}/${String(labelled.length)} ` +
      `(${(100 * (top5 / labelled.length)).toFixed(0)}%)\n`,
  );
  console.log(
    "  These numbers are near-trivial at this catalogue size — see the\n" +
      "  file header. They confirm the pipeline runs correctly end to end,\n" +
      "  not that retrieval quality is good. Re-run as the catalogue grows.\n",
  );

  const cefeo = labelled.find((r) => r.name.includes("Cefeo"));
  const crotonePearl = labelled.find((r) => r.name.includes("Crotone Pearl"));
  if (cefeo && crotonePearl) {
    const matches = await prisma.$transaction((tx) =>
      retrieveProducts(tx, tenantId, {
        visualEmbedding: cefeo.visualEmbedding,
        semanticEmbedding: cefeo.semanticEmbedding,
        limit: labelled.length,
      }),
    );
    const rankOfCrotone = matches.findIndex(
      (m) => m.productId === crotonePearl.productId,
    );
    console.log(
      "  Near-duplicate check — Cefeo Perla Matte vs Crotone Pearl Matte\n" +
        "  (same look, same format, same colour family; the one genuine\n" +
        "  discrimination test this corpus currently offers):",
    );
    if (rankOfCrotone === -1) {
      console.log("    Crotone Pearl Matte did not appear in Cefeo's results.");
    } else {
      const match = matches[rankOfCrotone];
      console.log(
        `    Crotone Pearl Matte ranked #${String(rankOfCrotone + 1)} against a` +
          ` Cefeo query, visual distance ${match?.visualDistance?.toFixed(4) ?? "n/a"}.`,
      );
      console.log(
        "    A low rank/distance here means the visual embedding cannot tell\n" +
          "    these two apart — worth a manual look if so, since it is exactly\n" +
          "    the failure mode docs/01 §6.2 built the dual-vector design to catch.",
      );
    }
  } else {
    console.log(
      "  Near-duplicate check skipped — Cefeo Perla Matte and/or Crotone\n" +
        "  Pearl Matte are not both in the current labelled set.",
    );
  }
}

main()
  .catch((cause: unknown) => {
    console.error(cause);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
