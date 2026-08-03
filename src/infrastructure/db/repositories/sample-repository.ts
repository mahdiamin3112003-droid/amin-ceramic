import type { Prisma } from "@prisma/client";

import { ensureVisitor } from "@/infrastructure/db/repositories/visitor-repository";

/**
 * Sample-ordering repository — `sample_request`/`sample_request_item`
 * (docs/03-database-design.md §7.5). The 3-per-visitor-per-30-days limit is
 * enforced by a database trigger (Phase 1), not here — a violation surfaces
 * as a Postgres error this function lets propagate, rather than
 * re-implementing the same rule at two layers that could drift apart.
 */

function generateReference(): string {
  const year = new Date().getFullYear();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `SR-${String(year)}-${String(suffix)}`;
}

export interface RequestSampleInput {
  readonly productId: string;
  readonly sampleType: "chip" | "full_tile" | "board";
  readonly quantity: number;
  readonly fulfilmentType: "ship" | "collect";
  readonly locationId?: string;
  readonly shippingAddressLine1?: string;
  readonly shippingCity?: string;
  readonly shippingCountryCode?: string;
}

export async function requestSample(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitorId: string,
  input: RequestSampleInput,
): Promise<{ reference: string }> {
  await ensureVisitor(tx, tenantId, visitorId);

  const sampleRequest = await tx.sampleRequest.create({
    data: {
      tenantId,
      visitorId,
      reference: generateReference(),
      fulfilmentType: input.fulfilmentType,
      locationId: input.locationId,
      shippingAddressLine1: input.shippingAddressLine1,
      shippingCity: input.shippingCity,
      shippingCountryCode: input.shippingCountryCode,
    },
  });

  await tx.sampleRequestItem.create({
    data: {
      sampleRequestId: sampleRequest.id,
      productId: input.productId,
      quantity: input.quantity,
      sampleType: input.sampleType,
    },
  });

  return { reference: sampleRequest.reference };
}
