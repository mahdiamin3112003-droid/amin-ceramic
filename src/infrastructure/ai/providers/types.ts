/**
 * Provider abstraction — docs/01-architecture.md §6.1/§6.2.
 *
 * One interface per embedding kind, not one interface for "AI provider" —
 * text and image embedding are different capabilities with different
 * inputs, and a swap (e.g. Replicate → a dedicated Hugging Face endpoint
 * once Phase 6's query-time latency needs are known) should only ever
 * touch the file implementing that one interface.
 *
 * `usage` is deliberately provider-shaped rather than normalised into one
 * "cost" number here: OpenAI returns real token counts, Replicate does not
 * return a directly billable figure from a `run()` call. Callers write
 * whatever the provider actually gave them to `AiInteraction`
 * (docs/01 §6.6) rather than a computed estimate presented as fact.
 */
export interface TextEmbeddingResult {
  readonly embedding: readonly number[];
  readonly model: string;
  readonly inputTokens: number;
  readonly latencyMs: number;
}

export interface ImageEmbeddingResult {
  readonly embedding: readonly number[];
  readonly model: string;
  readonly latencyMs: number;
}

export interface TextEmbeddingProvider {
  embedText(input: string): Promise<TextEmbeddingResult>;
}

export interface ImageEmbeddingProvider {
  embedImage(imageUrl: string): Promise<ImageEmbeddingResult>;
}
