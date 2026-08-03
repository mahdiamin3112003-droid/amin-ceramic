import type { QuoteSubmissionResult } from "@/domain/quote/entity";
import { listActiveLocations } from "@/infrastructure/db/repositories/location-repository";
import { submitQuoteRequest as submitQuoteRequestRepo } from "@/infrastructure/db/repositories/quote-repository";
import {
  getRequestContext,
  withRequestContext,
} from "@/infrastructure/db/request-context";

export interface SubmitQuoteRequest {
  readonly contactName: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly companyName?: string;
  readonly notes?: string;
  readonly source:
    | "catalog"
    | "tile_finder"
    | "assistant"
    | "project"
    | "showroom"
    | "whatsapp"
    | "direct";
}

/**
 * `wa.me` needs bare digits, no `+`/spaces/dashes — `location.whatsapp`
 * (docs/03-database-design.md §6.2) is stored as entered by staff, so this
 * strips everything else rather than assuming a format.
 */
function buildWhatsAppLink(
  whatsapp: string,
  reference: string,
  message: string,
): string {
  const digits = whatsapp.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(`${message} ${reference}`)}`;
}

/**
 * `/basket/request` — draft → submitted (docs/04-api-architecture.md §11.2).
 * Throws on failure (empty basket, no draft, RLS rejection); the Server
 * Action layer (task #33) is responsible for turning that into form
 * feedback.
 *
 * `whatsappDeepLink` uses the first active public location that has a
 * `whatsapp` number set (`location.whatsapp`, docs/03-database-design.md
 * §6.2) — the number lives per-location (a showroom's own WhatsApp line),
 * not on `Tenant`, which carries no contact fields by design. Null when no
 * location has one configured, same degrade-don't-fail shape as everywhere
 * else — the confirmation page simply omits the button.
 */
export async function submitQuoteRequest(
  input: SubmitQuoteRequest,
): Promise<QuoteSubmissionResult> {
  const { tenantId, visitorId } = await getRequestContext();
  if (!visitorId) throw new Error("visitor session unavailable");

  // Both operations share the one transaction `withRequestContext` opens —
  // a second, separate `withRequestContext` call here would be safe
  // (sequential awaits don't race the pool the way Promise.all does), but
  // sharing the transaction is still the better shape: one round trip, and
  // the WhatsApp-link lookup reads consistently with the just-written quote.
  return withRequestContext({ tenantId, visitorId }, async (tx) => {
    const result = await submitQuoteRequestRepo(tx, tenantId, visitorId, {
      contactName: input.contactName,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      companyName: input.companyName,
      notes: input.notes,
      source: input.source,
    });

    const locations = await listActiveLocations(tx, tenantId);
    const withWhatsapp = locations.find((location) => location.whatsapp !== null);
    const whatsappDeepLink = withWhatsapp?.whatsapp
      ? buildWhatsAppLink(
          withWhatsapp.whatsapp,
          result.reference,
          "Hi, I'd like to follow up on quote request",
        )
      : null;

    return { ...result, whatsappDeepLink };
  });
}
