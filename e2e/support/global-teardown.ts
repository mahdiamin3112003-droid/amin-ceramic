import { disconnect, purgeAllTestStaff } from "./staff-fixture";

/**
 * Last line of defence against leaked fixtures.
 *
 * Per-test teardown handles the normal path. This catches the abnormal one
 * — a worker killed mid-run, a machine that lost power, a spec that threw
 * before its `afterEach` was registered — so throwaway accounts can never
 * accumulate in the Supabase project across runs.
 */
export default async function globalTeardown(): Promise<void> {
  try {
    const purged = await purgeAllTestStaff();
    if (purged > 0) {
      console.log(`[e2e] swept ${String(purged)} leftover test account(s)`);
    }
  } finally {
    await disconnect();
  }
}
