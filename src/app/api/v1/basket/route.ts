import { getBasket } from "@/application/use-cases/quote/get-basket";
import { jsonError, jsonOk } from "@/app/api/v1/_lib/respond";

/** `/api/v1/basket` — header badge / drawer hydration. `no-store`: the visitor's own basket must never be served stale or shared across sessions. */
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const { basket, error } = await getBasket();
  if (error) return jsonError(500, "failed to load basket");
  return jsonOk(basket, { headers: { "Cache-Control": "no-store" } });
}
