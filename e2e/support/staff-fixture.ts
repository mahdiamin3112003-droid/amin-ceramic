import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    // Absent is fine — CI supplies the variables directly.
  }
}

/**
 * Throwaway staff accounts for the end-to-end suite.
 *
 * ── Why these are not "real" accounts ──
 * Every one is created inside the test, used for a few seconds, and deleted
 * in teardown. The address is random and lives under a reserved-invalid TLD
 * so it can never receive mail; the password is 32 random bytes that are
 * never written down, never reused, and gone when the process exits. They
 * exist so the authentication flow can be verified by machine forever
 * rather than by hand once.
 *
 * ── The deletion guard ──
 * `assertIsTestAccount` runs before every destructive call, and the suite
 * can only ever delete rows whose email matches `TEST_EMAIL_PREFIX` at a
 * `.invalid` domain. A bug in a test — or a copy-paste of this file into a
 * script — therefore cannot remove a real staff member. This is the one
 * piece of the fixture worth reading carefully.
 */

/** RFC 2606 reserves `.invalid`; nothing can ever be delivered to it. */
const TEST_EMAIL_DOMAIN = "e2e.invalid";
const TEST_EMAIL_PREFIX = "e2e-";

export interface TestStaff {
  readonly appUserId: string;
  readonly authUserId: string;
  readonly email: string;
  readonly password: string;
  readonly roleKey: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to run the e2e suite`);
  return value;
}

let adminClient: SupabaseClient | null = null;
function supabaseAdmin(): SupabaseClient {
  adminClient ??= createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return adminClient;
}

let prismaClient: PrismaClient | null = null;
function prisma(): PrismaClient {
  /**
   * The DIRECT connection (port 5432), not the pooler.
   *
   * The fixture does setup and teardown, not request-path work, so it has
   * no need of pgbouncer — and pointing it at the pooler makes it compete
   * with the application server for the same small connection allowance.
   * Under the full suite that surfaced as an intermittent "Can't reach
   * database server" in whichever test happened to be running, which reads
   * like a product failure and is not one.
   *
   * Falls back to the default datasource when DIRECT_URL is absent, so a
   * CI environment that only supplies one URL still works.
   *
   * Do NOT quietly fall back to the pooled `DATABASE_URL` when the direct
   * connection is down. That was tried: `DATABASE_URL` carries
   * `connection_limit=1`, so the fixture then competes with the application
   * server for a single connection and the run collapses — 26 failed and 32
   * never ran, none of it real. `global-setup.ts` probes this connection up
   * front and aborts the run instead.
   */
  if (!prismaClient) {
    const directUrl = process.env.DIRECT_URL;
    prismaClient = directUrl
      ? new PrismaClient({ datasources: { db: { url: directUrl } } })
      : new PrismaClient();
  }
  return prismaClient;
}

/**
 * The safety interlock. Nothing destructive runs without passing this.
 *
 * Deliberately paranoid: it checks the prefix AND the reserved domain, so
 * an address would have to be constructed specifically to look like a test
 * fixture in order to be deletable.
 */
function assertIsTestAccount(email: string): void {
  const isTest =
    email.startsWith(TEST_EMAIL_PREFIX) && email.endsWith(`@${TEST_EMAIL_DOMAIN}`);
  if (!isTest) {
    throw new Error(
      `refusing to touch "${email}" — the e2e suite may only delete ${TEST_EMAIL_PREFIX}*@${TEST_EMAIL_DOMAIN} accounts`,
    );
  }
}

export async function getTenantId(): Promise<string> {
  const tenant = await prisma().tenant.findFirst({
    where: { status: "active" },
    select: { id: true },
  });
  if (!tenant) throw new Error("no active tenant — run `pnpm db:seed`");
  return tenant.id;
}

/**
 * Create a staff account holding exactly one seeded role.
 *
 * `roleKey` is what makes the authorisation tests meaningful: a `viewer`
 * created here really does hold only the five read permissions the seed
 * gives that role, so asserting it CANNOT reach a write is a genuine test
 * of the permission system rather than of a mock.
 *
 * ── Call this from `beforeAll`, not `beforeEach` ──
 * One account per DESCRIBE BLOCK, not one per test. Every call is a
 * Supabase Auth admin write, and sustained churn makes Supabase answer
 * sign-ins for just-created accounts with `403 user_not_found` — which
 * surfaces as a sign-in that stalls until the test times out, on a
 * different test every run. Hoisting took the suite from 59 accounts per
 * run to roughly 23. Sign-in still belongs in `beforeEach`: each test gets
 * a fresh browser context and must establish its own session.
 *
 * The exception is a test that mutates the ACCOUNT rather than the data —
 * enrolling TOTP, suspending it, changing its role. Those keep a per-test
 * account, because a shared one would carry the mutation into the next
 * test and quietly stop testing anything. `auth-flow.spec.ts`'s two-factor
 * block is the worked example.
 */
export async function createTestStaff(roleKey: string): Promise<TestStaff> {
  const tenantId = await getTenantId();

  const role = await prisma().role.findUnique({
    where: { tenantId_key: { tenantId, key: roleKey } },
    select: { id: true },
  });
  if (!role) throw new Error(`role "${roleKey}" is not seeded`);

  const email = `${TEST_EMAIL_PREFIX}${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
  // 32 random bytes, base64url. Never logged, never persisted.
  const password = randomBytes(32).toString("base64url");
  assertIsTestAccount(email);

  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password,
    // No inbox exists at `.invalid`, so there is no confirmation to click.
    email_confirm: true,
  });
  if (error)
    throw new Error(`could not create the test auth user: ${error.message}`);

  // Wait for the new user to become READABLE before handing it to a test.
  //
  // `createUser` returning does not guarantee the next `signInWithPassword`
  // will find the account: under the load of the full suite — ~55 rapid
  // create/sign-in/delete cycles — Supabase intermittently answered a
  // sign-in for a just-created account with `403 user_not_found`, which
  // surfaced as a test failing on the login page for no visible reason.
  //
  // This is waiting for a write to become visible, not retrying a failure:
  // if the account never appears, the throw below is the honest outcome.
  await waitForAuthUser(data.user.id);

  const appUser = await prisma().appUser.create({
    data: {
      tenantId,
      authUserId: data.user.id,
      email,
      fullName: `E2E ${roleKey}`,
      userType: "staff",
      status: "active",
    },
    select: { id: true },
  });

  await prisma().userRole.create({
    data: { appUserId: appUser.id, roleId: role.id },
  });

  return {
    appUserId: appUser.id,
    authUserId: data.user.id,
    email,
    password,
    roleKey,
  };
}

