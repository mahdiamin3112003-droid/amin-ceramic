import type { Location } from "@/domain/inventory/entity";
import { listActiveLocations as listActiveLocationsRepo } from "@/infrastructure/db/repositories/location-repository";
import {
  getRequestContext,
  withRequestContext,
} from "@/infrastructure/db/request-context";

/**
 * Public showroom/warehouse list — the sample-order dialog's "collect"
 * option and (eventually) a showroom locator. `location`'s SELECT policy is
 * tenant-scoped (not public like `tenant`'s — confirmed via `pg_policies`),
 * so this goes through `withRequestContext` like every other tenant-scoped
 * read.
 */
export interface ListLocationsResult {
  readonly locations: readonly Location[];
  readonly error: string | null;
}

export async function listActiveLocations(): Promise<ListLocationsResult> {
  try {
    const { tenantId } = await getRequestContext();
    const locations = await withRequestContext({ tenantId }, (tx) =>
      listActiveLocationsRepo(tx, tenantId),
    );
    return { locations, error: null };
  } catch (cause) {
    console.error("[inventory] list locations failed", cause);
    return {
      locations: [],
      error: cause instanceof Error ? cause.message : "unknown",
    };
  }
}
