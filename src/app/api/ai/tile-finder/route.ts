import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/app/api/v1/_lib/respond";
import { isTileFinderEnabled } from "@/lib/feature-flags";
import { startFinderSession } from "@/application/use-cases/ai/find-tile";

/**
 * `POST /api/ai/tile-finder` — docs/01 §6.3 steps 1-4b.
 *
 * The FAST half: store the photo, gate it, extract attributes. Answers in
 * ~2s so docs/02 §3.4's ANALYSING state has something real to show while the
 * slow visual leg runs behind `/[id]/match`.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/** Bounded here as well as in `uploadFinderQuery` — a 40 MB body should be rejected before it is read into memory, not after. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<Response> {
  // Fail closed — 404, not 403: a 403 would confirm the endpoint exists.
  // This is the switch that keeps the feature dark through a deploy.
  if (!isTileFinderEnabled()) return jsonError(404, "not found");

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");

  if (!(file instanceof File)) {
    return jsonError(400, "an image file is required");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonError(413, "image is larger than 25 MB");
  }

  /**
   * `x-forwarded-for` is the client address behind Vercel's proxy; the first
   * entry is the original client. Falls back to a constant rather than
   * throwing — an unidentifiable caller should share one very restrictive
   * bucket, not bypass the limiter entirely.
   */
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const bytes = Buffer.from(await file.arrayBuffer());

  /**
   * Everything downstream of here calls something that can be unavailable —
   * Supabase, Gemini, the database. An uncaught throw in a route handler
   * returns an EMPTY body, not an error shape, so the client gets a JSON
   * parse failure instead of a message it can show. Found exactly that way:
   * a transient pooler outage produced a 0-byte response.
   */
  let outcome: Awaited<ReturnType<typeof startFinderSession>>;
  try {
    outcome = await startFinderSession({
      bytes,
      mimeType: file.type,
      ipAddress,
    });
  } catch (cause) {
    // Message only, never the object — provider SDK errors carry the
    // originating request and its Authorization header.
    console.error(
      "[tile-finder] start failed:",
      cause instanceof Error ? cause.message : String(cause),
    );
    return jsonError(503, "the finder is unavailable right now — please retry");
  }

  switch (outcome.kind) {
    case "rate_limited":
      return jsonError(429, "too many searches — try again shortly");
    case "invalid":
      return jsonError(400, outcome.error);
    case "rejected":
      // 200, not 4xx: the gate rejecting a photo is a RESULT, not a failed
      // request. docs/02 §3.4's STATE 4 is a designed destination, and the
      // session id is real and shareable.
      return jsonOk({
        sessionId: outcome.sessionId,
        gate: outcome.gate,
        imageUrl: outcome.imageUrl,
        accepted: false,
      });
    case "accepted":
      return jsonOk({
        sessionId: outcome.sessionId,
        attributes: outcome.attributes,
        imageUrl: outcome.imageUrl,
        accepted: true,
      });
  }
}