/**
 * Poll until the admin API can read back a user it just created.
 *
 * Bounded and short — this covers propagation, not an outage. Roughly two
 * seconds in the worst case, and normally the first read succeeds.
 */
async function waitForAuthUser(authUserId: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { error } = await supabaseAdmin().auth.admin.getUserById(authUserId);
    if (!error) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`auth user ${authUserId} never became readable`);
}

/**
 * Remove an account and everything created alongside it.
 *
 * Order matters: the `app_user` row goes first so that a failure deleting
 * the auth user cannot leave an orphaned staff record that would still
 * resolve to a session.
 */
export async function deleteTestStaff(staff: TestStaff): Promise<void> {
  assertIsTestAccount(staff.email);

  // `deleteMany` rather than `delete`: teardown must be idempotent, because
  // it also runs after a test that failed partway through creating things.
  await prisma().userRole.deleteMany({ where: { appUserId: staff.appUserId } });
  await prisma().appUser.deleteMany({
    where: { id: staff.appUserId, email: staff.email },
  });

  const { error } = await supabaseAdmin().auth.admin.deleteUser(staff.authUserId);
  if (error && !/not found/i.test(error.message)) {
    throw new Error(`could not delete the test auth user: ${error.message}`);
  }
}

/**
 * Belt-and-braces sweep, run once after the whole suite.
 *
 * A worker killed mid-test leaves rows behind that its own teardown never
 * got to. Without this they accumulate in the project forever.
 */
export async function purgeAllTestStaff(): Promise<number> {
  const stale = await prisma().appUser.findMany({
    where: {
      email: { startsWith: TEST_EMAIL_PREFIX, endsWith: `@${TEST_EMAIL_DOMAIN}` },
    },
    select: { id: true, email: true, authUserId: true },
  });

  for (const row of stale) {
    assertIsTestAccount(row.email);
    await prisma().userRole.deleteMany({ where: { appUserId: row.id } });
    await prisma().appUser.deleteMany({ where: { id: row.id } });
    if (row.authUserId) {
      await supabaseAdmin()
        .auth.admin.deleteUser(row.authUserId)
        .catch(() => undefined);
    }
  }

  return stale.length;
}

