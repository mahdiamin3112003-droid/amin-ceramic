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
  prismaClient ??= new PrismaClient();
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
