import { z } from "zod";

import { jsonError, jsonOk } from "@/app/api/v1/_lib/respond";
import { matchFinderSession } from "@/application/use-cases/ai/find-tile";

/**
 * `POST /api/ai/tile-finder/[id]/match` — docs/01 §6.3 steps 4a, 5, 7, 8.
 *
 * The SLOW half. `maxDuration` is the platform ceiling rather than a
 * considered number: a cold SigLIP call was measured at 234,855 ms, which no
 * serverless function can outlast. The keep-warm cron exists to make that
 * rare, and `matchFinderSession` degrades to semantic-only rather than
 * failing when it still happens.
 *
 * POST, not GET, because it spends money and writes rows — it is not
 * idempotent in any sense a cache should act on.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const paramsSchema = z.object({ id: z.uuid() });

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return jsonError(400, "invalid session id");

  try {
    const outcome = await matchFinderSession(parsed.data.id);
    return jsonOk(outcome);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message.includes("not found")) {
      // 404, never 403 — docs/04 §5.1: distinguishing "exists but not yours"
      // from "does not exist" is an enumeration oracle.
      return jsonError(404, "session not found");
    }
    console.error("[tile-finder] match failed:", message);
    return jsonError(500, "matching failed");
  }
}