/**
 * Taxonomy rows the suite created, swept the same way accounts are.
 *
 * The taxonomy specs create real vocabulary entries against the real
 * tenant. Without this they accumulate: after three runs the finish list
 * already carried three `e2e-*` rows that a merchandiser would have to
 * delete by hand.
 *
 * Same interlock as the account sweep: the `e2e-` prefix is required, so
 * this can only ever remove rows the suite made. A real finish named
 * "e2e-something" would have to be created deliberately to be at risk.
 */
const TEST_KEY_PREFIX = "e2e-";

const SWEEPABLE = [
  "material",
  "finish",
  "surfaceLook",
  "colorFamily",
  "application",
  "layoutPattern",
] as const;

/**
 * Collections the suite created, swept behind the same interlock.
 *
 * The specs create real collections against the real tenant, so without
 * this they accumulate the way the taxonomy rows did.
 */
export async function purgeTestCollections(): Promise<number> {
  const stale = await prisma().collection.findMany({
    where: { slug: { startsWith: TEST_KEY_PREFIX } },
    select: { id: true, slug: true },
  });

  for (const row of stale) {
    if (!row.slug.startsWith(TEST_KEY_PREFIX)) {
      throw new Error(`refusing to delete collection "${row.slug}"`);
    }
    // Translations cascade on delete.
    await prisma().collection.deleteMany({ where: { id: row.id } });
  }

  return stale.length;
}

export async function purgeTestTaxonomy(): Promise<number> {
  let removed = 0;

  for (const model of SWEEPABLE) {
    const delegate = (
      prisma() as unknown as Record<
        string,
        { deleteMany: (a: unknown) => Promise<{ count: number }> } | undefined
      >
    )[model];
    if (!delegate) continue;

    // Translations cascade on delete (onDelete: Cascade), so the parent row
    // is all that needs removing.
    const { count } = await delegate.deleteMany({
      where: { key: { startsWith: TEST_KEY_PREFIX } },
    });
    removed += count;
  }

  return removed;
}

/**
 * A throwaway quote request, with one line item.
 *
 * Same interlock idea as the accounts: the reference carries a fixed
 * prefix, and nothing without it can be deleted.
 *
 * The prefix has to satisfy the schema's own CHECK —
 * `^[A-Z]{2,4}-[0-9]{4}-[0-9]{3,6}$` — so it cannot simply be "E2E-".
 * `ZZ-9999-` conforms while being unmistakably synthetic: the real
 * generator issues `AC-<current year>-…`, and there will never be a
 * year 9999.
 */
const TEST_REFERENCE_PREFIX = "ZZ-9999-";

export interface TestQuote {
  readonly id: string;
  readonly reference: string;
  readonly visitorId: string;
}

function assertIsTestQuote(reference: string): void {
  if (!reference.startsWith(TEST_REFERENCE_PREFIX)) {
    throw new Error(
      `refusing to touch "${reference}" — the suite may only delete ${TEST_REFERENCE_PREFIX}* quote requests`,
    );
  }
}

export async function createTestQuoteRequest(status: string): Promise<TestQuote> {
  const tenantId = await getTenantId();
  // Six digits, matching the CHECK's `[0-9]{3,6}` tail.
  const serial = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  const reference = `${TEST_REFERENCE_PREFIX}${serial}`;
  assertIsTestQuote(reference);

  // A visitor row is required — `visitor_id` is NOT NULL because guests
  // quote too (docs/03 §11.1).
  const visitor = await prisma().visitor.create({
    data: { tenantId },
    select: { id: true },
  });

  // Any published product will do; the line item snapshots it anyway.
  const product = await prisma().product.findFirst({
    where: { tenantId, deletedAt: null },
    select: { id: true, sku: true, basePrice: true, currency: true },
  });
  if (!product) throw new Error("no products seeded — run `pnpm db:seed`");

  const quote = await prisma().quoteRequest.create({
    data: {
      tenantId,
      visitorId: visitor.id,
      reference,
      status: status as "submitted",
      contactName: "E2E Contact",
      contactEmail: "e2e@example.invalid",
      companyName: "E2E Testing Ltd",
      projectCity: "Beirut",
      source: "catalog",
      currency: product.currency,
      subtotal: 1000,
      totalAreaM2: 42.5,
      submittedAt: new Date(),
      items: {
        create: [
          {
            productId: product.id,
            quantityM2: 42.5,
            quantityBoxes: 30,
            skuSnapshot: product.sku,
            nameSnapshot: "E2E snapshot name",
            unitPriceSnapshot: product.basePrice ?? 25,
            currencySnapshot: product.currency,
            lineTotal: 1000,
          },
        ],
      },
    },
    select: { id: true },
  });

  return { id: quote.id, reference, visitorId: visitor.id };
}

