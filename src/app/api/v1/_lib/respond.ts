import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Shared response shaping for every `/api/v1/*` route.
 *
 * docs/04-api-architecture.md §19: the API boundary is authoritative — a
 * request that fails Zod parsing never reaches a use-case. `searchParamsToRecord`
 * exists because `URLSearchParams` isn't a plain object and Zod needs one.
 */
export function searchParamsToRecord(
  searchParams: URLSearchParams,
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    record[key] = value;
  }
  return record;
}

export function jsonOk(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: { message } }, { status });
}

/** Converts a Zod parse failure into the standard 400 response shape. */
export function jsonValidationError(error: ZodError): NextResponse {
  return NextResponse.json(
    { error: { message: "invalid request", issues: error.issues } },
    { status: 400 },
  );
}

export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}
