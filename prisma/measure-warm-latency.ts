import path from "node:path";

import { replicateVisualEmbeddings } from "@/infrastructure/ai/providers/replicate-visual";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    // Absent is fine.
  }
}

/**
 * Times the visual embedding call — the ONE thing the keep-warm job exists
 * to change.
 *
 * ── Why not run real Tile Finder searches ──
 * A search also spends two Gemini calls against a free-tier quota of twenty
 * per day, and mixes gate + extraction + retrieval latency into the number.
 * Neither helps: the question is whether Replicate answers warm, and this
 * measures exactly that and nothing else.
 *
 * ── The baseline it is being compared against ──
 * Measured during Phase 5's backfill and Phase 6's development, with no
 * keep-warm running at all:
 *
 *     min 1,598 ms · median 9,130 ms · p90 212,186 ms · max 234,855 ms
 *
 * A warm model should sit near that minimum. Anything in the tens of
 * seconds means the schedule is not holding an instance up.
 */

const SAMPLES = 5;
const GAP_MS = 3_000;

/** A real catalogue photo — the same input shape the finder sends. */
const IMAGE_URL =
  "https://vvwpygqdaqbyzneokopb.supabase.co/storage/v1/object/public/media/" +
  "019fc197-1c01-771a-9369-69985372273b/" +
  "97607437479a830f240e093fe7f54fc1b9a0e19bf14313d1113fa6271db25150.webp";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index] ?? 0;
}

async function main(): Promise<void> {
  const results: number[] = [];

  for (let i = 0; i < SAMPLES; i++) {
    const started = Date.now();
    try {
      const outcome = await replicateVisualEmbeddings.embedImage(IMAGE_URL);
      const elapsed = Date.now() - started;
      results.push(elapsed);
      console.log(
        `  ${String(i + 1).padStart(2)}. ${String(elapsed).padStart(7)} ms` +
          `   (${String(outcome.embedding.length)}-d vector)`,
      );
    } catch (cause) {
      // Message only — provider errors carry the request's auth header.
      console.log(
        `  ${String(i + 1).padStart(2)}.  FAILED  ` +
          (cause instanceof Error ? cause.message.split("\n")[0] : String(cause)),
      );
    }
    if (i < SAMPLES - 1) await sleep(GAP_MS);
  }

  if (results.length === 0) {
    console.log("\n  No successful calls — nothing to compare.\n");
    return;
  }

  const sorted = [...results].sort((a, b) => a - b);
  const mean = Math.round(results.reduce((a, b) => a + b, 0) / results.length);

  console.log("\n  ── warm path ──");
  console.log(`  samples : ${String(results.length)}/${String(SAMPLES)}`);
  console.log(`  min     : ${String(sorted[0])} ms`);
  console.log(`  median  : ${String(percentile(sorted, 0.5))} ms`);
  console.log(`  mean    : ${String(mean)} ms`);
  console.log(`  max     : ${String(sorted[sorted.length - 1])} ms`);
  console.log("\n  ── baseline, no keep-warm ──");
  console.log("  min 1598 ms · median 9130 ms · p90 212186 ms · max 234855 ms\n");
}

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : String(cause));
  process.exitCode = 1;
});