export async function deleteTestQuoteRequest(quote: TestQuote): Promise<void> {
  assertIsTestQuote(quote.reference);

  // Items cascade from the request; the visitor is ours and goes too.
  await prisma().quoteRequest.deleteMany({
    where: { id: quote.id, reference: quote.reference },
  });
  await prisma().visitor.deleteMany({ where: { id: quote.visitorId } });
}

/** Sweep any quote requests a killed worker left behind. */
export async function purgeTestQuotes(): Promise<number> {
  const stale = await prisma().quoteRequest.findMany({
    where: { reference: { startsWith: TEST_REFERENCE_PREFIX } },
    select: { id: true, reference: true, visitorId: true },
  });

  for (const row of stale) {
    assertIsTestQuote(row.reference);
    await prisma().quoteRequest.deleteMany({ where: { id: row.id } });
    await prisma().visitor.deleteMany({ where: { id: row.visitorId } });
  }

  return stale.length;
}

/**
 * Quote requests the PUBLIC specs submitted through the real form.
 *
 * These cannot carry `TEST_REFERENCE_PREFIX`. The reference is minted by the
 * real generator inside the real Server Action — which is the entire point
 * of submitting through the UI rather than seeding a row — so it comes out
 * as a genuine `AC-<year>-…`. The interlock therefore moves to the contact
 * details, which the spec DOES control, and it requires BOTH the fixture's
 * name prefix AND the reserved `.invalid` domain, so a real enquiry cannot
 * match by accident.
 *
 * Unlike `purgeTestQuotes`, the visitor row is deliberately left behind.
 * A visitor that reached the public quote form always has a basket, and
 * `basket.visitor_id` is `onDelete: Restrict` — so deleting it would need a
 * cascade through basket, saved items and product views. That is a large
 * destructive surface to run in teardown for no benefit: visitors are
 * anonymous, the middleware mints one per browser session, and real traffic
 * produces them constantly. The quote requests are what matter, because
 * those surface on the admin board and would otherwise pollute a client demo.
 */
const TEST_SUBMISSION_NAME_PREFIX = "E2E Visitor";

/** The exact identity `public-quote.spec.ts` must submit with to stay sweepable. */
export const TEST_SUBMISSION_NAME = `${TEST_SUBMISSION_NAME_PREFIX} (automated)`;
export const TEST_SUBMISSION_EMAIL = `e2e-visitor@${TEST_EMAIL_DOMAIN}`;

function assertIsTestSubmission(name: string | null, email: string | null): void {
  // Both nullable in the schema, and both null fails closed — an unnamed
  // enquiry is exactly the kind of row this must never be allowed to delete.
  const isTest =
    (name ?? "").startsWith(TEST_SUBMISSION_NAME_PREFIX) &&
    (email ?? "").endsWith(`@${TEST_EMAIL_DOMAIN}`);
  if (!isTest) {
    throw new Error(
      `refusing to touch the quote request from "${name ?? "no name"}" <${email ?? "no email"}> — ` +
        `the suite may only delete "${TEST_SUBMISSION_NAME_PREFIX}*" submissions at @${TEST_EMAIL_DOMAIN}`,
    );
  }
}

export async function purgeSubmittedTestQuotes(): Promise<number> {
  const stale = await prisma().quoteRequest.findMany({
    where: {
      contactName: { startsWith: TEST_SUBMISSION_NAME_PREFIX },
      contactEmail: { endsWith: `@${TEST_EMAIL_DOMAIN}` },
    },
    select: { id: true, contactName: true, contactEmail: true },
  });

  for (const row of stale) {
    assertIsTestSubmission(row.contactName, row.contactEmail);
    await prisma().quoteRequest.deleteMany({ where: { id: row.id } });
  }

  return stale.length;
}

/** Read the TOTP factors Supabase holds for a user, via the admin API. */
export async function listFactors(
  authUserId: string,
): Promise<{ id: string; status: string }[]> {
  const { data, error } = await supabaseAdmin().auth.admin.mfa.listFactors({
    userId: authUserId,
  });
  if (error) throw new Error(`could not list factors: ${error.message}`);
  return data.factors.map((f) => ({ id: f.id, status: f.status }));
}

export async function disconnect(): Promise<void> {
  await prismaClient?.$disconnect();
  prismaClient = null;
}
