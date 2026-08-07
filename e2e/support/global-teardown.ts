import {
  disconnect,
  purgeAllTestStaff,
  purgeTestCollections,
  purgeSubmittedTestQuotes,
  purgeTestQuotes,
  purgeTestTaxonomy,
} from "./staff-fixture";

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
    const accounts = await purgeAllTestStaff();
    if (accounts > 0) {
      console.log(`[e2e] swept ${String(accounts)} leftover test account(s)`);
    }

    // The taxonomy specs create real vocabulary rows against the real
    // tenant; without this they accumulate run on run.
    const taxonomy = await purgeTestTaxonomy();
    if (taxonomy > 0) {
      console.log(`[e2e] swept ${String(taxonomy)} leftover taxonomy row(s)`);
    }

    const quotes = await purgeTestQuotes();
    if (quotes > 0) {
      console.log(`[e2e] swept ${String(quotes)} leftover quote request(s)`);
    }

    // The public specs submit through the real form, so these carry real
    // `AC-…` references and are matched on contact details instead.
    const submitted = await purgeSubmittedTestQuotes();
    if (submitted > 0) {
      console.log(`[e2e] swept ${String(submitted)} public quote submission(s)`);
    }

    const collections = await purgeTestCollections();
    if (collections > 0) {
      console.log(`[e2e] swept ${String(collections)} leftover collection(s)`);
    }
  } finally {
    await disconnect();
  }
}
