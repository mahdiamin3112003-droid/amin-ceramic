import { createHash } from "node:crypto";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { buildEmbeddingText } from "@/domain/ai/embedding-text";
import { openAiTextEmbeddings } from "@/infrastructure/ai/providers/openai-embeddings";
import { replicateVisualEmbeddings } from "@/infrastructure/ai/providers/replicate-visual";
import {
  getCurrentEmbeddingHash,
  upsertProductEmbedding,
} from "@/infrastructure/db/repositories/embedding-repository";
import { mediaUrl } from "@/infrastructure/media/storage";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    // Absent is fine.
  }
}

/**
 * One-off / re-runnable backfill for `product_embedding` — Phase 5 plan.
 *
 * ── Why this does NOT go through the use-case layer ──
 * Same reasoning as `import-products.ts`: a CLI process has no staff
 * session, so `adminMutation` cannot be used. Writes here produce no
 * `AuditLog` row — acceptable for a backfill job, not a pattern to reuse
 * for ordinary editing. `AiInteraction` rows ARE written (they are cost
 * attribution, not an authorisation audit trail, and have no session
 * dependency), inside the same transaction as the embedding write.
 *
 * ── Idempotent ──
 * Skips a product whose current embedding was already generated from the
 * same inputs (name/description/specs/photo), tracked via
 * `embedding_input_hash`. Re-running after a product edit or a new photo
 * regenerates only what changed — safe to run on a cron, once one exists.
 *
 * ── Every product with a photo, not just the current 12 ──
 * Deliberately not scoped to a brand or to today's 12 SKUs — the plan is
 * explicit that this is a real catalogue's tooling, not a one-time script
 * for a fixed list. Embeds any product (any status) that has a primary
 * photo; the retrieval queries themselves already restrict matches to
 * `status = 'published'` (embedding-repository.ts), so embedding a draft
 * early is harmless and saves a second pass once it publishes.
 */

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
  },
});

function requireProviderKeys(): void {
  const missing = ["OPENAI_API_KEY", "REPLICATE_API_TOKEN"].filter(
    (key) => !process.env[key],
  );
  if (missing.length > 0) {
    console.error(
      `\n  NOT RUNNING — missing: ${missing.join(", ")}.\n` +
        `  Set these in .env.local before running the backfill. See .env.example.\n`,
    );
    process.exit(1);
  }
}

function inputHash(text: string, imageUrl: string): string {
  return createHash("sha256").update(text).update(imageUrl).digest("hex");
}

async function main(): Promise<void> {
  requireProviderKeys();

  const tenant = await prisma.tenant.findFirst({
    where: { status: "active" },
    select: { id: true },
  });
  if (!tenant) throw new Error("no active tenant — run `pnpm db:seed`");
  const tenantId = tenant.id;

  const products = await prisma.product.findMany({
    where: { tenantId, deletedAt: null, primaryMediaId: { not: null } },
    select: {
      id: true,
      sku: true,
      primaryMediaId: true,
      primaryMedia: { select: { publicId: true, secureUrl: true } },
      translations: {
        where: { locale: "en" },
        select: { name: true, description: true },
      },
      material: { select: { key: true } },
      finish: { select: { key: true } },
      surfaceLook: { select: { key: true } },
      colorFamily: { select: { key: true } },
      applicationIds: true,
    },
    orderBy: { sku: "asc" },
  });

  const applications = await prisma.application.findMany({
    where: { tenantId },
    select: { id: true, key: true },
  });
  const applicationKey = new Map(applications.map((a) => [a.id, a.key]));

  let embedded = 0;
  let skipped = 0;

  for (const p of products) {
    const translation = p.translations[0];
    if (!translation || !p.primaryMedia) {
      console.log(
        `  skip     ${p.sku.padEnd(16)} no EN translation or primary photo`,
      );
      skipped += 1;
      continue;
    }

    const text = buildEmbeddingText({
      name: translation.name,
      description: translation.description,
      material: p.material.key,
      finish: p.finish.key,
      surfaceLook: p.surfaceLook.key,
      colorFamily: p.colorFamily.key,
      applications: p.applicationIds
        .map((id) => applicationKey.get(id))
        .filter((k): k is string => k !== undefined),
    });
    const imageUrl = mediaUrl(p.primaryMedia);
    const hash = inputHash(text, imageUrl);

    const currentHash = await prisma.$transaction((tx) =>
      getCurrentEmbeddingHash(tx, tenantId, p.id),
    );
    if (currentHash === hash) {
      console.log(
        `  unchanged ${p.sku.padEnd(16)} skipping (same inputs as current embedding)`,
      );
      skipped += 1;
      continue;
    }

    const [textResult, imageResult] = [
      await openAiTextEmbeddings.embedText(text),
      await replicateVisualEmbeddings.embedImage(imageUrl),
    ];

    await prisma.$transaction(async (tx) => {
      await upsertProductEmbedding(tx, tenantId, {
        productId: p.id,
        visualEmbedding: imageResult.embedding,
        semanticEmbedding: textResult.embedding,
        visualModel: imageResult.model,
        semanticModel: textResult.model,
        sourceMediaId: p.primaryMediaId,
        embeddingInputHash: hash,
      });

      await tx.aiInteraction.create({
        data: {
          tenantId,
          feature: "embedding_semantic",
          provider: "openai",
          model: textResult.model,
          operation: "embed",
          inputTokens: textResult.inputTokens,
          latencyMs: textResult.latencyMs,
          status: "success",
          referenceType: "product",
          referenceId: p.id,
        },
      });
      await tx.aiInteraction.create({
        data: {
          tenantId,
          feature: "embedding_visual",
          provider: "siglip_host",
          model: imageResult.model,
          operation: "embed",
          imageCount: 1,
          latencyMs: imageResult.latencyMs,
          status: "success",
          referenceType: "product",
          referenceId: p.id,
        },
      });
    });

    console.log(`  embedded ${p.sku.padEnd(16)} ${translation.name}`);
    embedded += 1;
  }

  console.log(`\n  ${String(embedded)} embedded, ${String(skipped)} skipped.\n`);
}

main()
  .catch((cause: unknown) => {
    /**
     * Message only — never the error OBJECT.
     *
     * Provider SDKs attach the originating `Request` to their errors, and
     * that request carries `Authorization: Bearer …`. Printing the object
     * puts the API key in the terminal, in CI logs, and in anything
     * scraping stdout. This happened for real here: a Replicate 429 during
     * the first backfill dumped the token and forced a rotation.
     * `replicate-visual.ts` redacts at its own boundary; this is the
     * belt-and-braces for every other provider.
     */
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
