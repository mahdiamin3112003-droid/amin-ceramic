import OpenAI from "openai";

import type { TextEmbeddingProvider, TextEmbeddingResult } from "./types";

/**
 * text-embedding-3-large — docs/01-architecture.md §6.1.
 *
 * No `import "server-only"` here, unlike `supabase-admin.ts` — that guard
 * throws unconditionally outside Next's bundler (confirmed directly), and
 * this module has a second real caller: `prisma/backfill-embeddings.ts`,
 * a plain CLI script. The protection it would add is already redundant:
 * `OPENAI_API_KEY` has no `NEXT_PUBLIC_` prefix, so Next never inlines it
 * into a client bundle — an accidental client import would hit this
 * file's own "required" error immediately, not leak a value that was
 * never there to begin with.
 *
 * `dimensions: 1536` uses OpenAI's native Matryoshka truncation (the model
 * supports requesting a shorter vector directly) rather than generating the
 * full 3072-d embedding and truncating client-side — same result, one
 * fewer thing this code has to get right.
 */
const MODEL = "text-embedding-3-large";
const DIMENSIONS = 1536;

let cached: OpenAI | null = null;

function client(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for text embeddings");
  }
  cached = new OpenAI({ apiKey });
  return cached;
}

export const openAiTextEmbeddings: TextEmbeddingProvider = {
  async embedText(input: string): Promise<TextEmbeddingResult> {
    const start = Date.now();
    const response = await client().embeddings.create({
      model: MODEL,
      input,
      dimensions: DIMENSIONS,
    });
    const [data] = response.data;
    if (!data) {
      throw new Error("OpenAI returned no embedding for the given input");
    }
    return {
      embedding: data.embedding,
      model: MODEL,
      inputTokens: response.usage.total_tokens,
      latencyMs: Date.now() - start,
    };
  },
};
