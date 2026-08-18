import { z } from "zod";

import { jsonError, jsonOk } from "@/app/api/v1/_lib/respond";
import { isTileFinderEnabled } from "@/lib/feature-flags";
import { getFinderSession } from "@/application/use-cases/ai/find-tile";

/**
 * `GET /api/ai/tile-finder/[id]` — the persisted session behind the
 * shareable results URL (`prisma/ai.prisma` §9.2: "id is shareable").
 *
 * Cheap and side-effect free: it reads rows the match call already wrote and
 * spends nothing, so a shared link costs no model time no matter how often
 * it is opened.
 */
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Fail closed — 404, not 403: a 403 would confirm the endpoint exists.
  // This is the switch that keeps the feature dark through a deploy.
  if (!isTileFinderEnabled()) return jsonError(404, "not found");

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return jsonError(400, "invalid session id");

  const session = await getFinderSession(parsed.data.id);
  if (!session) return jsonError(404, "session not found");

  return jsonOk(session);
}
